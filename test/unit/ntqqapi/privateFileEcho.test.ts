import { describe, it, expect, vi, beforeEach } from 'vitest'

// 私聊文件发送必须自己补一条 nt/message-sent。这条路不走 app.sendMessage (它只处理
// sendMsg(elements)), 所以少了这次补发, WebUI 的 SSE 流就没有任何事件: ChatInput 发送成功
// 立刻删掉临时气泡、等真消息回填, 结果聊天窗口彻底空白; OneBot / Milky 也收不到自己发的文件。
// 字段形状要跟接收端 dispatcher.convertToRawMessage 的 PrivateFile 分支对齐, 否则两端渲染不一致。

import { NTMsgApi } from '@/ntqqapi/api/msg'
import { ChatType, ElementType, type RawMessage } from '@/ntqqapi/types'
import { selfInfo } from '@/common/globalVars'

const SELF_UID = 'u_self_test'
const SELF_UIN = '721011692'
const PEER_UID = 'u_peer_test'
const PEER_UIN = 379450326

const FILE_10M_MD5 = Buffer.from('84b9ad705c01f55e9bdae09eff09d943', 'hex')
const SEND_OPTS = {
  toUin: PEER_UIN,
  toUid: PEER_UID,
  fileUuid: 'ecc3f92af95b09df4de35ea1c783c368_08685e9e',
  fileName: '使用说明-win-cli.txt',
  fileSize: 303,
  file10MMd5: FILE_10M_MD5,
  crcMedia: 'crc1',
}

// sendC2CFileMessage 的返回形状 (见 mixins/message.ts)。
function protocolResult(overrides: Record<string, unknown> = {}) {
  return {
    resultCode: 0,
    errMsg: '',
    sequence: 2269,
    timestamp: 1791296838,
    random: 3341707466,
    clientSequence: 59603,
    expireTime: 1791901635,
    ...overrides,
  }
}

/**
 * 只测 sendPrivateFileMessage 这一个方法, 绕开 cordis Service 的构造 (super(ctx,'ntMsgApi')
 * 会往容器里注册, 对这个断言没有意义)。该方法只碰 ctx.qqProtocol 和 ctx.parallel。
 */
function makeApi(sendC2CFileMessage: ReturnType<typeof vi.fn>) {
  const parallel = vi.fn()
  const api = Object.create(NTMsgApi.prototype) as NTMsgApi
  Object.defineProperty(api, 'ctx', {
    value: { qqProtocol: { sendC2CFileMessage }, parallel },
    writable: true,
  })
  return { api, parallel }
}

function sentMessage(parallel: ReturnType<typeof vi.fn>): RawMessage {
  const call = parallel.mock.calls.find(c => c[0] === 'nt/message-sent')
  expect(call, '没有补发 nt/message-sent').toBeDefined()
  return call![1].message as RawMessage
}

describe('私聊文件发送补 nt/message-sent', () => {
  beforeEach(() => {
    selfInfo.uid = SELF_UID
    selfInfo.uin = SELF_UIN
  })

  it('发送成功后补一条带 fileElement 的自发消息', async () => {
    const send = vi.fn(async () => protocolResult())
    const { api, parallel } = makeApi(send)

    await api.sendPrivateFileMessage(SEND_OPTS)

    const msg = sentMessage(parallel)
    expect(msg.chatType).toBe(ChatType.C2C)
    expect(msg.peerUid).toBe(PEER_UID)
    expect(msg.peerUin).toBe(PEER_UIN)
    expect(msg.senderUid).toBe(SELF_UID)
    expect(msg.senderUin).toBe(+SELF_UIN)
    expect(msg.elements).toHaveLength(1)
    expect(msg.elements[0].elementType).toBe(ElementType.File)
    expect(msg.elements[0].fileElement).toMatchObject({
      fileName: SEND_OPTS.fileName,
      fileSize: SEND_OPTS.fileSize,
      fileUuid: SEND_OPTS.fileUuid,
      // 接收端的 fileMd5 来自 FileExtra.file.fileMd5, 发送时填的就是 file10MMd5
      fileMd5: FILE_10M_MD5.toString('hex'),
      expireTime: 1791901635,
    })
  })

  it('msgId 用 C2C 本地公式算, 跟接收端 convertToRawMessage 一致', async () => {
    const send = vi.fn(async () => protocolResult())
    const { api, parallel } = makeApi(send)

    await api.sendPrivateFileMessage(SEND_OPTS)

    const msg = sentMessage(parallel)
    // dispatcher.convertToRawMessage: msgUid || ((0x01000000<<32)|random)
    expect(msg.msgId).toBe(String((0x01000000n << 32n) | 3341707466n))
    expect(msg.msgRandom).toBe(3341707466)
    expect(msg.msgSeq).toBe(2269)
    expect(msg.msgTime).toBe(1791296838)
    // 撤回 C2C 要靠它定位消息 (SsoC2CRecallMsg.info.clientSequence)
    expect(msg.clientSeq).toBe(59603)
  })

  it('返回值带上 message, 调用方能拿到真 msgId 而不是 fileId', async () => {
    const send = vi.fn(async () => protocolResult())
    const { api } = makeApi(send)

    const r = await api.sendPrivateFileMessage(SEND_OPTS)

    expect(r.message?.msgId).toBe(String((0x01000000n << 32n) | 3341707466n))
  })

  it('发送失败不补事件, 免得界面上出现一条根本没发出去的消息', async () => {
    const send = vi.fn(async () => protocolResult({ resultCode: 1, errMsg: 'boom' }))
    const { api, parallel } = makeApi(send)

    const r = await api.sendPrivateFileMessage(SEND_OPTS)

    expect(parallel).not.toHaveBeenCalled()
    expect(r.message).toBeUndefined()
    expect(r.resultCode).toBe(1)
  })

  it('server 没给 sendTime / c2cMsgSeq 时也要能渲染, 不能让气泡掉队到列表顶上', async () => {
    const send = vi.fn(async () => protocolResult({ timestamp: undefined, sequence: undefined }))
    const { api, parallel } = makeApi(send)

    await api.sendPrivateFileMessage(SEND_OPTS)

    const msg = sentMessage(parallel)
    // msgTime 是 ChatWindow 的排序键, 填 0 会把这条排到最早
    expect(msg.msgTime).toBeGreaterThan(0)
    expect(msg.msgSeq).toBe(0)
  })
})
