import { EventEmitter } from 'node:events'
import { Context, Service } from 'cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectQQProtocol } from '../../../src/plugin/internal/protocol/nt-protocol/qqProtocol/direct'
import { DirectProtocolClient, type SessionInfo } from '../../../src/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/client'
import { deleteSession, loadSession } from '../../../src/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/session'
import { getCurrentLoginState } from '../../../src/plugin/internal/protocol/nt-protocol/llbot-ipc'
import type { SelfInfo } from '../../../src/plugin/internal/protocol/nt-protocol/ntqqapi/types'

// Switching the NT protocol plugin off: everything the protocol started has to stop, and switching it back on
// has to reuse the client native sign is bound to.

vi.mock('@/common/globalVars', () => ({
  TEMP_DIR: '/tmp/test-data/temp',
}))

// The protocol's record of the account as a test starts: logged in
function loggedIn<T extends { selfInfo: SelfInfo }>(protocol: T): T {
  Object.assign(protocol.selfInfo, { uin: '123456', uid: 'test-uid', nick: 'TestBot', online: true })
  return protocol
}

vi.mock('@/main/config', () => ({
  authTokenUtil: { reload: vi.fn(() => 'test-auth-token') },
}))

vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/authTokenWatcher', () => ({
  AuthTokenWatcher: class {
    start = vi.fn()
    stop = vi.fn()
    check = vi.fn()
  },
}))

vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/machineGuid', () => ({
  loadMachineGuidSync: vi.fn(() => Buffer.alloc(16)),
  overwriteMachineGuid: vi.fn(),
  deleteMachineGuid: vi.fn(),
}))

vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/session', () => ({
  saveSession: vi.fn(),
  loadSession: vi.fn(),
  deleteSession: vi.fn(),
  listAvailableSessions: vi.fn(() => []),
  persistedToSessionInfo: vi.fn(),
  getSpecifiedUin: vi.fn(() => undefined),
  getSessionFilePathForUin: vi.fn(),
}))

vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/sign', () => ({
  requestSign: vi.fn(),
  setupSign: vi.fn(),
  setSignMachineGuid: vi.fn(),
  acquireSignToken: vi.fn(async () => ({ token: 'test-token', ttlSecs: 3600 })),
  updateAuthToken: vi.fn(async () => {}),
  startLinuxSsoReport: vi.fn(async () => {}),
  stopLinuxSsoReport: vi.fn(),
  buildLinuxXwidBody: vi.fn(() => null),
  signLinuxXwidBurst: vi.fn(async () => null),
  acquireMacosEskOnly: vi.fn(),
}))

vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/online', () => ({
  registerOnline: vi.fn(async () => 'ok'),
  startHeartbeat: vi.fn(() => vi.fn()),
}))

vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/connection', () => ({
  TcpConnection: class extends EventEmitter {
    isConnected = false
    send = vi.fn()
    connect = vi.fn(async () => {
      this.isConnected = true
    })
    disconnect = vi.fn(() => {
      this.isConnected = false
      this.emit('close')
    })
  },
}))

function createSession(): SessionInfo {
  return {
    uin: '123456',
    uid: 'test-uid',
    d2: Buffer.alloc(16),
    d2Key: Buffer.alloc(16),
    tgt: Buffer.alloc(16),
    a2: Buffer.alloc(16),
    a2Key: Buffer.alloc(16),
    sKey: Buffer.alloc(0),
  }
}

beforeEach(() => {
  // connect() waits for the server to answer Heartbeat.Alive, which the fake connection never does
  vi.spyOn(DirectProtocolClient.prototype, 'sendHeartbeat').mockResolvedValue(undefined)
  vi.spyOn(DirectProtocolClient.prototype as unknown as { startHeartbeatAlive(): void }, 'startHeartbeatAlive')
    .mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('switching the direct protocol off', () => {
  it('disconnects quietly, keeping the saved session for the next login', async () => {
    vi.useFakeTimers()
    const ctx = new Context()
    const protocol = loggedIn(new DirectQQProtocol(ctx))
    const client = new DirectProtocolClient()
    await client.connect()
    client.setSession(createSession())
    protocol['directClient'] = client
    protocol['onlineEmitted'] = true
    protocol['bindDirectClientEvents'](client)
    const stopHeartbeat = vi.fn()
    protocol['directStopHeartbeat'] = stopHeartbeat
    const reconnect = vi.fn()
    protocol['reconnectTimer'] = setTimeout(reconnect, 5000) as unknown as NodeJS.Timeout
    const disconnected = vi.fn()
    ctx.on('protocol/disconnect', disconnected)
    const sessionExpired = vi.fn()
    ctx.on('qq/session-expired', sessionExpired)

    await protocol['stop']()

    expect(protocol['tokenWatcher'].stop).toHaveBeenCalledTimes(1)
    expect(stopHeartbeat).toHaveBeenCalledTimes(1)
    expect(client['conn'].disconnect).toHaveBeenCalledTimes(1)
    expect(client.isLoggedIn).toBe(false)
    for (const event of ['session-expired', 'sign-refused', 'error', 'connected', 'close', 'push']) {
      expect(client.listenerCount(event), event).toBe(0)
    }
    // Nothing for the email notification to report, and the account can come back without a QR code
    expect(disconnected).not.toHaveBeenCalled()
    expect(sessionExpired).not.toHaveBeenCalled()
    expect(deleteSession).not.toHaveBeenCalled()
    expect(protocol.selfInfo).toMatchObject({ online: false, uin: '', uid: '', nick: '' })
    expect(getCurrentLoginState()).toMatchObject({ state: 'initializing' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(reconnect).not.toHaveBeenCalled()
    expect(protocol.get_is_connected()).toBe(false)
  })

  it('stops the QR loop', async () => {
    vi.useFakeTimers()
    const protocol = loggedIn(new DirectQQProtocol(new Context()))
    protocol.selfInfo.online = false
    const print = vi.spyOn(protocol as unknown as { printQrToTerminal(): Promise<void> }, 'printQrToTerminal')
      .mockResolvedValue(undefined)
    protocol['ensureQrLoop']()
    await vi.advanceTimersByTimeAsync(2_500)
    const ticks = print.mock.calls.length
    expect(ticks).toBeGreaterThan(0)

    await protocol['stop']()
    await vi.advanceTimersByTimeAsync(5_000)
    protocol['ensureQrLoop']()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(print).toHaveBeenCalledTimes(ticks)
  })

  it('hands the same client to the protocol that is switched on next', async () => {
    vi.mocked(loadSession).mockReturnValue(undefined)
    const first = loggedIn(new DirectQQProtocol(new Context()))
    await first['doInitDirectClient']('test-auth-token')
    const client = first['directClient']!
    expect(client).toBeInstanceOf(DirectProtocolClient)
    client.emit('sign-refused', 'quota used up')
    await first['stop']()

    const second = loggedIn(new DirectQQProtocol(new Context()))
    await second['doInitDirectClient']('test-auth-token')
    expect(second['directClient']).toBe(client)
    // Connected again, and listened to by the new instance only
    expect(client.isConnected).toBe(true)
    expect(client.listenerCount('push')).toBe(1)
    expect(client.listenerCount('close')).toBe(1)
    // The token status is the instance's: the new one starts clean and hears the client from now on
    expect(second.authTokenStatus.loginError).toBe('')
    client.emit('sign-refused', 'still used up')
    expect(second.authTokenStatus.loginError).toBe('still used up')
    expect(first.authTokenStatus.loginError).toBe('quota used up')
    await second['stop']()
  })

  it('starts the auth token watcher from start() and lets stop() undo it', async () => {
    const protocol = loggedIn(new DirectQQProtocol(new Context()))
    await protocol['start']()
    expect(protocol['tokenWatcher'].start).toHaveBeenCalledTimes(1)
    await protocol['stop']()
    expect(protocol['tokenWatcher'].stop).toHaveBeenCalledTimes(1)
  })
})

