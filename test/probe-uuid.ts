import { Context } from 'cordis'
import LoggerService from '@cordisjs/plugin-logger'
import TimerService from '@cordisjs/plugin-timer'
import ConfigService from '../src/main/config'
import { QQProtocolClient } from '../src/main/qqProtocol'
import { NTQQUserApi, NTQQGroupApi, NTQQFriendApi, NTQQMsgApi, NTQQFileApi, NTQQSystemApi, NTLoginApi } from '../src/ntqqapi/api'
import { selfInfo } from '../src/common/globalVars'
import { request } from 'node:https'

const TEST_GROUP = '164461995'
const MAIN_UUID = process.env.MAIN_UUID!
const THUMB_UUID = process.env.THUMB_UUID!

function probe(url: string) {
  return new Promise<{status: number, headers: any}>(res => {
    const req = request(url, { method: 'GET', timeout: 10000, headers: { Range: 'bytes=0-1023' } }, r => {
      r.on('data', () => {})
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
  // probe main video URL
  const dl1 = await (ctx as any).qqProtocol.getGroupVideoUrl({ fileUuid: MAIN_UUID, storeID: 1, uploadTime: 0, expire: 0, type: 0 }, +TEST_GROUP)
  const url1 = `https://${dl1.download?.info?.domain}${dl1.download?.info?.urlPath}${dl1.download?.rKeyParam}`
  console.log(`main url: ${url1.slice(0, 100)}...`)
  const p1 = await probe(url1)
  console.log(`main video probe: status=${p1.status} CR=${p1.headers['content-range']}`)
  // probe thumb URL via group image url
  const url2raw = await (ctx as any).qqProtocol.getGroupImageUrl(+TEST_GROUP, { fileUuid: THUMB_UUID, storeID: 1, uploadTime: 0, expire: 0, type: 100 })
  console.log(`thumb url: ${url2raw.slice(0, 120)}...`)
  const p2 = await probe(url2raw)
  console.log(`thumb image probe: status=${p2.status} CR=${p2.headers['content-range']}`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
