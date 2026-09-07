import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/main/qqProtocol/direct-lib/machineGuid', () => ({
  loadMachineGuidSync: () => Buffer.alloc(16, 0x11),
}))

// setup.ts 的 environment mock 没带 getProtocol/getCdn, 这里补全 (appInfo 在 import 期就要用)
vi.mock('@/common/utils/environment', () => ({
  isDockerEnvironment: () => false,
  isPmhqMode: () => false,
  getProtocol: () => 'linux',
  getCdn: () => 'cf',
  getSpecifiedUin: () => undefined,
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

function feed(client: DirectProtocolClient, frame: Buffer) {
  // handlePacket 是 conn 的 'packet' 回调, 测试直接喂帧, 不起 TCP.
  ;(client as unknown as { handlePacket(f: Buffer): void }).handlePacket(frame)
}

describe('session 失效帧 (retCode=-10001)', () => {
  let client: DirectProtocolClient

  beforeEach(() => {
    client = new DirectProtocolClient()
    client.setSession(fakeSession())
  })

  it('seq 匹配不上在飞请求时也要认出来, 而不是当推送丢掉', async () => {
    const onExpired = vi.fn()
    const onPush = vi.fn()
    client.on('qq-session-expired', onExpired)
    client.on('push', onPush)

    feed(client, buildResponseFrame({
      seq: 0,
      retCode: -10001,
      extraMsg: '身份验证失败，请你重新登录。(s20)',
      cmd: 'trpc.qq_new_tech.status_svc.StatusService.SsoHeartBeat',
    }))

    // emit 推迟了一个 microtask, 让本帧先处理完
    expect(onExpired).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(onExpired.mock.calls[0][0]).toMatchObject({ retCode: -10001 })
    expect(onPush).not.toHaveBeenCalled()
  })

  it('isLoggedIn 仍为 true, 但 isSessionValid 转 false -- 掉线监控靠后者才测得到', () => {
    expect(client.isSessionValid).toBe(true)
    feed(client, buildResponseFrame({ seq: 0, retCode: -10001, cmd: 'x' }))
    expect(client.isLoggedIn).toBe(true)
    expect(client.isSessionValid).toBe(false)
  })

  it('只上报一次, 后续同类帧不重复触发', async () => {
    const onExpired = vi.fn()
    client.on('qq-session-expired', onExpired)
    feed(client, buildResponseFrame({ seq: 0, retCode: -10001, cmd: 'x' }))
    feed(client, buildResponseFrame({ seq: 0, retCode: -10001, cmd: 'x' }))
    await Promise.resolve()
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it('seq 命中在飞请求时, reject 理由保留真实 retCode', async () => {
    client.on('qq-session-expired', () => client.disconnect())
    const inflight = (client as unknown as {
      pendingPackets: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timeout: NodeJS.Timeout }>
    }).pendingPackets
    const rejected = new Promise<Error>((res) => {
      inflight.set(42, { resolve: () => {}, reject: res as (e: Error) => void, timeout: setTimeout(() => {}, 0) })
    })

    feed(client, buildResponseFrame({ seq: 42, retCode: -10001, extraMsg: 's20', cmd: 'x' }))

    expect((await rejected).message).toContain('retCode=-10001')
  })

  it('重新登录后失效标记清掉', () => {
    feed(client, buildResponseFrame({ seq: 0, retCode: -10001, cmd: 'x' }))
    expect(client.isSessionValid).toBe(false)
    client.setSession(fakeSession())
    expect(client.isSessionValid).toBe(true)
  })

  it('retCode=0 的无主帧照旧当推送分发', () => {
    const onPush = vi.fn()
    client.on('push', onPush)
    feed(client, buildResponseFrame({
      seq: 0,
      retCode: 0,
      cmd: 'trpc.msg.olpush.OlPushService.MsgPush',
      body: Buffer.from([0x0a, 0x00]),
    }))
    expect(onPush).toHaveBeenCalledTimes(1)
    expect(onPush.mock.calls[0][0]).toMatchObject({ cmd: 'trpc.msg.olpush.OlPushService.MsgPush' })
  })
})

describe('心跳连续失败', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('连挂 3 次就主动断开, 不再无限重试', async () => {
    const client = {
      isSessionValid: true,
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

  it('凭据已被判失效时立即断开, 不等满 3 次', async () => {
    const client = {
      isSessionValid: false,
      disconnect: vi.fn(),
      sendCommand: vi.fn().mockRejectedValue(new Error('timed out')),
    } as unknown as DirectProtocolClient

    startHeartbeat(client)
    await vi.advanceTimersByTimeAsync(4.5 * 60 * 1000)
    expect(client.disconnect).toHaveBeenCalledTimes(1)
  })

  it('停止函数能取消后续 tick', async () => {
    const client = {
      isSessionValid: true,
      disconnect: vi.fn(),
      sendCommand: vi.fn().mockResolvedValue({}),
    } as unknown as DirectProtocolClient

    const stop = startHeartbeat(client)
    stop()
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
    expect(client.sendCommand).not.toHaveBeenCalled()
  })
})
