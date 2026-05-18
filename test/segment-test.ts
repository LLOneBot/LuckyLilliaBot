/**
 * 各种消息段发送测试。
 * 全部 destructive（会真实发送到群里）。
 *
 * 用法：
 *   QQ_TEST_GROUP=164461995 RUN_DESTRUCTIVE=1 npx tsx test/segment-test.ts
 *
 * 自动使用 test/onebot11-api-test/tests/media/ 下的 fixture：
 *   - test2.mp3  → 转 silk → ptt 测试
 *   - test.mp4   → video 测试（自动抽帧做缩略图）
 *   - test.gif   → 群文件测试
 *
 * 可选环境变量覆盖：TEST_PIC, TEST_PTT, TEST_VIDEO, TEST_FILE
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
import { ChatType, ElementType, AtType, Peer, RawMessage, SendMessageElement } from '../src/ntqqapi/types'
import { SendElement } from '../src/ntqqapi/entities'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const TEST_GROUP = process.env.QQ_TEST_GROUP || '164461995'
const TEST_AT_UID = process.env.TEST_AT_UID || process.env.QQ_TEST_UID || 'u_snYxnEfja-Po_cdFcyccRQ'
const FIXTURE_DIR = resolve('test/onebot11-api-test/tests/media')
const TEST_PIC = resolve(process.env.TEST_PIC || 'test/qr-code.png')
const TEST_PTT = resolve(process.env.TEST_PTT || `${FIXTURE_DIR}/test2.mp3`)
const TEST_VIDEO = resolve(process.env.TEST_VIDEO || `${FIXTURE_DIR}/test.mp4`)
const TEST_FILE = resolve(process.env.TEST_FILE || `${FIXTURE_DIR}/test.gif`)
const RUN_DESTRUCTIVE = process.env.RUN_DESTRUCTIVE === '1'

const COLOR = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
}

type Status = 'PASS' | 'FAIL' | 'SKIP'
const results: { name: string; status: Status; detail: string }[] = []

async function sendAndVerify(
  ctx: any,
  name: string,
  buildElems: () => Promise<SendMessageElement[]> | SendMessageElement[],
  verify: (msg: RawMessage) => boolean | string,
  options: { skipReason?: string, /** 视频等异步消息：无 msgSeq 也算 PASS（仅检查 sendMsg 不抛错） */ allowMissingSeq?: boolean } = {},
): Promise<RawMessage | undefined> {
  if (options.skipReason) {
    results.push({ name, status: 'SKIP', detail: options.skipReason })
    console.log(COLOR.gray(`SKIP  ${name}  (${options.skipReason})`))
    return
  }
  const peer: Peer = { chatType: ChatType.Group, peerUid: TEST_GROUP, guildId: '' }
  try {
    const elems = await buildElems()
    const sent = await ctx.ntMsgApi.sendMsg(peer, elems)
    if (!sent?.msgSeq || sent.msgSeq === '0') {
      if (options.allowMissingSeq) {
        results.push({ name, status: 'PASS', detail: '(no seq, async msg)' })
        console.log(COLOR.green(`PASS  ${name}`), COLOR.gray('(sent, server returned no seq — async)'))
        return
      }
      results.push({ name, status: 'FAIL', detail: 'no msgSeq returned' })
      console.log(COLOR.red(`FAIL  ${name}`), COLOR.gray('no msgSeq'))
      return
    }
    await new Promise(r => setTimeout(r, 800))
    const back = await ctx.ntMsgApi.getSingleMsg(peer, sent.msgSeq)
    const found = back.msgList?.[0] as RawMessage
    if (!found) {
      results.push({ name, status: 'FAIL', detail: `seq ${sent.msgSeq} not found` })
      console.log(COLOR.red(`FAIL  ${name}`), COLOR.gray(`seq ${sent.msgSeq} not found`))
      return
    }
    const v = verify(found)
    if (v !== true) {
      const reason = typeof v === 'string' ? v : 'verify failed'
      const summary = JSON.stringify(found.elements?.map((e: any) => ({
        type: e.elementType,
        text: e.textElement?.content,
        atType: e.textElement?.atType,
        face: e.faceElement?.faceIndex,
        market: e.marketFaceElement?.faceName,
        reply: e.replyElement?.sourceMsgIdInRecords || e.replyElement?.replayMsgSeq,
        picMd5: e.picElement?.md5HexStr,
        pttMd5: e.pttElement?.md5HexStr,
        videoFileSize: e.videoElement?.fileSize,
      }))).slice(0, 300)
      results.push({ name, status: 'FAIL', detail: `${reason} | ${summary}` })
      console.log(COLOR.red(`FAIL  ${name}`), COLOR.gray(reason), COLOR.gray(summary))
      return found
    }
    results.push({ name, status: 'PASS', detail: '' })
    console.log(COLOR.green(`PASS  ${name}`))
    return found
  } catch (e) {
    results.push({ name, status: 'FAIL', detail: (e as Error).message })
    console.log(COLOR.red(`FAIL  ${name}`), COLOR.gray((e as Error).message))
  }
}

async function main() {
  if (!RUN_DESTRUCTIVE) {
    console.log(COLOR.yellow('Set RUN_DESTRUCTIVE=1 to run segment tests (will send real messages to group).'))
    process.exit(0)
  }

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
    console.log(COLOR.red('Not logged in.'))
    process.exit(1)
  }
  console.log(COLOR.cyan(`\n=== Logged in as ${selfInfo.uin}; testing segments in group ${TEST_GROUP} ===\n`))

  // 解析 @某人 用的 uin + self 在群里的角色
  let atUin = 0
  try {
    const u = await ctx.ntUserApi.getUinByUid(TEST_AT_UID)
    atUin = +u
  } catch {}
  let selfRole: number | undefined
  try {
    const me = await ctx.ntGroupApi.getGroupMember(TEST_GROUP, selfInfo.uid)
    selfRole = me?.role
  } catch {}
  const isAdmin = selfRole === 4 || selfRole === 3
  console.log(COLOR.gray(`  (self role=${selfRole}, isAdmin=${isAdmin}; @全体需要管理员权限)\n`))

  // 1. 纯文本
  const marker = `apitest-text-${Date.now()}`
  await sendAndVerify(ctx, 'Text plain',
    () => [{ elementType: ElementType.Text, elementId: '', textElement: { content: marker, atType: 0, atUid: '', atTinyId: '', atNtUid: '' } } as any],
    (m) => {
      const e = m.elements?.[0]
      if (e?.elementType !== ElementType.Text) return `wrong elementType ${e?.elementType}`
      if (e.textElement?.content !== marker) return `content "${e.textElement?.content}" != "${marker}"`
      return true
    })

  // 2. @全体成员 + 文字（需要群管理员权限，否则服务端拒）
  await sendAndVerify(ctx, 'Text + @全体',
    () => [
      { elementType: ElementType.Text, elementId: '', textElement: { content: '@全体成员', atType: AtType.All, atUid: '', atTinyId: '', atNtUid: '' } } as any,
      { elementType: ElementType.Text, elementId: '', textElement: { content: ' apitest-atall', atType: 0, atUid: '', atTinyId: '', atNtUid: '' } } as any,
    ],
    (m) => {
      const els = m.elements
      if (!els || els.length < 2) return `expected ≥2 elements got ${els?.length}`
      const at = els[0]
      if (at.elementType !== ElementType.Text) return 'first elem not text'
      if (at.textElement?.atType !== AtType.All) return `atType ${at.textElement?.atType} != ${AtType.All}`
      return true
    },
    { skipReason: isAdmin ? undefined : 'self is not group admin' })

  // 3. @某人 + 文字
  await sendAndVerify(ctx, 'Text + @某人',
    () => [
      { elementType: ElementType.Text, elementId: '', textElement: { content: `@测试`, atType: AtType.One, atUid: TEST_AT_UID, atNtUid: TEST_AT_UID, atTinyId: '' } } as any,
      { elementType: ElementType.Text, elementId: '', textElement: { content: ' apitest-atone', atType: 0, atUid: '', atTinyId: '', atNtUid: '' } } as any,
    ],
    (m) => {
      const at = m.elements?.[0]
      if (at?.elementType !== ElementType.Text) return 'first elem not text'
      if (at.textElement?.atType !== AtType.One) return `atType ${at.textElement?.atType} != ${AtType.One}`
      return true
    },
    { skipReason: atUin <= 0 ? 'no resolvable atUin' : undefined })

  // 4. QQ 表情（faceIndex=14 微笑）
  await sendAndVerify(ctx, 'Face (smile)',
    () => [
      { elementType: ElementType.Face, elementId: '', faceElement: { faceIndex: 14, faceType: 1 } } as any,
    ],
    (m) => {
      const f = m.elements?.find((e: any) => e.elementType === ElementType.Face)
      if (!f) return 'no face element'
      if (f.faceElement?.faceIndex !== 14) return `faceIndex=${f.faceElement?.faceIndex}`
      return true
    })

  // 5. 引用回复（先发一条，再回复它）
  let prevMsg: RawMessage | undefined
  prevMsg = await sendAndVerify(ctx, 'Text (for reply target)',
    () => [{ elementType: ElementType.Text, elementId: '', textElement: { content: 'apitest-reply-target', atType: 0, atUid: '', atTinyId: '', atNtUid: '' } } as any],
    () => true)
  if (prevMsg) {
    await sendAndVerify(ctx, 'Reply to previous',
      () => [
        { elementType: ElementType.Reply, elementId: '', replyElement: {
          replayMsgSeq: prevMsg!.msgSeq,
          replayMsgId: prevMsg!.msgId,
          senderUid: prevMsg!.senderUid,
          senderUidStr: prevMsg!.senderUid,
          replyMsgTime: prevMsg!.msgTime,
          sourceMsgIdInRecords: prevMsg!.msgId,
        }} as any,
        { elementType: ElementType.Text, elementId: '', textElement: { content: 'apitest-reply-body', atType: 0, atUid: '', atTinyId: '', atNtUid: '' } } as any,
      ],
      (m) => {
        const r = m.elements?.find((e: any) => e.elementType === ElementType.Reply)
        if (!r) return 'no reply element'
        // 服务端可能回 replayMsgSeq 或 sourceMsgIdInRecords 之一
        const seqInReply = String(r.replyElement?.replayMsgSeq ?? '0')
        if (seqInReply !== prevMsg!.msgSeq && !r.replyElement?.sourceMsgIdInRecords) {
          return `reply seq mismatch: ${seqInReply} vs ${prevMsg!.msgSeq}`
        }
        return true
      })
  }

  // 6. 图片
  await sendAndVerify(ctx, 'Pic (qr-code.png)',
    async () => [await SendElement.pic(ctx, TEST_PIC)],
    (m) => {
      const p = m.elements?.find((e: any) => e.elementType === ElementType.Pic)
      if (!p) return 'no pic element'
      if (!p.picElement?.md5HexStr) return 'no md5'
      return true
    },
    { skipReason: existsSync(TEST_PIC) ? undefined : `pic ${TEST_PIC} not found` })

  // 7. 语音（自动 mp3 → silk）
  await sendAndVerify(ctx, 'Ptt (mp3 → silk)',
    async () => [await SendElement.ptt(ctx, TEST_PTT)],
    (m) => {
      const p = m.elements?.find((e: any) => e.elementType === ElementType.Ptt)
      if (!p) return 'no ptt element'
      if (!p.pttElement?.md5HexStr) return 'no md5'
      return true
    },
    { skipReason: existsSync(TEST_PTT) ? undefined : `ptt ${TEST_PTT} not found` })

  // 8. 视频（自动抽帧做缩略图）。视频是异步消息，server 不立即返 sequence，只验证发送不抛错
  await sendAndVerify(ctx, 'Video (mp4)',
    async () => [await SendElement.video(ctx, TEST_VIDEO)],
    (m) => {
      const v = m.elements?.find((e: any) => e.elementType === ElementType.Video)
      if (!v) return 'no video element'
      return true
    },
    {
      skipReason: existsSync(TEST_VIDEO) ? undefined : `video ${TEST_VIDEO} not found`,
      allowMissingSeq: true,
    })

  // 9. 群文件
  await sendAndVerify(ctx, 'GroupFile',
    async () => [await SendElement.file(ctx, TEST_FILE, 'apitest.gif')],
    (m) => {
      const f = m.elements?.find((e: any) => e.elementType === ElementType.File)
      if (!f) return 'no file element'
      return true
    },
    { skipReason: existsSync(TEST_FILE) ? undefined : `file ${TEST_FILE} not found` })

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
