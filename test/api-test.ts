/**
 * 全 API 测试脚本：直连模式下对所有 NT API 跑一遍，验证返回数据。
 *
 * 用法：
 *   QQ_TEST_GROUP=164461995 QQ_TEST_UID=u_xxx QQ_TEST_UIN=379450326 \
 *     QQ_TEST_FRIEND_UID=u_yyy QQ_TEST_FRIEND_UIN=12345 \
 *     npx tsx test/api-test.ts
 *
 *   # 加 RUN_DESTRUCTIVE=1 才会跑会改服务器状态的 API（默认跳过）
 *   RUN_DESTRUCTIVE=1 QQ_TEST_GROUP=... npx tsx test/api-test.ts
 */

import { Context } from 'cordis'
import LoggerService from '@cordisjs/plugin-logger'
import TimerService from '@cordisjs/plugin-timer'
import ConfigService from '../src/main/config'
import { QQProtocolClient } from '../src/main/qqProtocol'
import {
  NTQQUserApi,
  NTQQGroupApi,
  NTQQFriendApi,
  NTQQMsgApi,
  NTQQFileApi,
  NTQQSystemApi,
  NTLoginApi,
} from '../src/ntqqapi/api'
import { selfInfo } from '../src/common/globalVars'
import { ChatType } from '../src/ntqqapi/types'

const TEST_GROUP = process.env.QQ_TEST_GROUP || '164461995'
const TEST_UID = process.env.QQ_TEST_UID || 'u_snYxnEfja-Po_cdFcyccRQ'
const TEST_UIN = process.env.QQ_TEST_UIN || '379450326'
const TEST_FRIEND_UID = process.env.QQ_TEST_FRIEND_UID || TEST_UID
const TEST_FRIEND_UIN = process.env.QQ_TEST_FRIEND_UIN || TEST_UIN
const RUN_DESTRUCTIVE = process.env.RUN_DESTRUCTIVE === '1'

type Status = 'PASS' | 'FAIL' | 'SKIP'
interface Result {
  name: string
  status: Status
  detail: string
  duration: number
}
const results: Result[] = []

const COLOR = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
}

function summarize(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (Array.isArray(value)) return `Array(len=${value.length})`
  if (value instanceof Map) return `Map(size=${value.size})`
  if (value instanceof Set) return `Set(size=${value.size})`
  if (Buffer.isBuffer(value)) return `Buffer(len=${value.length})`
  if (typeof value === 'object') {
    const keys = Object.keys(value as object).slice(0, 6).join(',')
    return `Object{${keys}${Object.keys(value as object).length > 6 ? ',...' : ''}}`
  }
  if (typeof value === 'string' && value.length > 80) return `String(len=${value.length})`
  return String(value)
}

async function run(
  name: string,
  fn: () => Promise<unknown>,
  options: {
    /** 检查返回值是否符合预期。返回 true=通过，false 或 string=失败（string 是失败原因） */
    check?: (value: any) => boolean | string
    destructive?: boolean
  } = {},
): Promise<void> {
  if (options.destructive && !RUN_DESTRUCTIVE) {
    results.push({ name, status: 'SKIP', detail: '(destructive, set RUN_DESTRUCTIVE=1)', duration: 0 })
    console.log(COLOR.gray(`SKIP  ${name}  (destructive)`))
    return
  }
  const t0 = Date.now()
  try {
    const value = await fn()
    const duration = Date.now() - t0
    let detail = summarize(value)
    if (options.check) {
      const checked = options.check(value)
      if (checked !== true) {
        const reason = typeof checked === 'string' ? checked : 'check failed'
        results.push({ name, status: 'FAIL', detail: `${reason} | ${detail}`, duration })
        console.log(COLOR.red(`FAIL  ${name}  ${duration}ms`), COLOR.gray(`(${reason})`), detail)
        return
      }
    }
    results.push({ name, status: 'PASS', detail, duration })
    console.log(COLOR.green(`PASS  ${name}  ${duration}ms`), COLOR.gray(detail))
  } catch (e) {
    const duration = Date.now() - t0
    const msg = (e as Error).message || String(e)
    results.push({ name, status: 'FAIL', detail: msg, duration })
    console.log(COLOR.red(`FAIL  ${name}  ${duration}ms`), COLOR.gray(msg))
  }
}

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

  await new Promise<void>(resolve => {
    ctx.inject(['qqProtocol'], (ctx) => {
      ctx.qqProtocol.initDirectClient().then(() => resolve())
    })
  })

  await new Promise(r => setTimeout(r, 2000))

  if (!selfInfo.uin) {
    console.log(COLOR.red('Not logged in. Run main.ts first to save session.'))
    process.exit(1)
  }

  console.log(COLOR.cyan(`\n=== Logged in as ${selfInfo.uin} (uid=${selfInfo.uid}) ===`))
  console.log(COLOR.cyan(`Test config: GROUP=${TEST_GROUP} UID=${TEST_UID} UIN=${TEST_UIN}`))
  console.log(COLOR.cyan(`Destructive tests: ${RUN_DESTRUCTIVE ? 'ENABLED' : 'disabled'}\n`))

  // 诊断：验证 selfInfo.uin 是否真实对应 selfInfo.uid
  console.log(COLOR.cyan('--- self info diagnostic ---'))
  try {
    const selfByUin = await ctx.qqProtocol.fetchUserInfo(+selfInfo.uin)
    console.log(`  fetchUserInfo(selfInfo.uin=${selfInfo.uin}) → nick="${selfByUin.nick}", level=${selfByUin.level}, age=${selfByUin.age}`)
    if (!selfByUin.nick) {
      console.log(COLOR.red(`  ⚠️  selfInfo.uin (${selfInfo.uin}) does NOT correspond to a real account — nick empty`))
    }
  } catch (e) {
    console.log(COLOR.red(`  fetchUserInfo(self) failed: ${(e as Error).message}`))
  }
  try {
    const members: any[] = await ctx.qqProtocol.fetchGroupMembers(+TEST_GROUP)
    const meByUid = members.find((m) => m.id?.uid === selfInfo.uid)
    if (meByUid) {
      console.log(`  group ${TEST_GROUP}: selfInfo.uid → uin from group = ${meByUid.id.uin}`)
      if (String(meByUid.id.uin) !== selfInfo.uin) {
        console.log(COLOR.red(`  ⚠️  selfInfo.uin (${selfInfo.uin}) ≠ real UIN from group (${meByUid.id.uin})`))
      } else {
        console.log(COLOR.green(`  ✓ selfInfo.uin matches real UIN`))
      }
    } else {
      console.log(`  selfInfo.uid not in group ${TEST_GROUP} (skip cross-check)`)
    }
  } catch (e) {
    console.log(COLOR.red(`  fetchGroupMembers diagnostic failed: ${(e as Error).message}`))
  }
  console.log()

  // ============================================================
  // SystemApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntSystemApi ---'))
  await run('ntSystemApi.getDeviceInfo', () => ctx.ntSystemApi.getDeviceInfo(), {
    check: (v) => !!(v?.devType && v?.buildVer) || 'missing devType/buildVer',
  })
  await run('ntSystemApi.getSettingAutoLogin', () => ctx.ntSystemApi.getSettingAutoLogin(), {
    check: (v) => v === true || 'expected true',
  })

  // ============================================================
  // LoginApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntLoginApi ---'))
  await run('ntLoginApi.getQuickLoginList', () => ctx.ntLoginApi.getQuickLoginList(), {
    check: (v) => Array.isArray(v?.LocalLoginInfoList) || 'no LocalLoginInfoList array',
  })

  // ============================================================
  // FriendApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntFriendApi ---'))
  await run('ntFriendApi.getFriends(false)', () => ctx.ntFriendApi.getFriends(false), {
    check: (v) => (Array.isArray(v?.friends) && v.categories instanceof Map) || 'shape wrong',
  })
  await run('ntFriendApi.getFriends(true) [forceUpdate]', () => ctx.ntFriendApi.getFriends(true), {
    check: (v) => Array.isArray(v?.friends) || 'no friends array',
  })
  await run(`ntFriendApi.getFriendByUin(${TEST_FRIEND_UIN})`,
    () => ctx.ntFriendApi.getFriendByUin(+TEST_FRIEND_UIN, false))
  await run(`ntFriendApi.getFriendByUid(${TEST_FRIEND_UID})`,
    () => ctx.ntFriendApi.getFriendByUid(TEST_FRIEND_UID, false))
  await run(`ntFriendApi.isFriend(${TEST_FRIEND_UID})`,
    () => ctx.ntFriendApi.isFriend(TEST_FRIEND_UID), {
      check: (v) => typeof v === 'boolean' || 'not boolean',
    })
  await run('ntFriendApi.getFriendRequests(20)',
    () => ctx.ntFriendApi.getFriendRequests(20), {
      check: (v) => Array.isArray(v) || 'not array',
    })
  await run('ntFriendApi.getDoubtFriendRequests(20)',
    () => ctx.ntFriendApi.getDoubtFriendRequests(20), {
      check: (v) => Array.isArray(v) || 'not array',
    })
  await run('ntFriendApi.clearBuddyReqUnreadCnt',
    () => ctx.ntFriendApi.clearBuddyReqUnreadCnt())

  // ============================================================
  // UserApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntUserApi ---'))
  await run(`ntUserApi.getUidByUin(${TEST_UIN}, ${TEST_GROUP})`,
    () => ctx.ntUserApi.getUidByUin(TEST_UIN, TEST_GROUP))
  await run(`ntUserApi.getUinByUid(${TEST_UID})`,
    () => ctx.ntUserApi.getUinByUid(TEST_UID), {
      check: (v) => {
        if (typeof v !== 'string' || !v.length) return 'empty uin'
        if (v === '81') return 'OIDB 0xfe1_2 returned placeholder UIN 81 (known protocol issue)'
        if (!/^\d+$/.test(v) || +v < 10000) return `unexpected uin: ${v}`
        return true
      },
    })
  await run(`ntUserApi.getUserDetailInfoByUin(${TEST_UIN})`,
    () => ctx.ntUserApi.getUserDetailInfoByUin(TEST_UIN), {
      check: (v) => !!v?.detail || 'no detail',
    })
  await run(`ntUserApi.fetchUserDetailInfo(${TEST_UID})`,
    () => ctx.ntUserApi.fetchUserDetailInfo(TEST_UID), {
      check: (v) => !!v?.simpleInfo || 'no simpleInfo',
    })
  await run(`ntUserApi.getUserDetailInfoWithBizInfo(${TEST_UID})`,
    () => ctx.ntUserApi.getUserDetailInfoWithBizInfo(TEST_UID), {
      check: (v) => !!v?.simpleInfo || 'no simpleInfo',
    })
  await run(`ntUserApi.getUserSimpleInfo(${TEST_UID})`,
    () => ctx.ntUserApi.getUserSimpleInfo(TEST_UID), {
      check: (v) => !!v?.coreInfo?.uid || 'no coreInfo.uid',
    })
  await run(`ntUserApi.getCoreAndBaseInfo([${TEST_UID}])`,
    () => ctx.ntUserApi.getCoreAndBaseInfo([TEST_UID]), {
      check: (v) => v instanceof Map || 'not Map',
    })
  await run(`ntUserApi.getBuddyNick(${TEST_UID})`,
    () => ctx.ntUserApi.getBuddyNick(TEST_UID), {
      check: (v) => (typeof v === 'string' && v.length > 0) || 'empty nick',
    })
  await run('ntUserApi.getSelfNick(true)',
    () => ctx.ntUserApi.getSelfNick(true), {
      check: (v) => (typeof v === 'string' && v.length > 0) || 'empty nick',
    })
  await run(`ntUserApi.getUserInfoCompatible(${TEST_UID})`,
    () => ctx.ntUserApi.getUserInfoCompatible(TEST_UID), {
      check: (v) => !!v?.coreInfo || 'no coreInfo',
    })

  // ============================================================
  // GroupApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntGroupApi ---'))
  await run('ntGroupApi.getGroups(false)',
    () => ctx.ntGroupApi.getGroups(false), {
      check: (v) => Array.isArray(v) || 'not array',
    })
  await run('ntGroupApi.getGroups(true) [forceUpdate]',
    () => ctx.ntGroupApi.getGroups(true), {
      check: (v) => Array.isArray(v) || 'not array',
    })
  await run(`ntGroupApi.getGroup(${TEST_GROUP})`,
    () => ctx.ntGroupApi.getGroup(+TEST_GROUP, false), {
      check: (v) => v?.groupCode === +TEST_GROUP || 'groupCode mismatch',
    })
  await run(`ntGroupApi.getGroupMembers(${TEST_GROUP})`,
    () => ctx.ntGroupApi.getGroupMembers(TEST_GROUP), {
      check: (v) => v?.result?.infos instanceof Map || 'no infos Map',
    })
  await run(`ntGroupApi.getGroupMember(${TEST_GROUP}, ${TEST_UID})`,
    () => ctx.ntGroupApi.getGroupMember(TEST_GROUP, TEST_UID), {
      check: (v) => v?.uid === TEST_UID || 'uid mismatch',
    })
  await run('ntGroupApi.getSingleScreenNotifies(false, 20)',
    () => ctx.ntGroupApi.getSingleScreenNotifies(false, 20), {
      check: (v) => Array.isArray(v?.notifies) || 'no notifies array',
    })
  await run('ntGroupApi.getSingleScreenNotifies(true, 20) [doubt]',
    () => ctx.ntGroupApi.getSingleScreenNotifies(true, 20), {
      check: (v) => Array.isArray(v?.notifies) || 'no notifies array',
    })
  await run('ntGroupApi.getGroupRequest',
    () => ctx.ntGroupApi.getGroupRequest(), {
      check: (v) => Array.isArray(v?.notifies) && typeof v?.normalCount === 'number' || 'shape wrong',
    })
  await run(`ntGroupApi.searchMember(${TEST_GROUP}, "")`,
    () => ctx.ntGroupApi.searchMember(TEST_GROUP, ''), {
      check: (v) => v instanceof Map || 'not Map',
    })
  await run(`ntGroupApi.getGroupShutUpMemberList(${TEST_GROUP})`,
    () => ctx.ntGroupApi.getGroupShutUpMemberList(TEST_GROUP), {
      check: (v) => Array.isArray(v) || 'not array',
    })
  await run(`ntGroupApi.getGroupRemainAtTimes(${TEST_GROUP})`,
    () => ctx.ntGroupApi.getGroupRemainAtTimes(TEST_GROUP), {
      check: (v) => !!v?.atInfo || 'no atInfo',
    })

  // 写操作（默认跳过）
  await run(`ntGroupApi.setMemberCard(${TEST_GROUP}, ${TEST_UID}, "test")`,
    () => ctx.ntGroupApi.setMemberCard(TEST_GROUP, TEST_UID, 'apitest'),
    { destructive: true, check: (v) => v?.result === 0 || `result=${v?.result}` })
  await run(`ntGroupApi.setGroupName(${TEST_GROUP}, "...")`,
    () => ctx.ntGroupApi.setGroupName(TEST_GROUP, 'apitest-temp-name'),
    { destructive: true, check: (v) => v?.result === 0 || `result=${v?.result}` })
  await run(`ntGroupApi.banMember(${TEST_GROUP}, [...0s])`,
    () => ctx.ntGroupApi.banMember(TEST_GROUP, [{ uid: TEST_UID, timeStamp: 0 }]),
    { destructive: true, check: (v) => v?.result === 0 || `result=${v?.result}` })
  await run(`ntGroupApi.banGroup(${TEST_GROUP}, false)`,
    () => ctx.ntGroupApi.banGroup(TEST_GROUP, false),
    { destructive: true, check: (v) => v?.result === 0 || `result=${v?.result}` })

  // ============================================================
  // MsgApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntMsgApi ---'))
  await run('ntMsgApi.getServerTime',
    () => ctx.ntMsgApi.getServerTime(), {
      check: (v) => /^\d+$/.test(String(v)) || 'not numeric string',
    })
  await run('ntMsgApi.generateMsgUniqueId(2)',
    () => ctx.ntMsgApi.generateMsgUniqueId(2), {
      check: (v) => /^\d+$/.test(String(v)) || 'not numeric string',
    })
  await run('ntMsgApi.getMsgTimeFromId("12345678901234567890")',
    () => Promise.resolve(ctx.ntMsgApi.getMsgTimeFromId('12345678901234567890')))
  await run('ntMsgApi.getPins',
    () => ctx.ntMsgApi.getPins())
  await run('ntMsgApi.fetchFavEmojiList(20)',
    () => ctx.ntMsgApi.fetchFavEmojiList(20), {
      check: (v) => Array.isArray(v?.emojiInfoList) || 'no emojiInfoList',
    })
  await run('ntMsgApi.fetchGetHitEmotionsByWord("hello", 5)',
    () => ctx.ntMsgApi.fetchGetHitEmotionsByWord('hello', 5))
  await run(`ntMsgApi.getMsgHistory(group=${TEST_GROUP}, latest 5)`,
    () => ctx.ntMsgApi.getMsgHistory({ chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, '0', 5, false), {
      check: (v) => Array.isArray(v?.msgList) || 'no msgList',
    })
  await run(`ntMsgApi.activateChatAndGetHistory(group=${TEST_GROUP}, 5)`,
    () => ctx.ntMsgApi.activateChatAndGetHistory({ chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, 5), {
      check: (v) => Array.isArray(v?.msgList) || 'no msgList',
    })
  await run(`ntMsgApi.getAioFirstViewLatestMsgs(group=${TEST_GROUP}, 5)`,
    () => ctx.ntMsgApi.getAioFirstViewLatestMsgs({ chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, 5), {
      check: (v) => Array.isArray(v?.msgList) || 'no msgList',
    })
  await run('ntMsgApi.getMsgsByMsgId(empty)',
    () => ctx.ntMsgApi.getMsgsByMsgId({ chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, []), {
      check: (v) => Array.isArray(v?.msgList) || 'no msgList',
    })
  await run('ntMsgApi.activateChat',
    () => ctx.ntMsgApi.activateChat({ chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }), {
      check: (v) => typeof v?.result === 'number' || 'no result',
    })
  await run('ntMsgApi.setMsgRead',
    () => ctx.ntMsgApi.setMsgRead({ chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }), {
      check: (v) => typeof v?.result === 'number' || 'no result',
    })
  await run('ntMsgApi.sendShowInputStatusReq',
    () => ctx.ntMsgApi.sendShowInputStatusReq(ChatType.Group, 0, TEST_UID))

  // 写操作
  await run('ntMsgApi.sendMsg(group, text "apitest")',
    () => ctx.ntMsgApi.sendMsg(
      { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' },
      [{ elementType: 1 as any, elementId: '', textElement: { content: 'apitest', atType: 0, atUid: '', atTinyId: '', atNtUid: '' } } as any],
    ),
    { destructive: true, check: (v) => !!v?.msgId || 'no msgId' })

  // ============================================================
  // FileApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntFileApi ---'))
  await run('ntFileApi.getRichMediaFilePath',
    () => ctx.ntFileApi.getRichMediaFilePath('a'.repeat(32), 'test.png', 2 as any, 0), {
      check: (v) => (typeof v === 'string' && v.includes('test.png')) || 'no path',
    })
  await run('ntFileApi.getImageUrl(empty, md5)',
    () => Promise.resolve(ctx.ntFileApi.getImageUrl('', 'a'.repeat(32))), {
      check: (v) => (typeof v === 'string' && v.startsWith('http')) || 'no http url',
    })

  // ============================================================
  // 输出报告
  // ============================================================
  const pass = results.filter(r => r.status === 'PASS').length
  const fail = results.filter(r => r.status === 'FAIL').length
  const skip = results.filter(r => r.status === 'SKIP').length
  console.log(COLOR.cyan(`\n=== Summary: ${pass} PASS, ${fail} FAIL, ${skip} SKIP (total ${results.length}) ===`))
  if (fail > 0) {
    console.log(COLOR.red('\nFailures:'))
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(COLOR.red(`  - ${r.name}`), COLOR.gray(r.detail))
    }
  }
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => {
  console.error(COLOR.red('Fatal:'), e)
  process.exit(1)
})
