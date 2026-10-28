import { EventEmitter } from 'node:events'
import { Context, Service } from 'cordis'
import { WebSocketServer } from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selfInfo } from '@/common/globalVars'
import { currentPmhqTarget } from '@/common/utils/environment'
import { DirectQQProtocol } from '../../../src/main/qqProtocol/direct'
import { PmhqQQProtocol } from '../../../src/main/qqProtocol/pmhq'
import { DirectProtocolClient, type SessionInfo } from '../../../src/main/qqProtocol/direct-lib/client'
import { startAuthTokenWatcher, stopAuthTokenWatcher } from '../../../src/main/qqProtocol/direct-lib/authTokenWatcher'
import { deleteSession, loadSession } from '../../../src/main/qqProtocol/direct-lib/session'
import { getCurrentLoginState } from '../../../src/main/llbot-ipc'

// Switching the NT protocol plugin off: everything the protocol started has to stop, and switching it back on
// has to reuse the client native sign is bound to.

vi.mock('@/common/globalVars', () => ({
  selfInfo: { uin: '123456', uid: 'test-uid', nick: 'TestBot', online: true },
  authTokenStatus: { loginError: '' },
  TEMP_DIR: '/tmp/test-data/temp',
}))

vi.mock('@/main/config', () => ({
  authTokenUtil: { reload: vi.fn(() => 'test-auth-token') },
}))

vi.mock('@/main/qqProtocol/direct-lib/authTokenWatcher', () => ({
  startAuthTokenWatcher: vi.fn(),
  stopAuthTokenWatcher: vi.fn(),
}))

vi.mock('@/main/qqProtocol/direct-lib/machineGuid', () => ({
  loadMachineGuidSync: vi.fn(() => Buffer.alloc(16)),
  overwriteMachineGuid: vi.fn(),
  deleteMachineGuid: vi.fn(),
}))

vi.mock('@/main/qqProtocol/direct-lib/session', () => ({
  saveSession: vi.fn(),
  loadSession: vi.fn(),
  deleteSession: vi.fn(),
  listAvailableSessions: vi.fn(() => []),
  persistedToSessionInfo: vi.fn(),
  getSpecifiedUin: vi.fn(() => undefined),
  getSessionFilePathForUin: vi.fn(),
}))

vi.mock('@/main/qqProtocol/direct-lib/sign', () => ({
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

vi.mock('@/main/qqProtocol/direct-lib/online', () => ({
  registerOnline: vi.fn(async () => 'ok'),
  startHeartbeat: vi.fn(() => vi.fn()),
}))

vi.mock('@/main/qqProtocol/direct-lib/connection', () => ({
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
  Object.assign(selfInfo, { uin: '123456', uid: 'test-uid', nick: 'TestBot', online: true })
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
    const protocol = new DirectQQProtocol(ctx)
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

    expect(stopAuthTokenWatcher).toHaveBeenCalledTimes(1)
    expect(stopHeartbeat).toHaveBeenCalledTimes(1)
    expect(client['conn'].disconnect).toHaveBeenCalledTimes(1)
    expect(client.isLoggedIn).toBe(false)
    for (const event of ['session-expired', 'error', 'connected', 'close', 'push']) {
      expect(client.listenerCount(event), event).toBe(0)
    }
    // Nothing for the email notification to report, and the account can come back without a QR code
    expect(disconnected).not.toHaveBeenCalled()
    expect(sessionExpired).not.toHaveBeenCalled()
    expect(deleteSession).not.toHaveBeenCalled()
    expect(selfInfo).toMatchObject({ online: false, uin: '', uid: '', nick: '' })
    expect(getCurrentLoginState()).toMatchObject({ state: 'initializing' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(reconnect).not.toHaveBeenCalled()
    expect(protocol.get_is_connected()).toBe(false)
  })

  it('stops the QR loop', async () => {
    vi.useFakeTimers()
    selfInfo.online = false
    const protocol = new DirectQQProtocol(new Context())
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
    const first = new DirectQQProtocol(new Context())
    await first['doInitDirectClient']('test-auth-token')
    const client = first['directClient']!
    expect(client).toBeInstanceOf(DirectProtocolClient)
    await first['stop']()

    const second = new DirectQQProtocol(new Context())
    await second['doInitDirectClient']('test-auth-token')
    expect(second['directClient']).toBe(client)
    // Connected again, and listened to by the new instance only
    expect(client.isConnected).toBe(true)
    expect(client.listenerCount('push')).toBe(1)
    expect(client.listenerCount('close')).toBe(1)
    await second['stop']()
  })

  it('starts the auth token watcher from start() and lets stop() undo it', async () => {
    const protocol = new DirectQQProtocol(new Context())
    await protocol['start']()
    expect(startAuthTokenWatcher).toHaveBeenCalledTimes(1)
    await protocol['stop']()
    expect(stopAuthTokenWatcher).toHaveBeenCalledTimes(1)
  })
})

describe('switching the PMHQ protocol off', () => {
  let wss: WebSocketServer
  let connections: number

  beforeEach(async () => {
    connections = 0
    wss = new WebSocketServer({ port: 0, host: '127.0.0.1' })
    await new Promise(resolve => wss.once('listening', resolve))
    wss.on('connection', () => { connections++ })
    const { port } = wss.address() as { port: number }
    vi.mocked(currentPmhqTarget).mockReturnValue({ host: '127.0.0.1', port: String(port) })
  })

  afterEach(async () => {
    await new Promise(resolve => wss.close(resolve))
  })

  it('closes the socket and stops reconnecting', async () => {
    const protocol = new PmhqQQProtocol(new Context())
    const dispose = await (protocol as unknown as Record<symbol, () => Promise<() => Promise<void>>>)[Service.init]()
    await vi.waitFor(() => expect(connections).toBe(1))
    const [socket] = wss.clients
    const closed = new Promise(resolve => socket.once('close', resolve))

    await dispose()
    await closed
    // The reconnect would have come after 1s
    await new Promise(resolve => setTimeout(resolve, 1_500))
    expect(connections).toBe(1)
    expect(selfInfo.online).toBe(false)
    await expect(protocol.waitConnected()).rejects.toThrow('已停用')
  })
})
