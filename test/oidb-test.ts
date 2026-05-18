/**
 * 测试 OIDB API（getGroupMember / fetchUserInfoByUid 等）
 *
 * 用法：QQ_TEST_GROUP=164461995 QQ_TEST_UID=u_xxx npx tsx test/oidb-test.ts
 */

import { Context } from 'cordis'
import LoggerService from '@cordisjs/plugin-logger'
import TimerService from '@cordisjs/plugin-timer'
import ConfigService from '../src/main/config'
import { QQProtocolClient } from '../src/main/qqProtocol'
import { NTQQUserApi, NTQQGroupApi } from '../src/ntqqapi/api'
import { selfInfo } from '../src/common/globalVars'

const TEST_GROUP = process.env.QQ_TEST_GROUP || '164461995'
const TEST_UID = process.env.QQ_TEST_UID || 'u_snYxnEfja-Po_cdFcyccRQ'
const TEST_UIN = process.env.QQ_TEST_UIN ? Number(process.env.QQ_TEST_UIN) : 379450326

async function main() {
  const ctx = new Context()
  ctx.plugin(LoggerService, { bufferSize: 0 })
  ctx.plugin(TimerService)
  ctx.plugin(ConfigService)
  ctx.plugin(QQProtocolClient)
  ctx.plugin(NTQQUserApi)
  ctx.plugin(NTQQGroupApi)

  await new Promise<void>(resolve => {
    ctx.inject(['qqProtocol'], (ctx) => {
      ctx.qqProtocol.initDirectClient().then(() => resolve())
    })
  })

  await new Promise(r => setTimeout(r, 2000))

  if (!selfInfo.uin) {
    console.log('Not logged in. Run main.ts first to save session.')
    process.exit(1)
  }

  console.log('\n=== Logged in as', selfInfo.uin, '===\n')

  // Test 1: fetchUserInfoByUid
  console.log('--- Test fetchUserInfoByUid ---')
  try {
    const info = await ctx.qqProtocol.fetchUserInfoByUid(TEST_UID)
    console.log('User info:', info)
  } catch (e) {
    console.error('Failed:', (e as Error).message)
  }

  // Test 2: fetchGroupMembers
  console.log('\n--- Test fetchGroupMembers ---')
  try {
    const members = await ctx.qqProtocol.fetchGroupMembers(+TEST_GROUP)
    console.log('Member count:', members.length)
    console.log('First 3:', members.slice(0, 3).map((m: any) => ({
      uid: m.id?.uid,
      uin: m.id?.uin,
      name: m.memberName,
      card: m.memberCard?.memberCard,
      level: m.level?.level,
      permission: m.permission,
    })))
  } catch (e) {
    console.error('Failed:', (e as Error).message)
  }

  // Test 3: getGroupMember (高层 API，应该走 OIDB fallback)
  console.log('\n--- Test ntGroupApi.getGroupMember ---')
  try {
    const member = await ctx.ntGroupApi.getGroupMember(TEST_GROUP, TEST_UID)
    console.log('Group member:', {
      uid: member.uid,
      uin: member.uin,
      nick: member.nick,
      cardName: member.cardName,
      role: member.role,
      memberLevel: member.memberLevel,
    })
  } catch (e) {
    console.error('Failed:', (e as Error).message)
  }

  // Test 4: getUinByUid
  console.log('\n--- Test ntUserApi.getUinByUid ---')
  try {
    const uin = await ctx.ntUserApi.getUinByUid(TEST_UID)
    console.log('UIN for', TEST_UID, '=', uin)
  } catch (e) {
    console.error('Failed:', (e as Error).message)
  }

  // Test 5: fetchUserInfo (by UIN)
  console.log('\n--- Test fetchUserInfo by UIN ---')
  try {
    const info = await ctx.qqProtocol.fetchUserInfo(TEST_UIN)
    console.log('User info:', { uin: info.uin, nick: info.nick, sex: info.sex, level: info.level })
  } catch (e) {
    console.error('Failed:', (e as Error).message)
  }

  console.log('\n=== Done ===')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
