import { Context } from 'cordis'
import LoggerService from '@cordisjs/plugin-logger'
import TimerService from '@cordisjs/plugin-timer'
import ConfigService from '../src/main/config'
import { QQProtocolClient } from '../src/main/qqProtocol'
import { NTQQUserApi, NTQQGroupApi, NTQQFriendApi, NTQQMsgApi, NTQQFileApi, NTQQSystemApi, NTLoginApi } from '../src/ntqqapi/api'
import { selfInfo } from '../src/common/globalVars'
import { ChatType, ElementType } from '../src/ntqqapi/types'
import { resolve } from 'node:path'
import { statSync } from 'node:fs'
import { request } from 'node:https'

const TEST_GROUP = process.env.QQ_TEST_GROUP || '164461995'
const TEST_VIDEO = resolve(process.env.TEST_VIDEO!)
const TEST_THUMB = resolve(process.env.TEST_THUMB!)

function probeUrl(url: string, range = 'bytes=0-1023'): Promise<{status: number, headers: any}> {
  return new Promise(res => {
    const req = request(url, { method: 'GET', timeout: 30000, headers: { Range: range } }, r => {
      const chunks: Buffer[] = []
      r.on('data', c => chunks.push(c))
      r.on('end', () => res({ status: r.statusCode || 0, headers: r.headers }))
    })
    req.on('error', () => res({ status: -1, headers: {} }))
    req.end()
  })
}

async function main() {
  const ctx = new Context()
  ctx.plugin(LoggerService, { bufferSize: 0 })
  ctx.plugin(TimerService); ctx.plugin(ConfigService); ctx.plugin(QQProtocolClient)
  ctx.plugin(NTQQUserApi); ctx.plugin(NTQQGroupApi); ctx.plugin(NTQQFriendApi); ctx.plugin(NTQQMsgApi); ctx.plugin(NTQQFileApi); ctx.plugin(NTQQSystemApi); ctx.plugin(NTLoginApi)
  await new Promise<void>(r => ctx.inject(['qqProtocol'], (c) => c.qqProtocol.initDirectClient().then(() => r())))
  await new Promise(r => setTimeout(r, 2000))
  const upResult = await ctx.ntFileApi.uploadGroupVideo(TEST_GROUP, TEST_VIDEO, TEST_THUMB)
  const { Media } = await import('../src/ntqqapi/proto')
  const decoded = Media.MsgInfo.decode(Buffer.from(upResult.msgInfo))
  console.log('main fileUuid:', decoded.msgInfoBody[0].index.fileUuid.slice(0, 30))
  console.log('thumb fileUuid:', decoded.msgInfoBody[1].index.fileUuid.slice(0, 30))
  console.log('main IndexNode info:', JSON.stringify(decoded.msgInfoBody[0].index.info, null, 2))
  console.log('thumb IndexNode info:', JSON.stringify(decoded.msgInfoBody[1].index.info, null, 2))
  console.log('compat hex (first 600):', Buffer.from(upResult.compat).slice(0, 600).toString('hex'))
  console.log('compat decode VideoFile:', JSON.stringify(
    (await import('../src/ntqqapi/proto')).Msg.VideoFileMsg.decode(Buffer.from(upResult.compat)),
    (_k, v) => v?.type === 'Buffer' ? `<${v.data?.length || v.length}B>` : v, 2
  ).slice(0, 1500))
  await new Promise(r => setTimeout(r, 5000))
  for (const delay of [0, 5, 15, 30, 60]) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay * 1000))
    const dl = await (ctx as any).qqProtocol.getGroupVideoUrl(decoded.msgInfoBody[0].index, +TEST_GROUP)
    const url = `https://${dl.download?.info?.domain}${dl.download?.info?.urlPath}${dl.download?.rKeyParam}`
    const probe = await probeUrl(url)
    console.log(`t+~${5 + (delay > 0 ? delay : 0)}s: main video: status=${probe.status} CR=${probe.headers['content-range']}`)
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
