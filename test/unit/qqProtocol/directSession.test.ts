import { EventEmitter } from 'node:events'
import { Context } from 'cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authTokenStatus, selfInfo } from '@/common/globalVars'
import { DirectQQProtocol } from '../../../src/main/qqProtocol/direct'
import { DirectProtocolClient, type SessionInfo } from '../../../src/main/qqProtocol/direct-lib/client'
import {
  fetchQrCode,
  getCorrectUin,
  loginWithQrResult,
  pollQrCode,
  type LoginResult,
} from '../../../src/main/qqProtocol/direct-lib/login'
import { deleteMachineGuid } from '../../../src/main/qqProtocol/direct-lib/machineGuid'
import { registerOnline, startHeartbeat } from '../../../src/main/qqProtocol/direct-lib/online'
import {
  deleteSession,
  loadSession,
  persistedToSessionInfo,
  saveSession,
} from '../../../src/main/qqProtocol/direct-lib/session'
import { requestSign, updateAuthToken } from '../../../src/main/qqProtocol/direct-lib/sign'
import { teaEncrypt } from '../../../src/main/qqProtocol/direct-lib/tea'
import { getCurrentLoginState } from '../../../src/main/llbot-ipc'

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
  getSpecifiedUin: vi.fn(() => '123456'),
  getSessionFilePathForUin: vi.fn(),
}))

vi.mock('@/main/qqProtocol/direct-lib/sign', () => ({
  requestSign: vi.fn(),
  setupSign: vi.fn(),
  setSignMachineGuid: vi.fn(),
  acquireSignToken: vi.fn(async () => ({ token: 'test-token', ttlSecs: 3600 })),
  updateAuthToken: vi.fn(),
}))

vi.mock('@/main/qqProtocol/direct-lib/login', () => ({
  fetchQrCode: vi.fn(),
  pollQrCode: vi.fn(),
  loginWithQrResult: vi.fn(),
  getCorrectUin: vi.fn(),
  QrCodeState: { Confirmed: 0, WaitingForConfirm: 53, Expired: 17, Cancelled: 54 },
}))

vi.mock('@/main/qqProtocol/direct-lib/online', () => ({
  registerOnline: vi.fn(async () => 'ok'),
  startHeartbeat: vi.fn(() => vi.fn()),
}))

vi.mock('@/main/qqProtocol/direct-lib/connection', () => ({
  TcpConnection: class extends EventEmitter {
    isConnected = true
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

function int32(value: number): Buffer {
  const data = Buffer.alloc(4)
  data.writeInt32BE(value)
  return data
}

// Synthetic protocol-12 responses exercise the real parser without account credentials or captured traffic.
function responseFrame(seq: number, retCode = 0, cmd = 'test.command', extraMsg = ''): Buffer {
  const extra = Buffer.from(extraMsg)
  const command = Buffer.from(cmd)
  const head = Buffer.concat([
    int32(seq),
    int32(retCode),
    int32(extra.length + 4),
    extra,
    int32(command.length + 4),
    command,
  ])
  const body = Buffer.concat([int32(head.length + 4), head, int32(4)])
  return Buffer.concat([int32(12), Buffer.from([2, 0]), int32(4), Buffer.from(teaEncrypt(body, Buffer.alloc(16)))])
}

const authMessage = '身份验证失败，请你重新登录。(s20)'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const loginSuccess: LoginResult = {
  success: true,
  ...createSession(),
  tempPassword: Buffer.alloc(16),
  nick: 'TestBot',
  age: 0,
  gender: 0,
}

describe('direct session authentication failures', () => {
  let client: DirectProtocolClient

  beforeEach(() => {
    vi.useFakeTimers()
    client = new DirectProtocolClient()
    client.setSession(createSession())
    selfInfo.online = true
    authTokenStatus.loginError = ''
  })

  afterEach(() => {
    client.disconnect()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each(['unmatched', 'matched'])('invalidates the session for an %s authentication failure', async (kind) => {
    const expired = vi.fn()
    const pushed = vi.fn()
    client.on('session-expired', expired)
    client.on('push', pushed)
    const seq = client['seq']
    const requests = Promise.allSettled([
      client.sendCommand('test.command', Buffer.alloc(0)),
      client.sendCommand('test.other', Buffer.alloc(0)),
    ])

    client['conn'].emit('packet', responseFrame(kind === 'matched' ? seq : 0, -10001, '', authMessage))

    const results = await requests
    for (const result of results) {
      expect(result.status).toBe('rejected')
      if (result.status === 'rejected') expect(result.reason.message).toContain(authMessage)
    }
    expect(client.isLoggedIn).toBe(false)
    expect(expired).toHaveBeenCalledExactlyOnceWith('123456', expect.any(Error))
    expect(pushed).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('invalidates an idle session even when there are no pending requests', () => {
    const expired = vi.fn()
    client.on('session-expired', expired)
    client['conn'].emit('packet', responseFrame(0, -10001, '', authMessage))
    client['conn'].emit('packet', responseFrame(0, -10001, '', authMessage))
    expect(expired).toHaveBeenCalledTimes(1)
    expect(client.isLoggedIn).toBe(false)
  })

  it('keeps ordinary request errors scoped to the matching request', async () => {
    const expired = vi.fn()
    client.on('session-expired', expired)
    const seq = client['seq']
    const first = client.sendCommand('test.command', Buffer.alloc(0))
    const rejected = expect(first).rejects.toThrow('retCode=-2')
    const second = client.sendCommand('test.other', Buffer.alloc(0))

    client['conn'].emit('packet', responseFrame(seq, -2, 'test.command', 'Request failed'))
    client['conn'].emit('packet', responseFrame(seq + 1, 0, 'test.other'))

    await rejected
    await expect(second).resolves.toMatchObject({ cmd: 'test.other', retCode: 0 })
    expect(client.isLoggedIn).toBe(true)
    expect(expired).not.toHaveBeenCalled()
  })

  it('continues forwarding ordinary unsolicited pushes', () => {
    const pushed = vi.fn()
    client.on('push', pushed)
    client['conn'].emit('packet', responseFrame(0, 0, 'trpc.msg.olpush.OlPushService.MsgPush'))
    expect(pushed).toHaveBeenCalledWith(expect.objectContaining({ cmd: 'trpc.msg.olpush.OlPushService.MsgPush' }))
    expect(client.isLoggedIn).toBe(true)
  })

  it('does not send a command whose signing finishes after session invalidation', async () => {
    client.setAuthToken('test-auth-token')
    const session = client.getSession()!
    session.signToken12B = 'test-token'
    session.signTokenExpiresAt = Date.now() + 60_000
    let finishSign!: (result: { sign: Buffer; token: Buffer; extra: Buffer }) => void
    vi.mocked(requestSign).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSign = resolve
        }),
    )
    const request = client.sendCommand('MessageSvc.PbSendMsg', Buffer.alloc(0))
    const rejected = expect(request).rejects.toThrow('QQ session changed')
    await vi.waitFor(() => expect(requestSign).toHaveBeenCalled())

    client['conn'].emit('packet', responseFrame(0, -10001, '', authMessage))
    finishSign({ sign: Buffer.alloc(0), token: Buffer.from('test-token'), extra: Buffer.alloc(0) })

    await rejected
    expect(client['conn'].send).not.toHaveBeenCalled()
  })

  it.each([true, false])('exposes a fresh QR login after invalidation (already online: %s)', async (alreadyOnline) => {
    const ctx = new Context()
    const protocol = new DirectQQProtocol(ctx)
    protocol['directClient'] = client
    protocol['onlineEmitted'] = alreadyOnline
    selfInfo.online = alreadyOnline
    protocol['runtimeUinOverride'] = '123456'
    protocol['qrResult'] = { qrcodeUrl: 'stale', pngBase64: '', expireTimeSec: 180, sig: 'stale' }
    protocol['qrFetchedAt'] = Date.now()
    const stopHeartbeat = vi.fn()
    protocol['directStopHeartbeat'] = stopHeartbeat
    const reconnect = vi.fn()
    protocol['reconnectTimer'] = setTimeout(reconnect, 5000) as unknown as NodeJS.Timeout
    const disconnect = vi.fn()
    ctx.on('protocol/disconnect', disconnect)
    const offline = vi.fn()
    ctx.on('qq/session-expired', offline)
    const qrLoop = vi
      .spyOn(protocol as unknown as { ensureQrLoop(): void }, 'ensureQrLoop')
      .mockImplementation(() => {})
    protocol['bindDirectClientEvents'](client)
    const seq = client['seq']
    const pending = protocol.sendPB('test.command', Buffer.alloc(0))
    const rejected = expect(pending).rejects.toThrow(authMessage)

    client['conn'].emit('packet', responseFrame(0, -10001, '', authMessage))

    await rejected
    expect(selfInfo.online).toBe(false)
    expect(protocol.get_is_connected()).toBe(false)
    expect(authTokenStatus.loginError).toContain(authMessage)
    expect(deleteSession).toHaveBeenCalledExactlyOnceWith('123456')
    expect(deleteMachineGuid).not.toHaveBeenCalled()
    expect(stopHeartbeat).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalledTimes(alreadyOnline ? 1 : 0)
    expect(offline).toHaveBeenCalledTimes(alreadyOnline ? 1 : 0)
    if (alreadyOnline) expect(offline).toHaveBeenCalledWith(expect.stringContaining(authMessage))
    expect(qrLoop).toHaveBeenCalledTimes(1)
    expect(getCurrentLoginState()).toMatchObject({ state: 'need_qrcode' })
    expect(client['conn'].disconnect).not.toHaveBeenCalled()
    await expect(protocol.sendPB('test.command', Buffer.alloc(0))).rejects.toThrow('not logged in')

    // A late reply must not restore the expired session or report the account online.
    client['conn'].emit('packet', responseFrame(seq))
    expect(selfInfo.online).toBe(false)
    vi.mocked(fetchQrCode).mockResolvedValue({
      url: 'fresh-qr',
      image: Buffer.alloc(0),
      sig: Buffer.alloc(16),
      tgtgtKey: Buffer.alloc(16),
    })
    await expect(protocol.getLoginQrCode()).resolves.toMatchObject({ qrcodeUrl: 'fresh-qr' })
    expect(fetchQrCode).toHaveBeenCalledWith(client)
    await vi.advanceTimersByTimeAsync(5000)
    expect(reconnect).not.toHaveBeenCalled()

    // A replacement session can use the same client and report online again.
    client.setSession(createSession())
    selfInfo.online = true
    const online = vi.fn()
    ctx.on('qq/online', online)
    protocol['maybeEmitOnline']()
    expect(online).toHaveBeenCalledTimes(1)
    expect(authTokenStatus.loginError).toBe('')
  })

  it('preserves saved credentials on an ordinary transport close', () => {
    const ctx = new Context()
    const protocol = new DirectQQProtocol(ctx)
    protocol['directClient'] = client
    protocol['onlineEmitted'] = true
    protocol['bindDirectClientEvents'](client)
    const reconnect = vi
      .spyOn(protocol as unknown as { scheduleReconnect(): void }, 'scheduleReconnect')
      .mockImplementation(() => {})

    client['conn'].emit('close')

    expect(selfInfo.online).toBe(false)
    expect(deleteSession).not.toHaveBeenCalled()
    expect(reconnect).toHaveBeenCalledTimes(1)
  })

  it.each(['uin', 'login', 'register'] as const)('abandons QR completion invalidated during %s', async (stage) => {
    const protocol = new DirectQQProtocol(new Context())
    protocol['directClient'] = client
    protocol['qrPollToken'] = 1
    protocol['directQrResult'] = {
      url: 'https://example.com/qr?k=test',
      image: Buffer.alloc(0),
      sig: Buffer.alloc(16),
      tgtgtKey: Buffer.alloc(16),
    }
    protocol['directPollResult'] = { state: 0, tgtgtKey: Buffer.alloc(16) }
    selfInfo.online = false
    vi.spyOn(protocol as unknown as { ensureQrLoop(): void }, 'ensureQrLoop').mockImplementation(() => {})
    protocol['bindDirectClientEvents'](client)
    const uin = deferred<number>()
    const login = deferred<LoginResult>()
    const registration = deferred<string>()
    vi.mocked(getCorrectUin).mockReturnValue(stage === 'uin' ? uin.promise : Promise.resolve(123456))
    vi.mocked(loginWithQrResult).mockReturnValue(stage === 'login' ? login.promise : Promise.resolve(loginSuccess))
    vi.mocked(registerOnline).mockReturnValue(registration.promise)
    const completion = protocol['completeDirectLogin'](1)
    if (stage === 'login') await vi.waitFor(() => expect(loginWithQrResult).toHaveBeenCalled())
    if (stage === 'register') await vi.waitFor(() => expect(registerOnline).toHaveBeenCalled())

    client['conn'].emit('packet', responseFrame(0, -10001, '', authMessage))
    uin.resolve(123456)
    login.resolve(loginSuccess)
    registration.resolve('ok')
    await completion

    expect(client.isLoggedIn).toBe(false)
    expect(selfInfo.online).toBe(false)
    expect(protocol['onlineEmitted']).toBe(false)
    expect(saveSession).not.toHaveBeenCalled()
    expect(startHeartbeat).not.toHaveBeenCalled()
    expect(authTokenStatus.loginError).toContain(authMessage)
    expect(getCurrentLoginState()).toMatchObject({ state: 'need_qrcode' })
  })

  it('does not let a late registration failure clear a replacement session', async () => {
    const protocol = new DirectQQProtocol(new Context())
    protocol['directClient'] = client
    protocol['qrPollToken'] = 1
    protocol['directQrResult'] = {
      url: 'https://example.com/qr?k=test',
      image: Buffer.alloc(0),
      sig: Buffer.alloc(16),
      tgtgtKey: Buffer.alloc(16),
    }
    protocol['directPollResult'] = { state: 0, tgtgtKey: Buffer.alloc(16) }
    selfInfo.online = false
    vi.spyOn(protocol as unknown as { ensureQrLoop(): void }, 'ensureQrLoop').mockImplementation(() => {})
    protocol['bindDirectClientEvents'](client)
    vi.mocked(getCorrectUin).mockResolvedValue(123456)
    vi.mocked(loginWithQrResult).mockResolvedValue(loginSuccess)
    const registration = deferred<string>()
    vi.mocked(registerOnline).mockReturnValue(registration.promise)
    const completion = protocol['completeDirectLogin'](1)
    await vi.waitFor(() => expect(registerOnline).toHaveBeenCalled())

    client['conn'].emit('packet', responseFrame(0, -10001, '', authMessage))
    const replacement = createSession()
    client.setSession(replacement)
    selfInfo.online = true
    authTokenStatus.loginError = ''
    registration.reject(new Error('Old registration failed'))
    await completion

    expect(client.getSession()).toBe(replacement)
    expect(selfInfo.online).toBe(true)
    expect(authTokenStatus.loginError).toBe('')
    expect(saveSession).not.toHaveBeenCalled()
    expect(startHeartbeat).not.toHaveBeenCalled()
  })

  it.each([false, true])('guards saved-session registration after invalidation (late failure: %s)', async (fails) => {
    const protocol = new DirectQQProtocol(new Context())
    protocol['directClient'] = client
    selfInfo.online = false
    vi.spyOn(protocol as unknown as { ensureQrLoop(): void }, 'ensureQrLoop').mockImplementation(() => {})
    protocol['bindDirectClientEvents'](client)
    vi.mocked(updateAuthToken).mockResolvedValue(undefined)
    vi.mocked(loadSession).mockReturnValue({
      uin: '123456',
      uid: 'test-uid',
      guid: Buffer.alloc(16).toString('hex'),
      savedAt: 0,
    })
    vi.mocked(persistedToSessionInfo).mockReturnValue(createSession())
    const registration = deferred<string>()
    vi.mocked(registerOnline).mockReturnValue(registration.promise)
    const completion = protocol['doInitDirectClient']('test-auth-token')
    await vi.waitFor(() => expect(registerOnline).toHaveBeenCalled())

    client['conn'].emit('packet', responseFrame(0, -10001, '', authMessage))
    const replacement = createSession()
    client.setSession(replacement)
    if (fails) registration.reject(new Error('Old registration failed'))
    else registration.resolve('ok')
    await completion

    expect(client.getSession()).toBe(replacement)
    expect(selfInfo.online).toBe(false)
    expect(startHeartbeat).not.toHaveBeenCalled()
    expect(authTokenStatus.loginError).toContain(authMessage)
  })

  it('still saves and announces a current QR login after registration succeeds', async () => {
    const ctx = new Context()
    const protocol = new DirectQQProtocol(ctx)
    protocol['directClient'] = client
    protocol['qrPollToken'] = 1
    protocol['directQrResult'] = {
      url: 'https://example.com/qr?k=test',
      image: Buffer.alloc(0),
      sig: Buffer.alloc(16),
      tgtgtKey: Buffer.alloc(16),
    }
    protocol['directPollResult'] = { state: 0, tgtgtKey: Buffer.alloc(16) }
    selfInfo.online = false
    client.clearSession()
    vi.mocked(pollQrCode).mockResolvedValue(protocol['directPollResult'])
    vi.mocked(getCorrectUin).mockResolvedValue(123456)
    vi.mocked(loginWithQrResult).mockImplementation(async () => {
      client.setSession(createSession())
      return loginSuccess
    })
    const registration = deferred<string>()
    vi.mocked(registerOnline).mockReturnValue(registration.promise)
    const online = vi.fn()
    ctx.on('qq/online', online)
    protocol['startDirectQrPolling']()
    await vi.advanceTimersByTimeAsync(2000)
    await vi.waitFor(() => expect(registerOnline).toHaveBeenCalled())
    expect(saveSession).not.toHaveBeenCalled()
    registration.resolve('ok')
    await vi.waitFor(() => expect(online).toHaveBeenCalledTimes(1))
    expect(saveSession).toHaveBeenCalledTimes(1)
    expect(startHeartbeat).toHaveBeenCalledExactlyOnceWith(client)
    expect(online).toHaveBeenCalledTimes(1)
    expect(selfInfo.online).toBe(true)
  })

  it('cancels QR completion on logout even before a session has been installed', async () => {
    const protocol = new DirectQQProtocol(new Context())
    protocol['directClient'] = client
    protocol['qrPollToken'] = 1
    protocol['directQrResult'] = {
      url: 'https://example.com/qr?k=test',
      image: Buffer.alloc(0),
      sig: Buffer.alloc(16),
      tgtgtKey: Buffer.alloc(16),
    }
    protocol['directPollResult'] = { state: 0, tgtgtKey: Buffer.alloc(16) }
    selfInfo.online = false
    client.clearSession()
    vi.spyOn(protocol as unknown as { ensureQrLoop(): void }, 'ensureQrLoop').mockImplementation(() => {})
    const uin = deferred<number>()
    vi.mocked(getCorrectUin).mockReturnValue(uin.promise)
    const completion = protocol['completeDirectLogin'](1)
    await protocol.logout()
    uin.resolve(123456)
    await completion
    expect(loginWithQrResult).not.toHaveBeenCalled()
    expect(saveSession).not.toHaveBeenCalled()
    expect(selfInfo.online).toBe(false)
  })

  it('rejects a superseded login response before it can install credentials', async () => {
    const { loginWithQrResult: realLogin } = await vi.importActual<
      typeof import('../../../src/main/qqProtocol/direct-lib/login')
    >('../../../src/main/qqProtocol/direct-lib/login')
    client.clearSession()
    const response = deferred<Awaited<ReturnType<DirectProtocolClient['sendCommand']>>>()
    vi.spyOn(client, 'sendCommand').mockReturnValue(response.promise)
    let current = true
    const login = realLogin(
      client,
      {
        state: 0,
        uin: '123456',
        tgtgtKey: Buffer.alloc(16),
        tempPassword: Buffer.alloc(16),
        noPicSig: Buffer.alloc(16),
      },
      () => current,
    )
    const rejected = expect(login).rejects.toThrow('QR login attempt was superseded')
    current = false
    response.resolve({ seq: 1, retCode: 0, extraMsg: '', cmd: 'wtlogin.login', payload: Buffer.alloc(0) })
    await rejected
    expect(client.isLoggedIn).toBe(false)
  })

  it('does not delay disconnect callbacks when unauthenticated pushes keep arriving', async () => {
    const protocol = new DirectQQProtocol(new Context())
    protocol['directClient'] = client
    protocol['bindDirectClientEvents'](client)
    vi.spyOn(protocol as unknown as { ensureQrLoop(): void }, 'ensureQrLoop').mockImplementation(() => {})
    const disconnected = vi.fn()
    protocol.onDisconnect(10000, disconnected)
    protocol['startDisconnectMonitoring']()
    client['conn'].emit('packet', responseFrame(0, -10001, '', authMessage))
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(2000)
      client['conn'].emit('packet', responseFrame(0, -10001, '', authMessage))
    }
    expect(disconnected).toHaveBeenCalledTimes(1)
  })
})
