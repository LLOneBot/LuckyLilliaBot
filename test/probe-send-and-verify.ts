/**
 * 完整流程：上传 → 发消息 → probe 真实 URL
 * 自己读 url 验证，不让用户看群
 */
import { Context } from 'cordis'
import LoggerService from '@cordisjs/plugin-logger'
import TimerService from '@cordisjs/plugin-timer'
import ConfigService from '../src/main/config'
import { QQProtocolClient } from '../src/main/qqProtocol'
import {
  NTQQUserApi, NTQQGroupApi, NTQQFriendApi, NTQQMsgApi, NTQQFileApi,
  NTQQSystemApi, NTLoginApi,
} from '../src/ntqqapi/api'
import { selfInfo } from '../src/common/globalVars'
import { ChatType } from '../src/ntqqapi/types'
import { SendElement } from '../src/ntqqapi/entities'
import { resolve } from 'node:path'
import { request } from 'node:https'

const TEST_GROUP = process.env.QQ_TEST_GROUP || '164461995'
const TEST_VIDEO = resolve(process.env.TEST_VIDEO || '.tmp/v37.mp4')

function probeUrl(url: string, range = 'bytes=0-1023'): Promise<{ status: number, body: Buffer, headers: Record<string, any> }> {
  return new Promise((res) => {
    const req = request(url, { method: 'GET', timeout: 30000, headers: { 'Range': range } }, (r) => {
      const chunks: Buffer[] = []
      r.on('data', c => chunks.push(c))
      r.on('end', () => {
        res({ status: r.statusCode || 0, body: Buffer.concat(chunks), headers: r.headers as any })
      })
    })
    req.on('error', () => res({ status: -1, body: Buffer.alloc(0), headers: {} }))
    req.on('timeout', () => { req.destroy(); res({ status: -2, body: Buffer.alloc(0), headers: {} }) })
    req.end()
  })
}

async function main() {
  const ctx = new Context()
  ctx.plugin(LoggerService, { bufferSize: 0 })
  ctx.plugin(TimerService)
  ctx.plugin(ConfigService)
  ctx.plugin(QQProtocolClient)
  ctx.plugin(NTQQUserApi); ctx.plugin(NTQQGroupApi); ctx.plugin(NTQQFriendApi)
  ctx.plugin(NTQQMsgApi); ctx.plugin(NTQQFileApi); ctx.plugin(NTQQSystemApi); ctx.plugin(NTLoginApi)
  await new Promise<void>(r => ctx.inject(['qqProtocol'], (c) => c.qqProtocol.initDirectClient().then(() => r())))
  await new Promise(r => setTimeout(r, 2000))
  if (!selfInfo.uin) { console.error('Not logged in'); process.exit(1) }

  const peer = { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }
  const elem = await SendElement.video(ctx, TEST_VIDEO)

  // 直接调 uploadGroupVideo，拿到真实的 msgInfo（也即真实的 fileUuid）
  const thumbPath = (elem.videoElement?.thumbPath instanceof Map)
    ? [...elem.videoElement.thumbPath.values()][0]
    : ''
  const upResult = await ctx.ntFileApi.uploadGroupVideo(TEST_GROUP, elem.videoElement!.filePath!, thumbPath)
  const { Media, Msg } = await import('../src/ntqqapi/proto')
  const decoded = Media.MsgInfo.decode(Buffer.from(upResult.msgInfo))
  const mainFileUuid = decoded.msgInfoBody[0].index.fileUuid
  console.log(`upload+highway done, mainFileUuid=${mainFileUuid.slice(0, 40)}..., compat len=${upResult.compat?.length || 0}`)

  // 自己发消息：commonElem + videoFile（用真实 upResult，跟 msg.ts 一致）
  const elems: any[] = [
    {
      commonElem: {
        serviceType: 48,
        pbElem: Buffer.from(upResult.msgInfo),
        businessType: 21,
      }
    }
  ]
  if (upResult.compat && upResult.compat.length > 0) {
    elems.push({ videoFile: Buffer.from(upResult.compat) })
  }
  const data = Msg.PbSendMsg.encode({
    routingHead: { group: { groupCode: +TEST_GROUP } },
    contentHead: { pkgNum: 1, pkgIndex: 0, divSeq: 0, autoReply: 0 },
    body: { richText: { elems } },
    clientSequence: 10000 + Math.floor(Math.random() * 90000),
    random: Math.floor(Math.random() * 0xFFFFFFFF),
  })
  console.log('sending raw PbSendMsg...')
  const res = await (ctx as any).qqProtocol.sendPB('MessageSvc.PbSendMsg', data)
  const resp = Msg.PbSendMsgResp.decode(Buffer.from(res.pb, 'hex'))
  console.log(`msg sent: resultCode=${resp.resultCode} sequence=${resp.sequence} clientSequence=${resp.clientSequence}`)

  // 给 server 时间归档
  for (let wait = 0; wait < 6; wait++) {
    const sec = wait === 0 ? 3 : 8
    await new Promise(r => setTimeout(r, sec * 1000))
    const dl = await (ctx as any).qqProtocol.getGroupVideoUrl(decoded.msgInfoBody[0].index, +TEST_GROUP)
    const url = `https://${dl.download?.info?.domain}${dl.download?.info?.urlPath}${dl.download?.rKeyParam}`
    const probe = await probeUrl(url)
    const ok = probe.status === 200 || probe.status === 206
    console.log(`t+${(wait + 1) === 1 ? sec : 3 + (wait * 8)}s: status=${probe.status} len=${probe.body.length} CL=${probe.headers['content-length']} CR=${probe.headers['content-range']} CT=${probe.headers['content-type']} body=${ok ? probe.body.slice(0, 16).toString('hex') : probe.body.slice(0, 100).toString()}`)
    if (ok) {
      // 完整下载验证
      console.log('--- 全文件下载验证 ---')
      const totalLen = parseInt(probe.headers['content-range']?.split('/')[1] || probe.headers['content-length'] || '0')
      const full = await probeUrl(url, `bytes=0-${totalLen - 1}`)
      console.log(`full download: status=${full.status} got=${full.body.length} expect=${totalLen}`)
      const { createHash } = await import('node:crypto')
      const md5 = createHash('md5').update(full.body).digest('hex')
      const fs = await import('node:fs')
      const localBuf = fs.readFileSync(TEST_VIDEO)
      const localMd5 = createHash('md5').update(localBuf).digest('hex')
      console.log(`md5 cdn=${md5}`)
      console.log(`md5 local=${localMd5}`)
      console.log(`mp4 magic (ftyp at 4-8)? ${full.body.slice(4, 8).toString()} (expect 'ftyp')`)
      console.log(`match=${md5 === localMd5 ? '✓ FULL MATCH' : '✗ DIFFERS'}`)
      break
    }
  }

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
