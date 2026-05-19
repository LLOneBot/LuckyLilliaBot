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
import { ChatType, ElementType } from '../src/ntqqapi/types'
import { resolve } from 'node:path'
import { statSync } from 'node:fs'

const TEST_GROUP = process.env.QQ_TEST_GROUP || '164461995'
const TEST_C2C_UIN = process.env.QQ_TEST_C2C  // 设了就走 C2C，否则走 group
const TEST_VIDEO = resolve(process.env.TEST_VIDEO || '.tmp/v31.mp4')
const TEST_THUMB = resolve(process.env.TEST_THUMB || '.tmp/thumbs/uniq_1.jpg')

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

  console.log(`video=${TEST_VIDEO} thumb=${TEST_THUMB}`)
  console.log(`thumb size=${statSync(TEST_THUMB).size}`)

  let peer: { chatType: ChatType, peerUid: string, guildId: string }
  if (TEST_C2C_UIN) {
    let targetUid = process.env.QQ_TEST_C2C_UID
    if (!targetUid) {
      // 尝试从群成员列表查（对方需要在 TEST_GROUP 里）
      targetUid = await ctx.ntUserApi.getUidByUin(TEST_C2C_UIN, TEST_GROUP)
    }
    if (!targetUid) {
      console.error(`Cannot resolve uid for uin=${TEST_C2C_UIN}. Set QQ_TEST_C2C_UID env directly`)
      process.exit(1)
    }
    console.log(`C2C target: uin=${TEST_C2C_UIN} uid=${targetUid}`)
    peer = { chatType: ChatType.C2C, peerUid: targetUid, guildId: '' }
  } else {
    peer = { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }
  }
  // 手工构造 video element（绕过 SendElement.video 的默认占位逻辑）
  const elem = {
    elementType: ElementType.Video,
    elementId: '',
    extBufForUI: '',
    videoElement: {
      filePath: TEST_VIDEO,
      fileName: TEST_VIDEO.split(/[/\\]/).pop()!,
      thumbPath: new Map([[0, TEST_THUMB]]),
      thumbSize: statSync(TEST_THUMB).size,
      thumbWidth: 1920,
      thumbHeight: 1080,
      fileTime: 15,
      fileSize: String(statSync(TEST_VIDEO).size),
    } as any,
  }
  const sent = await ctx.ntMsgApi.sendMsg(peer, [elem as any])
  console.log(`sent: msgRandom=${sent.msgRandom} msgSeq=${sent.msgSeq}`)
  await new Promise(r => setTimeout(r, 3000))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
