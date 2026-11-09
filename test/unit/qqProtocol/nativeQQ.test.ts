import { Context } from 'cordis'
import { mkdtempSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeQQProtocol } from '@/plugin/internal/protocol/nt-protocol/qqProtocol/nativeQQ'
import { currentNativeQQTarget, getSpecifiedUin, isDockerEnvironment } from '@/common/utils/environment'
import { detectQQPath } from '@/plugin/internal/protocol/nt-protocol/qqPath'

const fixture = vi.hoisted(() => ({
  callback: undefined as ((event: any) => void) | undefined,
  constructed: vi.fn(), start: vi.fn(), stop: vi.fn(), health: vi.fn(), send: vi.fn(), qr: vi.fn(), token: vi.fn(),
  watcherStart: vi.fn(), watcherStop: vi.fn(), watcherCheck: vi.fn(),
  list: vi.fn(), hasList: false, quickLogin: vi.fn(), hasQuickLogin: true,
}))
vi.mock('@/native', () => ({ getNativeAddon: () => ({
  getNativeDirectory: () => '/verified/native',
  NativeQQ: class {
    constructor() { fixture.constructed() }
    start = async (options: unknown, callback: (event: any) => void) => { fixture.callback = callback; await fixture.start(options) }
    stop = fixture.stop
    health = fixture.health
    send = fixture.send
    getLoginQrcode = fixture.qr
    getQuickLoginList = fixture.hasList ? fixture.list : undefined
    quickLogin = fixture.hasQuickLogin ? fixture.quickLogin : undefined
    setAuthToken = fixture.token
  },
}) }))
// The QQ a launch starts is the machine's: one is found unless a test says otherwise
vi.mock('@/plugin/internal/protocol/nt-protocol/qqPath', () => ({ detectQQPath: vi.fn(async () => '/opt/QQ/qq') }))
vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/authTokenWatcher', () => ({
  AuthTokenWatcher: class { start = fixture.watcherStart; stop = fixture.watcherStop; check = fixture.watcherCheck },
}))
let protocol: NativeQQProtocol
let ctx: Context
let configPath: string | undefined
function useConfig(config: Record<string, unknown>): void {
  const directory = mkdtempSync(path.join(tmpdir(), 'llbot-native-test-'))
  configPath = path.join(directory, 'config.json')
  writeFileSync(configPath, JSON.stringify(config), 'utf8')
  vi.mocked(currentNativeQQTarget).mockReturnValue({ configPath, qqPath: '' })
}
beforeEach(() => {
  vi.useFakeTimers()
  fixture.callback = undefined
  fixture.hasList = false
  fixture.hasQuickLogin = true
  fixture.quickLogin.mockResolvedValue({ code: 0 })
  fixture.health.mockResolvedValue({ sessionStatus: 'running', auth_token_set: false })
  fixture.qr.mockResolvedValue({ code: 1 })
  fixture.start.mockResolvedValue(undefined)
  fixture.stop.mockResolvedValue(undefined)
  fixture.token.mockResolvedValue(undefined)
  ctx = new Context()
  protocol = new NativeQQProtocol(ctx)
})
afterEach(async () => {
  await protocol['stop']().catch(() => {})
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (configPath) {
    unlinkSync(configPath)
    rmdirSync(path.dirname(configPath))
    configPath = undefined
  }
})

describe('NativeQQ ownership', () => {
  it('keeps polling after a launch through the Cordis service proxy', async () => {
    fixture.health.mockResolvedValue({ sessionStatus: 'running', uin: 123456, uid: 'u_123456' })
    await protocol['start']()
    await ctx.qqProtocol.launch()
    await vi.advanceTimersByTimeAsync(20 * 60_000)
    expect(fixture.health).toHaveBeenCalledTimes(1201)
    expect(protocol.selfInfo).toMatchObject({ online: true, uin: '123456', uid: 'u_123456' })
    await protocol['stop']()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fixture.health).toHaveBeenCalledTimes(1201)
  })

  it('clears an old identity before a different login while preserving it through health request failures', async () => {
    const identities: string[] = []
    ctx.on('qq/online', () => { identities.push(protocol.selfInfo.uin) })
    const logout = vi.fn()
    ctx.on('qq/logout', logout)
    const health = { sessionStatus: 'running', auth_token_set: true, uin: 10001, uid: 'u_10001' }
    fixture.health.mockImplementation(async () => ({ ...health }))
    await protocol['start']()
    await protocol.launch()
    await vi.advanceTimersByTimeAsync(0)
    expect(identities).toEqual(['10001'])
    fixture.health.mockRejectedValueOnce(new Error('temporary health timeout'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(protocol.selfInfo.uin).toBe('10001')
    expect(logout).not.toHaveBeenCalled()
    Object.assign(health, { uin: 10002, uid: 'u_10002' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(logout).toHaveBeenCalledOnce()
    expect(identities).toEqual(['10001', '10002'])
    Object.assign(health, { uin: 0, uid: '' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(logout).toHaveBeenCalledTimes(2)
    expect(protocol.selfInfo).toMatchObject({ online: false, uin: '', uid: '', nick: '' })
  })

  it('ignores a health response that arrives after the native session ended', async () => {
    const response = Promise.withResolvers<Record<string, unknown>>()
    fixture.health.mockReturnValueOnce(response.promise)
    const online = vi.fn()
    ctx.on('qq/online', online)
    await protocol['start']()
    await protocol.launch()
    fixture.callback?.({ type: 'error', message: 'QQ process stopped' })
    response.resolve({ sessionStatus: 'running', auth_token_set: true, uin: 10001, uid: 'u_10001' })
    await vi.advanceTimersByTimeAsync(0)
    expect(online).not.toHaveBeenCalled()
    expect(protocol.selfInfo).toMatchObject({ online: false, uin: '', uid: '' })
    expect(protocol.get_is_connected()).toBe(false)
  })

  it('uses the verified directory, starts without implicit authorization, and owns the watcher', async () => {
    await protocol['start']()
    await protocol.launch()
    expect(fixture.constructed).toHaveBeenCalledTimes(1)
    expect(fixture.start).toHaveBeenCalledWith({ moduleDir: '/verified/native', config: { auth_token: '', cdn: 'cf' }, subCmdArgs: [] })
    expect(fixture.watcherStart).toHaveBeenCalledTimes(1)
    protocol.checkAuthToken()
    expect(fixture.watcherCheck).toHaveBeenCalledTimes(1)
    await protocol['stop']()
    expect(fixture.watcherStop).toHaveBeenCalled()
    expect(fixture.stop).toHaveBeenCalled()
    expect(protocol.get_is_connected()).toBe(false)
  })

  it('forwards debugger quick login and configured QQ arguments without starting a legacy subprocess', async () => {
    useConfig({ hook_mode: 'debugger', quick_login_qq: '721011692', qq_args: ['--no-sandbox'], sub_cmd: ['legacy-bot'] })
    await protocol['start']()
    const options = fixture.start.mock.calls[0][0]
    expect(options.config).toMatchObject({ hook_mode: 'debugger', quick_login_qq: '721011692', qq_args: ['--no-sandbox'] })
    expect(options.config).not.toHaveProperty('sub_cmd')
    expect(options.subCmdArgs).toEqual([])
    expect(options).not.toHaveProperty('qqArgs')
  })

  it('uses an explicit CLI QQ account in preference to the configuration file account', async () => {
    useConfig({ hook_mode: 'debugger', quick_login_qq: '10001' })
    vi.mocked(getSpecifiedUin).mockReturnValue('721011692')
    await protocol['start']()
    expect(fixture.start.mock.calls[0][0].config).toMatchObject({ hook_mode: 'debugger', quick_login_qq: '721011692' })
  })

  it('publishes online only with both identity fields and republishes after identity recovery', async () => {
    const online = vi.fn()
    const disconnected = vi.fn()
    ctx.on('qq/online', online)
    ctx.on('protocol/disconnect', disconnected)
    const health = { sessionStatus: 'running', auth_token_set: true, received_send: 45, received_recv: 46, uin: 0, uid: '' }
    fixture.health.mockImplementation(async () => ({ ...health }))
    await protocol['start']()
    await protocol.launch()
    await vi.advanceTimersByTimeAsync(0)
    expect(protocol.get_is_connected()).toBe(true)
    expect(protocol.selfInfo.online).toBe(false)
    expect(online).not.toHaveBeenCalled()
    for (const identity of [{ uin: 721011692, uid: '' }, { uin: 0, uid: 'u_expected' }, { uin: 721011692, uid: '   ' }]) {
      Object.assign(health, identity)
      await vi.advanceTimersByTimeAsync(1000)
      expect(protocol.selfInfo.online).toBe(false)
      expect(online).not.toHaveBeenCalled()
    }
    Object.assign(health, { uin: 721011692, uid: 'u_expected' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(protocol.selfInfo).toMatchObject({ online: true, uin: '721011692', uid: 'u_expected' })
    expect(online).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(online).toHaveBeenCalledTimes(1)
    health.uid = ''
    await vi.advanceTimersByTimeAsync(1000)
    expect(protocol.selfInfo.online).toBe(false)
    expect(disconnected).toHaveBeenCalledTimes(1)
    health.uid = 'u_expected'
    await vi.advanceTimersByTimeAsync(1000)
    expect(protocol.selfInfo.online).toBe(true)
    expect(online).toHaveBeenCalledTimes(2)
  })

  it.each([
    { name: 'bare Buffer', input: Buffer.from('abcd', 'hex'), wire: 'abcd' },
    { name: 'prefixed hex', input: 'abcd', wire: '00000006abcd' },
    { name: 'payload-length-prefixed hex', input: 'abcd', wire: '00000002abcd' },
  ])('delivers $name replies once to each callback consumer', async ({ input, wire }) => {
    await protocol['start']()
    await protocol.launch()
    const listener = vi.fn()
    const raw = vi.fn()
    protocol.addResListener(listener)
    ctx.on('qq/raw', raw)
    const event = { type: 'recv', code: 0, data: { cmd: 'test', pb: 'abcd' } }
    fixture.send.mockResolvedValue(event)
    await expect(protocol.sendPB('test', input)).resolves.toEqual(event.data)
    expect(fixture.send).toHaveBeenCalledExactlyOnceWith('test', input, expect.any(String))
    expect(listener).not.toHaveBeenCalled()
    expect(raw).not.toHaveBeenCalled()
    fixture.callback!({ ...event, data: { ...event.data, pb: wire } })
    expect(listener).toHaveBeenCalledExactlyOnceWith(event)
    expect(raw).toHaveBeenCalledExactlyOnceWith({ cmd: 'test', payload: Buffer.from('abcd', 'hex') })
    fixture.send.mockResolvedValue({ code: -100, message: 'not logged in' })
    await expect(protocol.sendPB('test', '')).rejects.toThrow('code=-100')
  })

  it('joins native stop and drops callbacks/polls after disposal', async () => {
    await protocol['start']()
    await protocol.launch()
    const listener = vi.fn()
    protocol.addResListener(listener)
    let release!: () => void
    fixture.stop.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
    let stopped = false
    const stopping = protocol['stop']().then(() => { stopped = true })
    await Promise.resolve()
    fixture.callback!({ type: 'recv', data: { cmd: 'late', pb: '00' } })
    await vi.advanceTimersByTimeAsync(5000)
    expect(stopped).toBe(false)
    expect(listener).not.toHaveBeenCalled()
    const calls = fixture.health.mock.calls.length
    release(); await stopping
    await vi.advanceTimersByTimeAsync(5000)
    expect(fixture.health).toHaveBeenCalledTimes(calls)
    await expect(protocol.waitConnected()).rejects.toThrow('未运行')
  })

  it('exposes session failure without killing the host or publishing an online account', async () => {
    fixture.health.mockResolvedValue({ sessionStatus: 'failed', failure: 'auth refused' })
    await protocol['start']()
    await protocol.launch()
    await Promise.resolve()
    expect(protocol.authTokenStatus.loginError).toBe('auth refused')
    expect(protocol.get_is_connected()).toBe(false)
    await expect(protocol.bridgeStatus()).resolves.toMatchObject({ session: 'failed', failure: 'auth refused' })
  })

  it('cleans a failed native start', async () => {
    vi.mocked(isDockerEnvironment).mockReturnValue(true)
    fixture.start.mockRejectedValue(new Error('invalid QQ path'))
    await expect(protocol['start']()).rejects.toThrow('invalid QQ path')
    expect(fixture.stop).toHaveBeenCalled()
    expect(fixture.watcherStart).not.toHaveBeenCalled()
  })
})

describe('quick login list', () => {
  it('lists the accounts the injected QQ can log in, once it is up', async () => {
    fixture.hasList = true
    await protocol['start']()
    await protocol.launch()
    fixture.list.mockResolvedValueOnce({ code: -1, message: 'quick login list not ready' })
    await expect(protocol.listQuickLoginAccounts()).resolves.toEqual({ ready: false, accounts: [] })
    fixture.list.mockResolvedValueOnce({
      code: 0,
      data: [{ uin: 123456, uid: 'u_1', nickName: '小号', faceUrl: 'https://face/1' }, { uin: 'not a number' }],
    })
    await expect(protocol.listQuickLoginAccounts()).resolves.toEqual({
      ready: true, accounts: [{ uin: '123456', uid: 'u_1', nick: '小号', faceUrl: 'https://face/1' }],
    })
    fixture.list.mockResolvedValueOnce({ code: 1, message: 'QQ already logged in' })
    await expect(protocol.listQuickLoginAccounts()).resolves.toEqual({ ready: true, accounts: [] })
  })

  it('is not ready before a session starts or after it stops', async () => {
    await expect(protocol.listQuickLoginAccounts()).resolves.toEqual({ ready: false, accounts: [] })
    fixture.hasList = true
    await protocol['start']()
    await expect(protocol.listQuickLoginAccounts()).resolves.toEqual({ ready: false, accounts: [] })
    await protocol['stop']()
    await expect(protocol.listQuickLoginAccounts()).resolves.toEqual({ ready: false, accounts: [] })
  })

  it.each(['list', 'login'])('reports unsupported %s instead of pretending there are no saved accounts', async (missing) => {
    fixture.hasList = missing !== 'list'
    fixture.hasQuickLogin = missing !== 'login'
    await protocol['start']()
    await protocol.launch()
    await expect(protocol.listQuickLoginAccounts()).rejects.toThrow('当前原生模块不支持桥接快速登录')
  })

  it.each([{ code: -2, message: 'login service refused' }, { code: 0, data: {} }])('rejects invalid list responses: $code', async (response) => {
    fixture.hasList = true
    await protocol['start']()
    await protocol.launch()
    fixture.list.mockResolvedValue(response)
    await expect(protocol.listQuickLoginAccounts()).rejects.toThrow(response.message || '账号列表无效')
  })
})

describe('bridge quick login', () => {
  it('waits for the selected online identity and submits concurrent requests only once', async () => {
    await protocol['start']()
    await protocol.launch()
    const login = protocol.quickLogin('123456')
    const sameLogin = protocol.quickLogin('123456')
    let completed = false
    void login.then(() => { completed = true })
    await expect(protocol.quickLogin('654321')).rejects.toThrow('另一个 QQ 账号正在登录')
    await vi.advanceTimersByTimeAsync(1000)
    expect(completed).toBe(false)
    expect(protocol.selfInfo.online).toBe(false)
    fixture.health.mockResolvedValue({ sessionStatus: 'running', uin: 123456, uid: '' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(completed).toBe(false)
    fixture.health.mockResolvedValue({ sessionStatus: 'running', uin: 123456, uid: 'u_123456' })
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.all([login, sameLogin])
    expect(fixture.quickLogin).toHaveBeenCalledExactlyOnceWith('123456')
    expect(protocol.selfInfo).toMatchObject({ online: true, uin: '123456', uid: 'u_123456' })
    // Clicking again for the same online identity does not resubmit to QQ.
    await protocol.quickLogin('123456')
    expect(fixture.quickLogin).toHaveBeenCalledOnce()
  })

  it('does not treat another online account as successful login', async () => {
    fixture.health.mockResolvedValue({ sessionStatus: 'running', uin: 654321, uid: 'u_other' })
    await protocol['start']()
    await protocol.launch()
    await vi.advanceTimersByTimeAsync(0)
    await expect(protocol.quickLogin('123456')).rejects.toThrow('QQ 已登录其他账号')
    expect(fixture.quickLogin).not.toHaveBeenCalled()
  })

  it('preserves QQ refusal and permits another attempt after failure', async () => {
    await protocol['start']()
    await protocol.launch()
    fixture.quickLogin.mockRejectedValueOnce(new Error('saved ticket expired'))
    await expect(protocol.quickLogin('123456')).rejects.toThrow('saved ticket expired')
    fixture.quickLogin.mockResolvedValueOnce({ code: -1, message: 'login service not ready' })
    await expect(protocol.quickLogin('123456')).rejects.toThrow('login service not ready')
    expect(fixture.quickLogin).toHaveBeenCalledTimes(2)
  })

  it('fails when the session ends during login', async () => {
    await protocol['start']()
    await protocol.launch()
    const result = expect(protocol.quickLogin('123456')).rejects.toThrow('QQ 桥接已停止')
    await vi.advanceTimersByTimeAsync(200)
    await protocol['stop']()
    await vi.advanceTimersByTimeAsync(200)
    await result
  })

  it('cannot finish an old request in a new session', async () => {
    await protocol['start']()
    await protocol.launch()
    const response = Promise.withResolvers<{ code: number }>()
    fixture.quickLogin.mockReturnValueOnce(response.promise)
    const result = expect(protocol.quickLogin('123456')).rejects.toThrow('QQ 桥接已停止')
    fixture.callback?.({ type: 'error', message: 'QQ exited' })
    await vi.advanceTimersByTimeAsync(0)
    await protocol.launch()
    fixture.health.mockResolvedValue({ sessionStatus: 'running', uin: 123456, uid: 'u_123456' })
    await vi.advanceTimersByTimeAsync(1000)
    response.resolve({ code: 0 })
    await result
  })

  it('times out without marking the account online or submitting again', async () => {
    await protocol['start']()
    await protocol.launch()
    const result = expect(protocol.quickLogin('123456')).rejects.toThrow('QQ 登录超时')
    await vi.advanceTimersByTimeAsync(60_000)
    await result
    expect(protocol.selfInfo.online).toBe(false)
    expect(fixture.quickLogin).toHaveBeenCalledOnce()
  })

  it('requires a valid account, a running session, and a capable native build', async () => {
    await expect(protocol.quickLogin('invalid')).rejects.toThrow('QQ 号必须是正整数')
    await expect(protocol.quickLogin('123456')).rejects.toThrow('请先启动 QQ')
    fixture.hasQuickLogin = false
    await protocol['start']()
    await protocol.launch()
    await expect(protocol.quickLogin('123456')).rejects.toThrow('当前原生模块不支持桥接快速登录')
    expect(fixture.quickLogin).not.toHaveBeenCalled()
  })
})

describe('launching QQ', () => {
  it('starts QQ with the account remembered by the instance', async () => {
    protocol = new NativeQQProtocol(new Context(), { autoLoginUin: '123456' })
    await protocol['start']()
    expect(fixture.start).toHaveBeenCalledOnce()
    expect(fixture.start.mock.calls[0][0].config.quick_login_qq).toBe('123456')
  })

  it.each(['CLI', 'NativeQQ config'])('keeps an explicit %s account ahead of automatic login', async (source) => {
    protocol = new NativeQQProtocol(new Context(), { autoLoginUin: '123456' })
    if (source === 'CLI') vi.mocked(getSpecifiedUin).mockReturnValue('654321')
    else useConfig({ quick_login_qq: '654321' })
    await protocol['start']()
    expect(fixture.start.mock.calls[0][0].config.quick_login_qq).toBe('654321')
  })

  it('waits for the button unless an account is given, and starts one session for two presses', async () => {
    await protocol['start']()
    expect(fixture.start).not.toHaveBeenCalled()
    expect(protocol.get_is_connected()).toBe(false)
    fixture.health.mockResolvedValue({ sessionStatus: 'stopped', status: 'stopped', auth_token_set: false, qq_pid: null })
    await expect(protocol.bridgeStatus()).resolves.toEqual({
      session: 'stopped', authTokenSet: false, qqRunning: false, loggedIn: false, qrcodeAvailable: false,
    })
    fixture.health.mockResolvedValue({ sessionStatus: 'running', auth_token_set: false })
    await Promise.all([protocol.launch(), protocol.launch()])
    expect(fixture.start).toHaveBeenCalledTimes(1)
    expect(protocol.get_is_connected()).toBe(true)
    await protocol.launch()
    expect(fixture.start).toHaveBeenCalledTimes(1)
  })

  it.each([
    { where: 'docker', arrange: () => vi.mocked(isDockerEnvironment).mockReturnValue(true) },
  ])('starts QQ by itself in $where, where nobody presses the button', async ({ arrange }) => {
    arrange()
    await protocol['start']()
    expect(fixture.start).toHaveBeenCalledTimes(1)
  })

  it('reads its state from NativeQQ, and starts again after the session failed', async () => {
    await protocol['start']()
    await protocol.launch()
    fixture.health.mockResolvedValue({
      sessionStatus: 'running', status: 'ok', auth_token_set: true, qq_pid: 4242, uin: 721011692, uid: 'u_1', qrcode_available: false,
    })
    await expect(protocol.bridgeStatus()).resolves.toEqual({
      session: 'running', authTokenSet: true, qqRunning: true, loggedIn: true, qrcodeAvailable: false,
    })
    fixture.health.mockResolvedValue({ sessionStatus: 'failed', status: 'failed', failure: 'QQ exited', auth_token_set: false, qq_pid: null })
    await vi.advanceTimersByTimeAsync(1000)
    expect(protocol.get_is_connected()).toBe(false)
    expect(fixture.watcherStop).toHaveBeenCalled()
    await expect(protocol.bridgeStatus()).resolves.toMatchObject({ session: 'failed', failure: 'QQ exited', qqRunning: false })
    fixture.health.mockResolvedValue({ sessionStatus: 'running', auth_token_set: false })
    await protocol.launch()
    expect(fixture.start).toHaveBeenCalledTimes(2)
    expect(protocol.get_is_connected()).toBe(true)
  })

  it('says what to do when the machine has no QQ, without asking NativeQQ', async () => {
    vi.mocked(detectQQPath).mockResolvedValue(undefined)
    await protocol['start']()
    await expect(protocol.launch()).rejects.toThrow('这台机器上没找到官方 QQ 客户端：请先安装 QQ，或在「登录方式」里选择 QQ 的可执行文件')
    expect(fixture.start).not.toHaveBeenCalled()
  })

  it('names a chosen QQ that is not there, a relative one from the native directory as NativeQQ takes it', async () => {
    useConfig({ qq_path: 'missing/QQ.exe' })
    await protocol['start']()
    await expect(protocol.launch()).rejects.toThrow(`找不到 QQ：${path.resolve('/verified/native', 'missing/QQ.exe')} 不存在`)
    expect(fixture.start).not.toHaveBeenCalled()
  })

  it('starts a chosen QQ that is there, whatever the machine has', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'llbot-native-qq-'))
    const qq = path.join(directory, 'QQ.exe')
    writeFileSync(qq, '')
    try {
      vi.mocked(detectQQPath).mockResolvedValue(undefined)
      useConfig({ qq_path: qq })
      await protocol['start']()
      await protocol.launch()
      expect(fixture.start.mock.calls[0][0].config).toMatchObject({ qq_path: qq })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('stays up when a launch from the page fails, for another try', async () => {
    await protocol['start']()
    fixture.start.mockRejectedValueOnce(new Error('QQ not found'))
    await expect(protocol.launch()).rejects.toThrow('QQ not found')
    expect(fixture.stop).toHaveBeenCalledTimes(1)
    await protocol.launch()
    expect(protocol.get_is_connected()).toBe(true)
  })
})
