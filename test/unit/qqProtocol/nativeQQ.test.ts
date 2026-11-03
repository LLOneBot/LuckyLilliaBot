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
  // getQuickLoginList came with a later native build
  list: vi.fn(), hasList: false,
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
    // No runtime quick login in the native build yet
    await expect(protocol.quickLogin('123456')).rejects.toThrow(/扫码登录/)
  })

  it('lists none with a native build that cannot, and is not ready before the session is', async () => {
    await expect(protocol.listQuickLoginAccounts()).resolves.toEqual({ ready: true, accounts: [] })
    fixture.hasList = true
    ctx = new Context()
    protocol = new NativeQQProtocol(ctx)
    await protocol['start']()
    await protocol['stop']()
    await expect(protocol.listQuickLoginAccounts()).resolves.toEqual({ ready: false, accounts: [] })
  })
})

describe('launching QQ', () => {
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
