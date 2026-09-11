import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/main/qqProtocol/direct-lib/machineGuid', () => ({
  loadMachineGuidSync: () => Buffer.alloc(16, 0x11),
}))

import { DirectProtocolClient, SessionInfo } from '@/main/qqProtocol/direct-lib/client'
import { startHeartbeat } from '@/main/qqProtocol/direct-lib/online'

function int32(v: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeInt32BE(v)
  return b
}

/** 造一个未加密 (EncryptType.NoEncrypt) 的 12 型响应帧, 对应 parseServicePacket 的入参形态. */
function buildResponseFrame(opts: { seq: number; retCode: number; extraMsg?: string; cmd: string; body?: Buffer }): Buffer {
  const extra = Buffer.from(opts.extraMsg ?? '')
  const cmd = Buffer.from(opts.cmd)
  const head = Buffer.concat([
    int32(0),
    int32(opts.seq),
    int32(opts.retCode),
    int32(extra.length + 4), extra,
    int32(cmd.length + 4), cmd,
  ])
  head.writeInt32BE(head.length, 0)
  const payload = opts.body ?? Buffer.alloc(0)
  const uin = Buffer.from('10000')
  return Buffer.concat([
    int32(12),
    Buffer.from([0x00, 0x00]),
    int32(uin.length + 4), uin,
    head,
    int32(payload.length + 4), payload,
  ])
}

function fakeSession(): SessionInfo {
  return {
    uin: '10000',
    uid: 'u_test',
    d2: Buffer.alloc(0),
    d2Key: Buffer.alloc(16),
    tgt: Buffer.alloc(0),
    a2: Buffer.alloc(0),
    a2Key: Buffer.alloc(16),
    sKey: Buffer.alloc(0),
  }
}

describe('无主错误帧', () => {
  it('retCode != 0 且匹配不上在飞请求时不当推送分发', () => {
    const client = new DirectProtocolClient()
    client.setSession(fakeSession())
    const onPush = vi.fn()
    client.on('push', onPush)

    // -10001 有专门的 session 失效通路 (见 directSession.test.ts), 这里用别的错误码
    ;(client as unknown as { handlePacket(f: Buffer): void }).handlePacket(
      buildResponseFrame({ seq: 0, retCode: -20003, extraMsg: 'boom', cmd: 'OidbSvc.0x9082' }),
    )

    // body 不是有效 protobuf, 喂给 dispatcher 只会解出垃圾
    expect(onPush).not.toHaveBeenCalled()
  })
})

describe('心跳连续失败', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('连挂 3 次就主动断开, 不再无限重试', async () => {
    const client = {
      isLoggedIn: true,
      disconnect: vi.fn(),
      sendCommand: vi.fn().mockRejectedValue(new Error('timed out')),
    } as unknown as DirectProtocolClient

    startHeartbeat(client)

    await vi.advanceTimersByTimeAsync(4.5 * 60 * 1000)
    expect(client.disconnect).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(30 * 1000)
    expect(client.disconnect).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(30 * 1000)
    expect(client.disconnect).toHaveBeenCalledTimes(1)

    // 断开后不再排新 tick
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(client.sendCommand).toHaveBeenCalledTimes(3)
  })

  it('session 已被 session-expired 清掉时立即断开, 不等满 3 次', async () => {
    const client = {
      isLoggedIn: false,
      disconnect: vi.fn(),
      sendCommand: vi.fn().mockRejectedValue(new Error('timed out')),
    } as unknown as DirectProtocolClient

    startHeartbeat(client)
    await vi.advanceTimersByTimeAsync(4.5 * 60 * 1000)
    expect(client.disconnect).toHaveBeenCalledTimes(1)
  })

  it('停止函数能取消后续 tick', async () => {
    const client = {
      isLoggedIn: true,
      disconnect: vi.fn(),
      sendCommand: vi.fn().mockResolvedValue({}),
    } as unknown as DirectProtocolClient

    const stop = startHeartbeat(client)
    stop()
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
    expect(client.sendCommand).not.toHaveBeenCalled()
  })
})
