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

const TEST_GROUP = process.env.QQ_TEST_GROUP || '164461995'
const TEST_VIDEO = resolve(process.env.TEST_VIDEO || '/tmp/test_video_v3.mp4')

async function main() {
  const ctx = new Context()
  ctx.plugin(LoggerService, { bufferSize: 0 })
  ctx.plugin(TimerService)
  ctx.plugin(ConfigService)
  ctx.plugin(QQProtocolClient)
  ctx.plugin(NTQQUserApi)
  ctx.plugin(NTQQGroupApi)
  ctx.plugin(NTQQFriendApi)
  ctx.plugin(NTQQMsgApi)
  ctx.plugin(NTQQFileApi)
  ctx.plugin(NTQQSystemApi)
  ctx.plugin(NTLoginApi)
  await new Promise<void>(r => ctx.inject(['qqProtocol'], (c) => c.qqProtocol.initDirectClient().then(() => r())))
  await new Promise(r => setTimeout(r, 2000))
  if (!selfInfo.uin) { console.error('Not logged in'); process.exit(1) }
  console.log(`\nLogged in as ${selfInfo.uin}; sending video ${TEST_VIDEO} to group ${TEST_GROUP}`)
  const peer = { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }
  const elem = await SendElement.video(ctx, TEST_VIDEO)
  const t0 = Date.now()
  const sent = await ctx.ntMsgApi.sendMsg(peer, [elem])
  console.log(`done in ${Date.now() - t0}ms`)
  console.log('result:', JSON.stringify({ msgId: sent.msgId, msgSeq: sent.msgSeq, msgRandom: sent.msgRandom }))
  console.log('\n→ 群里 random=' + sent.msgRandom + ' 应该看到这条视频，且能正常播放')
  await new Promise(r => setTimeout(r, 3000))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
