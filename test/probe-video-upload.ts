/**
 * 上传视频并立即查 download URL，验证主视频是否真在 server 上。
 */

import { Context } from 'cordis'
import LoggerService from '@cordisjs/plugin-logger'
import TimerService from '@cordisjs/plugin-timer'
import ConfigService from '../src/main/config'
import { QQProtocolClient } from '../src/main/qqProtocol'
import { NTQQUserApi, NTQQGroupApi, NTQQFriendApi, NTQQMsgApi, NTQQFileApi, NTQQSystemApi, NTLoginApi } from '../src/ntqqapi/api'
import { selfInfo } from '../src/common/globalVars'
import { resolve } from 'node:path'
import { request } from 'node:https'
import { request as httpReq } from 'node:http'

const TEST_GROUP = process.env.QQ_TEST_GROUP || '164461995'
const TEST_VIDEO = resolve(process.env.TEST_VIDEO || '.tmp/v19.mp4')

function probeUrl(url: string): Promise<{ status: number, len: number, body: string }> {
  return new Promise((res) => {
    const u = new URL(url)
    const fn = u.protocol === 'https:' ? request : httpReq
    const req = fn(url, { method: 'GET', timeout: 8000, headers: { 'Range': 'bytes=0-1023' } }, (r) => {
      const chunks: Buffer[] = []
      r.on('data', c => chunks.push(c))
      r.on('end', () => {
        const all = Buffer.concat(chunks)
        const len = parseInt(r.headers['content-length'] || '0', 10) || all.length
        res({ status: r.statusCode || 0, len, body: all.slice(0, 200).toString() })
      })
    })
    req.on('error', () => res({ status: -1, len: 0, body: '' }))
    req.on('timeout', () => { req.destroy(); res({ status: -2, len: 0, body: '' }) })
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

  // Pre-generate thumb via SendElement.video so a thumb file exists
  const { SendElement } = await import('../src/ntqqapi/entities')
  const elem = await SendElement.video(ctx as any, TEST_VIDEO)
  const thumbPath = (elem.videoElement?.thumbPath instanceof Map)
    ? [...elem.videoElement.thumbPath.values()][0]
    : ''
  if (!thumbPath) throw new Error('no thumb')
  console.log('thumb path:', thumbPath)

  // 上传视频，拿 fileUuid
  const result = await (ctx as any).qqProtocol.getGroupVideoUploadInfo(TEST_GROUP, elem.videoElement?.filePath, thumbPath)
  // 打 OIDB upload 响应所有顶层字段
  console.log('--- OIDB upload resp keys ---')
  console.log('result keys:', Object.keys(result))
  console.log('compat length:', result.compat?.length || 0, 'first 50 hex:', result.compat ? Buffer.from(result.compat).slice(0, 50).toString('hex') : '(empty)')
  console.log('ext:', JSON.stringify(result.ext, (_k, v) =>
    Buffer.isBuffer(v) || v?.type === 'Buffer' ? `<${v.length || v.data?.length}B>` : v).slice(0, 2000))
  console.log('subExt:', JSON.stringify(result.subExt, (_k, v) =>
    Buffer.isBuffer(v) || v?.type === 'Buffer' ? `<${v.length || v.data?.length}B>` : v).slice(0, 2000))
  console.log('---')
  const msgInfo = (ctx as any).qqProtocol.constructor.prototype  // ignore, just decode
  const { Media } = await import('../src/ntqqapi/proto')
  const decoded = Media.MsgInfo.decode(Buffer.from(result.info))
  const mainUuid = decoded.msgInfoBody[0].index.fileUuid
  const thumbUuid = decoded.msgInfoBody[1].index.fileUuid
  console.log('main fileUuid:', mainUuid)
  console.log('thumb fileUuid:', thumbUuid)
  console.log('main uKey set:', !!result.ext?.uKey, 'len=', result.ext?.uKey?.length || 0)
  console.log('thumb uKey set:', !!result.subExt?.uKey, 'len=', result.subExt?.uKey?.length || 0)

  // 上传 highway
  const { HighwayTcpSession, HighwayHttpSession } = await import('../src/ntqqapi/helper/highway')
  const highwaySession = await (ctx as any).qqProtocol.getHighwaySession()
  const fs = await import('node:fs')
  const { calculateSha1StreamBytes } = await import('../src/common/utils/file')

  if (result.ext.uKey) {
    const { index } = result.ext.msgInfoBody[0]
    result.ext.hash.fileSha1 = (await calculateSha1StreamBytes(TEST_VIDEO)).map(b => Buffer.from(b))
    const trans = {
      uin: selfInfo.uin, cmd: 1001,
      readable: fs.createReadStream(TEST_VIDEO, { highWaterMark: 1024 * 1024 }),
      sum: Buffer.from(index.info.md5HexStr, 'hex'),
      size: index.info.fileSize,
      ticket: highwaySession.sigSession,
      loginSig: highwaySession.loginSig,
      ext: Media.NTV2RichMediaHighwayExt.encode(result.ext),
      server: highwaySession.highwayHostAndPorts[1][0].host,
      port: highwaySession.highwayHostAndPorts[1][0].port,
    }
    try {
      if (process.env.FORCE_HTTP) throw new Error('FORCE_HTTP set, skip TCP')
      await new HighwayTcpSession(trans).upload()
      console.log('main highway TCP upload OK')
    } catch (e) {
      console.log('TCP failed, fallback HTTP:', (e as Error).message)
      const trans2 = { ...trans, readable: fs.createReadStream(TEST_VIDEO, { highWaterMark: 1024 * 1024 }) }
      await new HighwayHttpSession(trans2).upload()
      console.log('main highway HTTP upload OK')
    }
  }

  // 上传完后多等几次，看 server 异步归档
  for (let wait = 0; wait < 4; wait++) {
    const sec = wait === 0 ? 3 : 10
    console.log(`\n--- wait ${sec}s then probe ---`)
    await new Promise(r => setTimeout(r, sec * 1000))
    const dl = await (ctx as any).qqProtocol.getGroupVideoUrl(decoded.msgInfoBody[0].index, +TEST_GROUP)
    if (wait === 0) {
      console.log('full dl resp:', JSON.stringify(dl, (_k, v) => Buffer.isBuffer(v) || v?.type === 'Buffer' ? `<${v.length || v.data?.length}B>` : v).slice(0, 1000))
    }
    const url = `https://${dl.download?.info?.domain}${dl.download?.info?.urlPath}${dl.download?.rKeyParam}`
    const probe = await probeUrl(url)
    console.log(`after ${(wait + 1) * sec}s total: status=${probe.status} body=${probe.body.slice(0, 80)}`)
    if (probe.status === 200 || probe.status === 206) {
      console.log('✓ 主视频文件已归档!')
      break
    }
  }

  // 现在发送消息引用刚上传的视频，然后再 probe 一次
  if (process.env.SEND_MSG) {
    console.log('\n--- 发送视频消息 ---')
    const { ChatType } = await import('../src/ntqqapi/types')
    const ntMsgApi = (ctx as any).ntMsgApi
    const peer = { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }
    const sent = await ntMsgApi.sendMsg(peer, [elem])
    console.log('msg sent:', JSON.stringify({ msgId: sent.msgId, msgSeq: sent.msgSeq, msgRandom: sent.msgRandom }))
    console.log('--- 发完消息后再等 5s probe ---')
    await new Promise(r => setTimeout(r, 5000))
    const dl = await (ctx as any).qqProtocol.getGroupVideoUrl(decoded.msgInfoBody[0].index, +TEST_GROUP)
    const url = `https://${dl.download?.info?.domain}${dl.download?.info?.urlPath}${dl.download?.rKeyParam}`
    const probe = await probeUrl(url)
    console.log(`after msg-sent + 5s: status=${probe.status} body=${probe.body.slice(0, 80)}`)
  }

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
