import { Context } from 'cordis'
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PmhqQQProtocol } from '@/plugin/internal/protocol/nt-protocol/qqProtocol/pmhq'
import { dispatchIpcRequest } from '@/main/ipc'
import { currentPmhqTarget, getSpecifiedUin } from '@/common/utils/environment'

const fixture = vi.hoisted(() => ({
  callback: undefined as ((event: any) => void) | undefined,
  constructed: vi.fn(), start: vi.fn(), stop: vi.fn(), health: vi.fn(), send: vi.fn(), qr: vi.fn(), token: vi.fn(),
  watcherStart: vi.fn(), watcherStop: vi.fn(), watcherCheck: vi.fn(),
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
    setAuthToken = fixture.token
  },
}) }))
vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/authTokenWatcher', () => ({
  AuthTokenWatcher: class { start = fixture.watcherStart; stop = fixture.watcherStop; check = fixture.watcherCheck },
}))
let protocol: PmhqQQProtocol
let ctx: Context
let configPath: string | undefined
function useConfig(config: Record<string, unknown>): void {
  const directory = mkdtempSync(path.join(tmpdir(), 'llbot-native-test-'))
  configPath = path.join(directory, 'config.json')
  writeFileSync(configPath, JSON.stringify(config), 'utf8')
  vi.mocked(currentPmhqTarget).mockReturnValue({ configPath, qqPath: '' })
}
beforeEach(() => {
  vi.useFakeTimers()
  fixture.callback = undefined
  fixture.health.mockResolvedValue({ sessionStatus: 'running', auth_token_set: false })
  fixture.qr.mockResolvedValue({ code: 1 })
  fixture.start.mockResolvedValue(undefined)
  fixture.stop.mockResolvedValue(undefined)
  fixture.token.mockResolvedValue(undefined)
  ctx = new Context()
  protocol = new PmhqQQProtocol(ctx)
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
    expect(fixture.constructed).toHaveBeenCalledTimes(1)
    expect(fixture.start).toHaveBeenCalledWith({ moduleDir: '/verified/native', config: { auth_token: '', cdn: 'cf' }, subCmdArgs: [] })
    expect(fixture.watcherStart).toHaveBeenCalledTimes(1)
    protocol.checkAuthToken()
    expect(fixture.watcherCheck).toHaveBeenCalledTimes(1)
    await expect(dispatchIpcRequest('set_pmhq_auth_token', { token: 'new-token' })).resolves.toEqual({ accepted: true })
    expect(fixture.token).toHaveBeenCalledWith('new-token')
    await protocol['stop']()
    expect(fixture.watcherStop).toHaveBeenCalled()
    expect(fixture.stop).toHaveBeenCalled()
    expect(protocol.get_is_connected()).toBe(false)
    await expect(dispatchIpcRequest('get_pmhq_health')).rejects.toThrow('not running')
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
    await Promise.resolve()
    expect(protocol.authTokenStatus.loginError).toBe('auth refused')
    expect(protocol.get_is_connected()).toBe(false)
    await expect(dispatchIpcRequest('get_pmhq_health')).resolves.toMatchObject({ failure: 'auth refused' })
  })

  it('cleans a failed native start', async () => {
    fixture.start.mockRejectedValue(new Error('invalid QQ path'))
    await expect(protocol['start']()).rejects.toThrow('invalid QQ path')
    expect(fixture.stop).toHaveBeenCalled()
    expect(fixture.watcherStart).not.toHaveBeenCalled()
  })
})
