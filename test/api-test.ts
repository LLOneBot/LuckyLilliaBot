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
import { ChatType, ElementType } from '../src/ntqqapi/types'

const TEST_GROUP = process.env.QQ_TEST_GROUP || '164461995'
const TEST_UID = process.env.QQ_TEST_UID || 'u_snYxnEfja-Po_cdFcyccRQ'
const TEST_UIN = process.env.QQ_TEST_UIN || '379450326'
const RUN_DESTRUCTIVE = process.env.RUN_DESTRUCTIVE === '1'

type Status = 'PASS' | 'FAIL' | 'SKIP'
interface Result { name: string; status: Status; detail: string; duration: number }
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
    check?: (value: any) => boolean | string
    destructive?: boolean
    /** 期望此调用抛错，message 必须包含子串。多个子串任意一个匹配即可。 */
    expectThrow?: string | string[]
  } = {},
): Promise<void> {
  if (options.destructive && !RUN_DESTRUCTIVE) {
    results.push({ name, status: 'SKIP', detail: '(destructive)', duration: 0 })
    console.log(COLOR.gray(`SKIP  ${name}`))
    return
  }
  const t0 = Date.now()
  try {
    const value = await fn()
    const duration = Date.now() - t0
    if (options.expectThrow) {
      const expected = Array.isArray(options.expectThrow) ? options.expectThrow.join('|') : options.expectThrow
      results.push({ name, status: 'FAIL', detail: `expected throw containing "${expected}", got ${summarize(value)}`, duration })
      console.log(COLOR.red(`FAIL  ${name}`), COLOR.gray('did not throw'))
      return
    }
    let detail = summarize(value)
    if (options.check) {
      const checked = options.check(value)
      if (checked !== true) {
        const reason = typeof checked === 'string' ? checked : 'check failed'
        results.push({ name, status: 'FAIL', detail: `${reason} | ${detail}`, duration })
        console.log(COLOR.red(`FAIL  ${name}`), COLOR.gray(`(${reason})`), detail)
        return
      }
    }
    results.push({ name, status: 'PASS', detail, duration })
    console.log(COLOR.green(`PASS  ${name}  ${duration}ms`), COLOR.gray(detail))
  } catch (e) {
    const duration = Date.now() - t0
    const msg = (e as Error).message || String(e)
    if (options.expectThrow) {
      const expected = Array.isArray(options.expectThrow) ? options.expectThrow : [options.expectThrow]
      const matched = expected.some(s => msg.includes(s))
      if (matched) {
        results.push({ name, status: 'PASS', detail: `[expected throw] ${msg}`, duration })
        console.log(COLOR.green(`PASS  ${name}  ${duration}ms`), COLOR.gray(`(threw as expected: ${msg})`))
        return
      }
      results.push({ name, status: 'FAIL', detail: `threw "${msg}", expected one of [${expected.join(',')}]`, duration })
      console.log(COLOR.red(`FAIL  ${name}`), COLOR.gray(`unexpected throw: ${msg}`))
      return
    }
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
    ctx.inject(['qqProtocol'], (ctx) => { ctx.qqProtocol.initDirectClient().then(() => resolve()) })
  })
  await new Promise(r => setTimeout(r, 2000))

  if (!selfInfo.uin) {
    console.log(COLOR.red('Not logged in. Run main.ts first to save session.'))
    process.exit(1)
  }

  console.log(COLOR.cyan(`\n=== Logged in as ${selfInfo.uin} (uid=${selfInfo.uid}) ===`))
  console.log(COLOR.cyan(`Test config: GROUP=${TEST_GROUP} UID=${TEST_UID} UIN=${TEST_UIN}`))
  console.log(COLOR.cyan(`Destructive tests: ${RUN_DESTRUCTIVE ? 'ENABLED' : 'disabled'}\n`))

  // ============================================================
  // ntSystemApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntSystemApi ---'))
  await run('getDeviceInfo', () => ctx.ntSystemApi.getDeviceInfo(), {
    check: (v) => (!!v?.devType && !!v?.buildVer) || 'missing fields',
  })
  await run('getSettingAutoLogin', () => ctx.ntSystemApi.getSettingAutoLogin(), {
    check: (v) => v === true || `expected true, got ${v}`,
  })
  await run('setSettingAutoLogin (noop)', () => ctx.ntSystemApi.setSettingAutoLogin(true))
  await run('restart (noop)', () => ctx.ntSystemApi.restart())
  await run('scanQRCode (must throw)', () => ctx.ntSystemApi.scanQRCode('x'),
    { expectThrow: ['不支持', 'not supported'] })

  // ============================================================
  // ntLoginApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntLoginApi ---'))
  await run('getQuickLoginList', () => ctx.ntLoginApi.getQuickLoginList(), {
    check: (v) => {
      if (!Array.isArray(v?.LocalLoginInfoList)) return 'no LocalLoginInfoList'
      const me = v.LocalLoginInfoList.find((e: any) => e.uin === selfInfo.uin)
      if (!me) return 'self not in list'
      return true
    },
  })
  await run('quickLoginWithUin (must throw)', () => ctx.ntLoginApi.quickLoginWithUin(selfInfo.uin),
    { expectThrow: ['quickLoginWithUin'] })
  // 不测 getLoginQrCode（会重新签发二维码）

  // ============================================================
  // ntFriendApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntFriendApi ---'))
  await run('getFriends(false)', () => ctx.ntFriendApi.getFriends(false), {
    check: (v) => {
      if (!Array.isArray(v?.friends) || !v.friends.length) return 'empty friends'
      if (!(v.categories instanceof Map)) return 'categories not Map'
      const f = v.friends.find((e: any) => String(e.uin) === TEST_UIN)
      if (!f) return `TEST_UIN ${TEST_UIN} not in friends`
      if (!f.nick) return `friend ${TEST_UIN}.nick empty`
      if (f.uid !== TEST_UID) return `friend uid mismatch: ${f.uid} vs ${TEST_UID}`
      return true
    },
  })
  await run('getFriends(true) [forceUpdate]', () => ctx.ntFriendApi.getFriends(true), {
    check: (v) => Array.isArray(v?.friends) && v.friends.length > 0 || 'empty',
  })
  await run(`getFriendByUin(${TEST_UIN})`,
    () => ctx.ntFriendApi.getFriendByUin(+TEST_UIN, false), {
      check: (v) => v?.uid === TEST_UID || `uid mismatch: ${v?.uid}`,
    })
  await run(`getFriendByUid(${TEST_UID})`,
    () => ctx.ntFriendApi.getFriendByUid(TEST_UID, false), {
      check: (v) => String(v?.uin) === TEST_UIN || `uin mismatch: ${v?.uin}`,
    })
  await run(`isFriend(${TEST_UID})`,
    () => ctx.ntFriendApi.isFriend(TEST_UID), {
      check: (v) => v === true || 'expected true',
    })
  await run('isFriend(non-existent)',
    () => ctx.ntFriendApi.isFriend('u_nonexistent_xxxxxxxxxxxx'), {
      check: (v) => v === false || 'expected false',
    })
  await run('getFriendRequests(20)',
    () => ctx.ntFriendApi.getFriendRequests(20), {
      check: (v) => Array.isArray(v) || 'not array',
    })
  await run('getDoubtFriendRequests(20)',
    () => ctx.ntFriendApi.getDoubtFriendRequests(20), {
      check: (v) => Array.isArray(v) || 'not array',
    })
  await run('clearBuddyReqUnreadCnt (noop)',
    () => ctx.ntFriendApi.clearBuddyReqUnreadCnt())
  // destructive
  await run('setFriendRemark', () => ctx.ntFriendApi.setFriendRemark(TEST_UID, 'apitest-remark'),
    { destructive: true })
  await run('setFriendCategory', () => ctx.ntFriendApi.setFriendCategory(TEST_UID, 0),
    { destructive: true })
  await run('setFriendPin', () => ctx.ntFriendApi.setFriendPin(TEST_UID, false),
    { destructive: true })

  // ============================================================
  // ntUserApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntUserApi ---'))
  await run(`getUidByUin(${TEST_UIN}, ${TEST_GROUP})`,
    () => ctx.ntUserApi.getUidByUin(TEST_UIN, TEST_GROUP), {
      check: (v) => v === TEST_UID || `expected ${TEST_UID}, got ${v}`,
    })
  await run(`getUinByUid(${TEST_UID})`,
    () => ctx.ntUserApi.getUinByUid(TEST_UID), {
      check: (v) => v === TEST_UIN || `expected ${TEST_UIN}, got ${v}`,
    })
  await run(`getUserDetailInfoByUin(${TEST_UIN})`,
    () => ctx.ntUserApi.getUserDetailInfoByUin(TEST_UIN), {
      check: (v) => {
        if (String(v?.detail?.uin) !== TEST_UIN) return `uin mismatch: ${v?.detail?.uin}`
        if (!v.detail.nick) return 'nick empty'
        if (typeof v.detail.level !== 'number' || v.detail.level <= 0) return `level=${v.detail.level}`
        return true
      },
    })
  await run(`fetchUserDetailInfo(${TEST_UID})`,
    () => ctx.ntUserApi.fetchUserDetailInfo(TEST_UID), {
      check: (v) => {
        const ci = v?.simpleInfo?.coreInfo
        if (!ci) return 'no coreInfo'
        if (ci.uid !== TEST_UID) return `uid mismatch: ${ci.uid}`
        if (String(ci.uin) !== TEST_UIN) return `uin mismatch: ${ci.uin}`
        if (!ci.nick) return 'nick empty'
        return true
      },
    })
  await run(`getUserSimpleInfo(${TEST_UID})`,
    () => ctx.ntUserApi.getUserSimpleInfo(TEST_UID), {
      check: (v) => {
        if (v?.coreInfo?.uid !== TEST_UID) return `uid mismatch`
        if (String(v.coreInfo.uin) !== TEST_UIN) return `uin mismatch: ${v.coreInfo.uin}`
        if (!v.coreInfo.nick) return 'nick empty'
        return true
      },
    })
  await run(`getCoreAndBaseInfo([${TEST_UID}])`,
    () => ctx.ntUserApi.getCoreAndBaseInfo([TEST_UID]), {
      check: (v) => {
        if (!(v instanceof Map)) return 'not Map'
        const e = v.get(TEST_UID)
        if (!e) return 'missing entry'
        if (String(e.coreInfo.uin) !== TEST_UIN) return `uin mismatch: ${e.coreInfo.uin}`
        if (!e.coreInfo.nick) return 'nick empty'
        return true
      },
    })
  await run(`getBuddyNick(${TEST_UID})`,
    () => ctx.ntUserApi.getBuddyNick(TEST_UID), {
      check: (v) => (typeof v === 'string' && v.length > 0) || 'empty',
    })
  await run('getSelfNick(true)',
    () => ctx.ntUserApi.getSelfNick(true), {
      check: (v) => (typeof v === 'string' && v.length > 0) || 'empty',
    })
  await run(`getUserInfoCompatible(${TEST_UID})`,
    () => ctx.ntUserApi.getUserInfoCompatible(TEST_UID), {
      check: (v) => v?.coreInfo?.uid === TEST_UID || 'uid mismatch',
    })
  // 自查（OIDB 0xfe1 拒绝自查，会走 fallback 群成员）
  await run('getBuddyNick(self)',
    () => ctx.ntUserApi.getBuddyNick(selfInfo.uid), {
      check: (v) => typeof v === 'string' || 'not string',
    })
  await run('getUinByUid(self)',
    () => ctx.ntUserApi.getUinByUid(selfInfo.uid), {
      check: (v) => v === selfInfo.uin || `expected ${selfInfo.uin}, got ${v}`,
    })
  // stub APIs (must throw)
  await run('setSelfAvatar (must throw)', () => ctx.ntUserApi.setSelfAvatar('x'),
    { expectThrow: '暂未实现' })
  await run('getPSkey (must throw)', () => ctx.ntUserApi.getPSkey(['x']),
    { expectThrow: '暂未实现' })
  await run('like (must throw)', () => ctx.ntUserApi.like('x', 1),
    { expectThrow: '暂未实现' })
  await run('forceFetchClientKey (must throw)', () => ctx.ntUserApi.forceFetchClientKey(),
    { expectThrow: '暂未实现' })
  await run('setSelfStatus (must throw)', () => ctx.ntUserApi.setSelfStatus(0, 0, 0),
    { expectThrow: '暂未实现' })
  await run('getProfileLike (must throw)', () => ctx.ntUserApi.getProfileLike('x'),
    { expectThrow: '暂未实现' })
  await run('getProfileLikeMe (must throw)', () => ctx.ntUserApi.getProfileLikeMe('x'),
    { expectThrow: '暂未实现' })
  await run('getRobotUinRange (returns stub)',
    () => ctx.ntUserApi.getRobotUinRange(), {
      check: (v) => Array.isArray(v?.response?.robotUinRanges) || 'no robotUinRanges',
    })
  await run('quitAccount (must throw)', () => ctx.ntUserApi.quitAccount(),
    { expectThrow: '暂未实现' })
  await run('modifySelfProfile (must throw)', () => ctx.ntUserApi.modifySelfProfile({} as any),
    { expectThrow: '暂未实现' })
  await run('getRecentContactListSnapShot (returns stub)',
    () => ctx.ntUserApi.getRecentContactListSnapShot(20), {
      check: (v) => Array.isArray(v?.contacts) || 'no contacts',
    })

  // ============================================================
  // ntGroupApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntGroupApi ---'))
  await run('getGroups(false)',
    () => ctx.ntGroupApi.getGroups(false), {
      check: (v) => {
        if (!Array.isArray(v) || !v.length) return 'empty'
        const g = v.find((x) => String(x.groupCode) === TEST_GROUP)
        if (!g) return `TEST_GROUP ${TEST_GROUP} not in groups`
        if (!g.groupName) return 'group.groupName empty'
        if (typeof g.memberCount !== 'number' || g.memberCount <= 0) return 'memberCount<=0'
        return true
      },
    })
  await run('getGroups(true) [forceUpdate]',
    () => ctx.ntGroupApi.getGroups(true), {
      check: (v) => Array.isArray(v) && v.length > 0 || 'empty',
    })
  await run(`getGroup(${TEST_GROUP})`,
    () => ctx.ntGroupApi.getGroup(+TEST_GROUP, false), {
      check: (v) => {
        if (v?.groupCode !== +TEST_GROUP) return 'groupCode mismatch'
        if (!v.groupName) return 'no groupName'
        return true
      },
    })
  await run(`getGroupMembers(${TEST_GROUP})`,
    () => ctx.ntGroupApi.getGroupMembers(TEST_GROUP), {
      check: (v) => {
        const infos = v?.result?.infos
        if (!(infos instanceof Map) || infos.size === 0) return 'no infos'
        const me = infos.get(selfInfo.uid)
        if (!me) return 'self not in members'
        if (!me.nick) return 'me.nick empty'
        return true
      },
    })
  await run(`getGroupMember(${TEST_GROUP}, ${TEST_UID})`,
    () => ctx.ntGroupApi.getGroupMember(TEST_GROUP, TEST_UID), {
      check: (v) => {
        if (v?.uid !== TEST_UID) return 'uid mismatch'
        if (String(v.uin) !== TEST_UIN) return `uin mismatch: ${v.uin}`
        return true
      },
    })
  await run('getSingleScreenNotifies(false, 20)',
    () => ctx.ntGroupApi.getSingleScreenNotifies(false, 20), {
      check: (v) => Array.isArray(v?.notifies) || 'no notifies',
    })
  await run('getSingleScreenNotifies(true, 20) [doubt]',
    () => ctx.ntGroupApi.getSingleScreenNotifies(true, 20), {
      check: (v) => Array.isArray(v?.notifies) || 'no notifies',
    })
  await run('getGroupRequest',
    () => ctx.ntGroupApi.getGroupRequest(), {
      check: (v) => Array.isArray(v?.notifies) && typeof v?.normalCount === 'number' || 'shape',
    })
  await run(`searchMember(${TEST_GROUP}, "")`,
    () => ctx.ntGroupApi.searchMember(TEST_GROUP, ''), {
      check: (v) => v instanceof Map && v.size > 0 || 'empty',
    })
  await run(`getGroupShutUpMemberList(${TEST_GROUP})`,
    () => ctx.ntGroupApi.getGroupShutUpMemberList(TEST_GROUP), {
      check: (v) => Array.isArray(v) || 'not array',
    })
  await run(`getGroupRemainAtTimes(${TEST_GROUP})`,
    () => ctx.ntGroupApi.getGroupRemainAtTimes(TEST_GROUP), {
      check: (v) => !!v?.atInfo || 'no atInfo',
    })
  await run('getGroupFileCount (stub)',
    () => ctx.ntGroupApi.getGroupFileCount(TEST_GROUP), {
      check: (v) => Array.isArray(v?.groupFileCounts) || 'no groupFileCounts',
    })
  await run('getGroupFileSpace (stub)',
    () => ctx.ntGroupApi.getGroupFileSpace(TEST_GROUP), {
      check: (v) => 'totalSpace' in v || 'no totalSpace',
    })
  await run('checkGroupMemberCache (stub)',
    () => ctx.ntGroupApi.checkGroupMemberCache([TEST_GROUP]), {
      check: (v) => v?.result === 0 || 'unexpected',
    })
  // stub-throw APIs
  for (const [name, fn] of [
    ['createGroupFileFolder', () => ctx.ntGroupApi.createGroupFileFolder(TEST_GROUP, 'x')],
    ['deleteGroupFileFolder', () => ctx.ntGroupApi.deleteGroupFileFolder(TEST_GROUP, 'x')],
    ['deleteGroupFile', () => ctx.ntGroupApi.deleteGroupFile(TEST_GROUP, ['x'], [102])],
    ['getGroupFileList', () => ctx.ntGroupApi.getGroupFileList(TEST_GROUP, {} as any)],
    ['publishGroupBulletin', () => ctx.ntGroupApi.publishGroupBulletin(TEST_GROUP, {} as any)],
    ['uploadGroupBulletinPic', () => ctx.ntGroupApi.uploadGroupBulletinPic(TEST_GROUP, 'x')],
    ['getGroupRecommendContact', () => ctx.ntGroupApi.getGroupRecommendContact(TEST_GROUP)],
    ['queryCachedEssenceMsg', () => ctx.ntGroupApi.queryCachedEssenceMsg(TEST_GROUP)],
    ['getGroupHonorList', () => ctx.ntGroupApi.getGroupHonorList(TEST_GROUP)],
    ['getGroupBulletinList', () => ctx.ntGroupApi.getGroupBulletinList(TEST_GROUP)],
    ['setGroupAvatar', () => ctx.ntGroupApi.setGroupAvatar(TEST_GROUP, 'x')],
    ['setGroupMsgMask', () => ctx.ntGroupApi.setGroupMsgMask(TEST_GROUP, 1 as any)],
    ['setGroupRemark', () => ctx.ntGroupApi.setGroupRemark(TEST_GROUP, 'x')],
    ['moveGroupFile', () => ctx.ntGroupApi.moveGroupFile(TEST_GROUP, ['x'], 'x', 'x')],
    ['renameGroupFolder', () => ctx.ntGroupApi.renameGroupFolder(TEST_GROUP, 'x', 'y')],
    ['setGroupFileForever', () => ctx.ntGroupApi.setGroupFileForever(TEST_GROUP, 'x')],
    ['getGroupAlbumList', () => ctx.ntGroupApi.getGroupAlbumList(TEST_GROUP)],
    ['createGroupAlbum', () => ctx.ntGroupApi.createGroupAlbum(TEST_GROUP, 'x', 'y')],
    ['deleteGroupAlbum', () => ctx.ntGroupApi.deleteGroupAlbum(TEST_GROUP, 'x')],
    ['deleteGroupBulletin', () => ctx.ntGroupApi.deleteGroupBulletin(TEST_GROUP, 'x')],
    ['renameGroupFile', () => ctx.ntGroupApi.renameGroupFile(TEST_GROUP, 'x', 'y', 'z')],
    ['getGroupAlbumMediaList', () => ctx.ntGroupApi.getGroupAlbumMediaList(TEST_GROUP, 'x')],
  ] as const) {
    await run(`${name} (must throw)`, fn as any, { expectThrow: '暂未实现' })
  }
  // destructive
  // 检查 self 在测试群里的权限（影响哪些 destructive 测试可跑）
  let selfRole: number | undefined
  try {
    const me = await ctx.ntGroupApi.getGroupMember(TEST_GROUP, selfInfo.uid)
    selfRole = me?.role  // 4=Owner, 3=Admin, 2=Normal
  } catch {}
  const isAdmin = selfRole === 4 || selfRole === 3
  console.log(COLOR.gray(`  (self role in TEST_GROUP: ${selfRole}, isAdmin=${isAdmin})`))

  // setMemberCard 改自己名片：普通成员也有权
  await run('setMemberCard(self)',
    async () => {
      const newCard = `apitest-${Date.now() % 10000}`
      const r = await ctx.ntGroupApi.setMemberCard(TEST_GROUP, selfInfo.uid, newCard)
      // 拉回来验证
      const m = await ctx.ntGroupApi.getGroupMember(TEST_GROUP, selfInfo.uid, true)
      return { setResult: r, actualCard: m.cardName, expectedCard: newCard }
    },
    { destructive: true, check: (v) => {
      if (v.setResult.result !== 0) return `setResult ${v.setResult.result}`
      if (v.actualCard !== v.expectedCard) return `card mismatch: server="${v.actualCard}" expected="${v.expectedCard}"`
      return true
    }})
  // banMember/banGroup 需要管理员权限
  if (isAdmin) {
    await run('banMember (unmute)',
      () => ctx.ntGroupApi.banMember(TEST_GROUP, [{ uid: TEST_UID, timeStamp: 0 }]),
      { destructive: true, check: (v) => v?.result === 0 || `result=${v?.result}` })
    await run('banGroup (off)',
      () => ctx.ntGroupApi.banGroup(TEST_GROUP, false),
      { destructive: true, check: (v) => v?.result === 0 || `result=${v?.result}` })
  } else {
    results.push({ name: 'banMember (unmute)', status: 'SKIP', detail: 'self is not group admin', duration: 0 })
    results.push({ name: 'banGroup (off)', status: 'SKIP', detail: 'self is not group admin', duration: 0 })
    console.log(COLOR.gray(`SKIP  banMember (unmute)  (self is not admin)`))
    console.log(COLOR.gray(`SKIP  banGroup (off)  (self is not admin)`))
  }

  // ============================================================
  // ntMsgApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntMsgApi ---'))
  await run('getServerTime',
    () => ctx.ntMsgApi.getServerTime(), {
      check: (v) => {
        const n = +v
        const now = Math.floor(Date.now() / 1000)
        return (Math.abs(n - now) < 60 * 60) || `time too far from local: ${n} vs ${now}`
      },
    })
  await run('generateMsgUniqueId(2)',
    () => ctx.ntMsgApi.generateMsgUniqueId(2), {
      check: (v) => /^\d+$/.test(String(v)) || 'not numeric',
    })
  await run('getMsgTimeFromId',
    () => Promise.resolve(ctx.ntMsgApi.getMsgTimeFromId('1234567890')))
  await run('getPins',
    () => ctx.ntMsgApi.getPins(), {
      check: (v) => 'friends' in v && 'groups' in v || 'shape',
    })
  await run('fetchFavEmojiList(20) (stub)',
    () => ctx.ntMsgApi.fetchFavEmojiList(20), {
      check: (v) => Array.isArray(v?.emojiInfoList) || 'no emojiInfoList',
    })
  await run('fetchGetHitEmotionsByWord (stub)',
    () => ctx.ntMsgApi.fetchGetHitEmotionsByWord('hello', 5))
  let firstSeq = ''
  // 先 dispatch 消息事件后能拿到 latest seq，但目前直连模式没暴露这个。
  // SsoGetGroupMsg 必须传精确的 startSequence/endSequence；msgId='0' 时只能拉群最早的 cnt 条
  // 如果群很活跃（早期消息已被服务器淘汰），可能返回空 — 这是协议限制不是 bug
  await run(`getMsgHistory(group=${TEST_GROUP}, latest 5)`,
    async () => {
      const r = await ctx.ntMsgApi.getMsgHistory(
        { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, '0', 5, false)
      if (r.msgList?.[0]?.msgSeq) firstSeq = String(r.msgList[0].msgSeq)
      return r
    }, {
      check: (v) => {
        if (!Array.isArray(v?.msgList)) return 'no msgList array'
        // 即使空也算 PASS（边界情况），但有数据就严格校验
        if (v.msgList.length > 0) {
          const m = v.msgList[0]
          if (!m.msgSeq) return 'msg missing msgSeq'
          if (!Array.isArray(m.elements)) return 'no elements array'
        }
        return true
      },
    })
  if (firstSeq) {
    await run(`getMsgsBySeqAndCount(seq=${firstSeq}, 1)`,
      () => ctx.ntMsgApi.getMsgsBySeqAndCount(
        { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, firstSeq, 1, false, false), {
        check: (v) => Array.isArray(v?.msgList) || 'no msgList',
      })
    await run(`getSingleMsg(seq=${firstSeq})`,
      () => ctx.ntMsgApi.getSingleMsg(
        { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, firstSeq), {
        check: (v) => Array.isArray(v?.msgList) || 'no msgList',
      })
  }
  await run('activateChatAndGetHistory',
    () => ctx.ntMsgApi.activateChatAndGetHistory(
      { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, 5), {
      check: (v) => Array.isArray(v?.msgList) || 'no msgList',
    })
  await run('getAioFirstViewLatestMsgs (stub)',
    () => ctx.ntMsgApi.getAioFirstViewLatestMsgs(
      { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, 5), {
      check: (v) => Array.isArray(v?.msgList) || 'no msgList',
    })
  await run('getMsgsByMsgId(empty) (cache)',
    () => ctx.ntMsgApi.getMsgsByMsgId(
      { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, []), {
      check: (v) => Array.isArray(v?.msgList) || 'no msgList',
    })
  await run('activateChat (noop)',
    () => ctx.ntMsgApi.activateChat({ chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }), {
      check: (v) => v?.result === 0 || 'result',
    })
  await run('setMsgRead (noop)',
    () => ctx.ntMsgApi.setMsgRead({ chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }), {
      check: (v) => v?.result === 0 || 'result',
    })
  await run('sendShowInputStatusReq (noop)',
    () => ctx.ntMsgApi.sendShowInputStatusReq(ChatType.Group, 0, TEST_UID))
  // stub-throw
  for (const [name, fn] of [
    ['getTempChatInfo', () => ctx.ntMsgApi.getTempChatInfo(ChatType.C2C, TEST_UID)],
    ['getMultiMsg', () => ctx.ntMsgApi.getMultiMsg({ chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, 'x', 'y')],
    ['forwardMsg', () => ctx.ntMsgApi.forwardMsg(
      { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' },
      { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, ['x'])],
    ['multiForwardMsg', () => ctx.ntMsgApi.multiForwardMsg(
      { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' },
      { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, ['x'])],
    ['queryMsgsById', () => ctx.ntMsgApi.queryMsgsById(ChatType.Group, 'x')],
    ['addFavEmoji', () => ctx.ntMsgApi.addFavEmoji('/nonexistent')],
    ['deleteFavEmoji', () => ctx.ntMsgApi.deleteFavEmoji(['x'])],
    ['setContactLocalTop', () => ctx.ntMsgApi.setContactLocalTop(
      { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, true)],
    ['translatePtt2Text', () => ctx.ntMsgApi.translatePtt2Text(
      'x', { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, {} as any)],
  ] as const) {
    await run(`${name} (must throw)`, fn as any, { expectThrow: '暂未实现' })
  }
  // destructive
  await run('sendMsg(group, text) + round-trip verify',
    async () => {
      const marker = `apitest-${Date.now()}`
      const sent = await ctx.ntMsgApi.sendMsg(
        { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' },
        [{ elementType: ElementType.Text, elementId: '', textElement: { content: marker, atType: 0, atUid: '', atTinyId: '', atNtUid: '' } } as any],
      )
      if (!sent?.msgId) return { sent, error: 'no msgId' }
      const seq = sent.msgSeq
      if (!seq || seq === '0') return { sent, error: 'no msgSeq returned from server' }
      // 等服务器消息可读
      await new Promise(r => setTimeout(r, 800))
      const back = await ctx.ntMsgApi.getSingleMsg(
        { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }, seq)
      const found = back.msgList?.[0]
      const content = found?.elements?.[0]?.textElement?.content
      return { sent, seq, found: !!found, content, marker }
    },
    { destructive: true, check: (v) => {
      if (v.error) return v.error
      if (!v.found) return `seq ${v.seq} not found by getSingleMsg`
      if (v.content !== v.marker) return `content mismatch: "${v.content}" vs "${v.marker}"`
      return true
    }})

  // ============================================================
  // ntFileApi
  // ============================================================
  console.log(COLOR.cyan('\n--- ntFileApi ---'))
  await run('getRichMediaFilePath',
    () => ctx.ntFileApi.getRichMediaFilePath('a'.repeat(32), 'test.png', 2 as any, 0), {
      check: (v) => typeof v === 'string' && v.includes('test.png') || 'no path',
    })
  await run('getImageUrl(empty,md5)',
    () => Promise.resolve(ctx.ntFileApi.getImageUrl('', 'a'.repeat(32))), {
      check: (v) => typeof v === 'string' && v.startsWith('http') || 'no http',
    })
  // stub-throw
  for (const [name, fn] of [
    ['uploadFlashFile', () => ctx.ntFileApi.uploadFlashFile('x', ['/nonexistent'])],
    ['downloadFlashFile', () => ctx.ntFileApi.downloadFlashFile('x')],
    ['getFlashFileList', () => ctx.ntFileApi.getFlashFileList('x')],
    ['getFlashFileSetIdByCode', () => ctx.ntFileApi.getFlashFileSetIdByCode('x')],
    ['getFlashFileInfo', () => ctx.ntFileApi.getFlashFileInfo('x')],
    ['reshareFlashFile', () => ctx.ntFileApi.reshareFlashFile('x')],
  ] as const) {
    await run(`${name} (must throw)`, fn as any, { expectThrow: '暂未实现' })
  }

  // ============================================================
  // 报告
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

main().catch(e => { console.error(COLOR.red('Fatal:'), e); process.exit(1) })
