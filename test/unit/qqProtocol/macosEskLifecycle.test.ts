import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// macOS 两步 sign token 在 client 这一层的生命周期: ESK 按连接走 (断线作废 / 过 TTL 重跑),
// 以及签名时 device token 的取法 (PoC main.rs send())。

vi.mock('@/common/utils/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/common/utils/environment')>()),
  getProtocol: () => 'macos',
}))

vi.mock('@/main/qqProtocol/direct-lib/machineGuid', () => ({
  loadMachineGuidSync: () => Buffer.alloc(16, 0x11),
}))

vi.mock('@/main/qqProtocol/direct-lib/sign', () => ({
  requestSign: vi.fn(),
  setupSign: vi.fn(),
  setSignMachineGuid: vi.fn(),
  acquireSignToken: vi.fn(),
  acquireMacosEskOnly: vi.fn(),
}))

vi.mock('@/main/qqProtocol/direct-lib/connection', () => ({
  TcpConnection: class extends EventEmitter {
    send = vi.fn()
    connect = vi.fn(async () => {})
    disconnect = vi.fn(() => {
      this.emit('close')
    })
  },
}))

import { DirectProtocolClient, type SessionInfo } from '@/main/qqProtocol/direct-lib/client'
import {
  acquireMacosEskOnly,
  acquireSignToken,
  requestSign,
  type MacosEskState,
} from '@/main/qqProtocol/direct-lib/sign'

const esk = vi.mocked(acquireMacosEskOnly)
const acquire = vi.mocked(acquireSignToken)
const sign = vi.mocked(requestSign)

const SSO_INFO_SYNC = 'trpc.msg.register_proxy.RegisterProxy.SsoInfoSync'
const SA2_ACCESS = 'trpc.o3.ecdh_access.EcdhAccess.SsoSecureA2Access'

function eskState(token: string, ttlMs = 3_600_000): MacosEskState {
  return { token, aesKey: 'k', shareId: 's', devicePbHex: 'aa', ttlSecs: ttlMs / 1000, expiresAt: Date.now() + ttlMs }
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

/** requestSign is mocked to fail, so sendCommand stops right after picking the device token. */
async function deviceTokenFor(client: DirectProtocolClient, cmd: string): Promise<string | undefined> {
  sign.mockClear()
  await client.sendCommand(cmd, Buffer.alloc(0)).catch(() => {})
  expect(sign).toHaveBeenCalledTimes(1)
  return sign.mock.calls[0][6]
}

describe('macOS ESK 生命周期', () => {
  beforeEach(() => {
    esk.mockReset()
    acquire.mockReset().mockResolvedValue({ token: 'SA2_TOKEN_01', ttlSecs: 7200 })
    sign.mockReset().mockResolvedValue(null)
  })

  it('同一连接内 ESK 只跑一次, 断线后重连会重跑', async () => {
    const client = new DirectProtocolClient({ authToken: 'jwt' })
    esk.mockResolvedValueOnce(eskState('ESK_1')).mockResolvedValueOnce(eskState('ESK_2'))

    await client.acquirePreLoginToken()
    await client.acquirePreLoginToken()
    expect(esk).toHaveBeenCalledTimes(1)

    client.disconnect()
    await client.acquirePreLoginToken()
    expect(esk).toHaveBeenCalledTimes(2)
  })

  it('ESK 在飞时连接断了, 结果作废, 下一条连接重新跑', async () => {
    const client = new DirectProtocolClient({ authToken: 'jwt' })
    let resolveStale!: (v: MacosEskState) => void
    esk
      .mockImplementationOnce(() => new Promise((r) => { resolveStale = r }))
      .mockResolvedValueOnce(eskState('ESK_2'))

    const pending = client.acquirePreLoginToken()
    client.disconnect()
    resolveStale(eskState('ESK_STALE'))
    await pending

    await client.acquirePreLoginToken()
    expect(esk).toHaveBeenCalledTimes(2)
  })

  it('ESK 过了 TTL, 登录后取 token 前先重跑 ESK, A2+SA2 用新的', async () => {
    const client = new DirectProtocolClient({ authToken: 'jwt' })
    esk.mockResolvedValueOnce(eskState('ESK_OLD', -1)).mockResolvedValueOnce(eskState('ESK_NEW'))

    await client.acquirePreLoginToken()
    client.setSession(fakeSession())

    await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(1))
    expect(esk).toHaveBeenCalledTimes(2)
    expect(acquire.mock.calls[0][2]).toMatchObject({ token: 'ESK_NEW' })
  })

  it('握手命令签名不带 device token; 业务命令在 SA2 之前用 ESK token1, 之后用 SA2 token', async () => {
    const client = new DirectProtocolClient({ authToken: 'jwt' })
    esk.mockResolvedValueOnce(eskState('ESK_1'))
    let resolveSa2!: (v: { token: string; ttlSecs: number }) => void
    acquire.mockImplementationOnce(() => new Promise((r) => { resolveSa2 = r }))

    await client.acquirePreLoginToken()
    expect(await deviceTokenFor(client, SSO_INFO_SYNC)).toBeUndefined() // not logged in yet

    client.setSession(fakeSession())
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(1))
    expect(await deviceTokenFor(client, SA2_ACCESS)).toBeUndefined()
    expect(await deviceTokenFor(client, SSO_INFO_SYNC)).toBe('ESK_1')

    resolveSa2({ token: 'SA2_TOKEN_01', ttlSecs: 7200 })
    await vi.waitFor(() => expect(client.getSession()?.signToken12B).toBe('SA2_TOKEN_01'))
    expect(await deviceTokenFor(client, SSO_INFO_SYNC)).toBe('SA2_TOKEN_01')
    expect(await deviceTokenFor(client, SA2_ACCESS)).toBeUndefined()
  })
})
