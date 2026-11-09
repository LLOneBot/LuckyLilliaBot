import { createCipheriv, randomBytes } from 'node:crypto'
import type { Context } from 'cordis'
import QRCode from 'qrcode'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginRevConflictError } from '@/plugin/host'
import { QQOfficialSetup } from '@/plugin/internal/protocol/qq-official/setup'
import { QQSetupRoutes } from '@/plugin/internal/protocol/qq-official/setupRoutes'

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn() } }))

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const ok = (data: unknown) => json({ retcode: 0, data })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

let ctx: Context
let setup: QQOfficialSetup
let fetchMock: ReturnType<typeof vi.fn>
let updateConfig: ReturnType<typeof vi.fn>
let describeConfig: ReturnType<typeof vi.fn>
let keys: Map<string, Buffer>
let poll: (taskId: string, init: RequestInit) => Response | Promise<Response>
let effective: Record<string, unknown>
let disposeEffects: (() => void)[]

function credentials(taskId: string, secret = 'SCANNED_SECRET') {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keys.get(taskId)!, iv)
  const encrypted = Buffer.concat([iv, cipher.update(secret, 'utf8'), cipher.final(), cipher.getAuthTag()])
  return { status: 2, bot_appid: '102030405', bot_encrypt_secret: encrypted.toString('base64') }
}

const settle = () => vi.advanceTimersByTimeAsync(0)
const requestsTo = (suffix: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix))

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(QRCode.toDataURL).mockResolvedValue('data:image/png;base64,PNG')
  keys = new Map()
  poll = () => ok({ status: 1 })
  effective = { appId: 'OLD', secret: '********', type: 'public', sandbox: true, intents: ['GUILDS'], privateMenu: [{ name: 'keep' }] }
  updateConfig = vi.fn(async () => ({}))
  describeConfig = vi.fn(async () => ({ effective, rev: 'original-rev' }))
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string)
    if (url.endsWith('/create_bind_task')) {
      const taskId = `task-${keys.size + 1}`
      keys.set(taskId, Buffer.from(body.key, 'base64'))
      return ok({ task_id: taskId })
    }
    return poll(body.task_id, init)
  })
  disposeEffects = []
  ctx = {
    http: { fetch: fetchMock },
    plugins: { list: () => [{ name: 'builtin:qq-official', id: 'entry-1' }], describe: describeConfig, updateConfig },
    timer: { setTimeout: (callback: () => void, delay: number) => {
      const timer = setTimeout(callback, delay)
      return () => clearTimeout(timer)
    } },
    effect: (callback: () => () => void) => disposeEffects.push(callback()),
    webuiServer: { route: vi.fn() },
  } as unknown as Context
  setup = new QQOfficialSetup(ctx)
})

afterEach(() => {
  setup.dispose()
  for (const dispose of disposeEffects) dispose()
  vi.useRealTimers()
})

describe('official QQ QR setup', () => {
  it('decrypts the authorized credentials and saves them with the original config and revision', async () => {
    poll = taskId => ok(credentials(taskId))
    const initial = setup.start()
    expect(initial.phase).toBe('starting')
    await settle()

    expect(describeConfig).toHaveBeenCalledWith('entry-1')
    expect(keys.get('task-1')).toHaveLength(32)
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'https://q.qq.com/qqbot/openclaw/connect.html?task_id=task-1&source=luckylillia&_wv=2',
      expect.anything(),
    )
    expect(updateConfig).toHaveBeenCalledExactlyOnceWith('entry-1', { ...effective, appId: '102030405', secret: 'SCANNED_SECRET' }, 'original-rev')
    expect(setup.get(initial.id)).toEqual({ id: initial.id, phase: 'complete', appId: '102030405', message: '机器人配置已保存' })
    expect(JSON.stringify(setup.get(initial.id))).not.toContain('SCANNED_SECRET')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops an expired remote QR without creating another task or retaining its QR', async () => {
    const { id } = setup.start()
    await settle()
    expect(setup.get(id)).toMatchObject({ id, phase: 'waiting', qrCode: 'data:image/png;base64,PNG' })
    const signal = requestsTo('poll_bind_result')[0][1].signal as AbortSignal
    poll = () => ok({ status: 3 })
    await vi.advanceTimersByTimeAsync(2000)
    expect(setup.get(id)).toEqual({ id, phase: 'expired', message: '二维码已过期，请重新获取二维码' })
    expect(signal.aborted).toBe(true)
    expect(requestsTo('create_bind_task')).toHaveLength(1)
    expect(requestsTo('poll_bind_result')).toHaveLength(2)
    expect(updateConfig).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    const callsAtExpiry = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(setup.get(id).phase).toBe('expired')
    expect(fetchMock).toHaveBeenCalledTimes(callsAtExpiry)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['cancel', 'refresh', 'dispose'] as const)('ignores a completed result arriving after %s', async (action) => {
    const pending = deferred<Response>()
    poll = taskId => taskId === 'task-1' ? pending.promise : ok({ status: 1 })
    const first = setup.start()
    await settle()
    const oldSignal = requestsTo('poll_bind_result')[0][1].signal as AbortSignal
    const result = credentials('task-1')
    if (action === 'cancel') setup.cancel(first.id)
    if (action === 'refresh') setup.start()
    if (action === 'dispose') setup.dispose()
    expect(oldSignal.aborted).toBe(true)
    if (action !== 'refresh') expect(vi.getTimerCount()).toBe(0)
    pending.resolve(ok(result))
    await settle()
    expect(updateConfig).not.toHaveBeenCalled()
    expect(setup.get(first.id).phase).toBe('cancelled')
    expect(setup.get(first.id)).not.toHaveProperty('url')
    if (action !== 'refresh') expect(vi.getTimerCount()).toBe(0)
  })

  it('does not start a remote task after cancellation while loading the saved config', async () => {
    const pending = deferred<{ effective: unknown; rev: string }>()
    describeConfig.mockReturnValue(pending.promise)
    const { id } = setup.start()
    setup.cancel(id)
    pending.resolve({ effective, rev: 'late' })
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(updateConfig).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts a stalled request after ten seconds without exposing its error', async () => {
    let requestSignal!: AbortSignal
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      requestSignal = init.signal!
      requestSignal.addEventListener('abort', () => reject(new Error('PRIVATE_BODY_OR_KEY')), { once: true })
    }))
    const { id } = setup.start()
    await settle()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(requestSignal.aborted).toBe(true)
    expect(setup.get(id)).toMatchObject({ phase: 'failed', message: '扫码配置失败，请重试' })
    expect(JSON.stringify(setup.get(id))).not.toContain('PRIVATE_BODY_OR_KEY')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries failed polling at two-second intervals and stops at the local deadline', async () => {
    poll = () => json({ retcode: 99, msg: 'SCANNED_SECRET' })
    const { id } = setup.start()
    await settle()
    expect(setup.get(id)).toMatchObject({ phase: 'waiting', message: '暂时无法查询扫码结果，正在重试' })
    expect(requestsTo('poll_bind_result')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1999)
    expect(requestsTo('poll_bind_result')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(requestsTo('poll_bind_result')).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(setup.get(id).phase).toBe('expired')
    expect(updateConfig).not.toHaveBeenCalled()
    expect(JSON.stringify(setup.get(id))).not.toContain('SCANNED_SECRET')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    [new PluginRevConflictError('new-rev'), '配置已被修改，请重新扫码后再试'],
    [new Error('disk failure: SCANNED_SECRET'), '保存机器人配置失败，请重试'],
  ])('reports save failures with a controlled message', async (error, message) => {
    poll = taskId => ok(credentials(taskId))
    updateConfig.mockRejectedValue(error)
    const { id } = setup.start()
    await settle()
    expect(setup.get(id)).toEqual({ id, phase: 'failed', message })
    expect(JSON.stringify(setup.get(id))).not.toContain('SCANNED_SECRET')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects refresh and cancellation once atomic config saving has started', async () => {
    const saved = deferred<unknown>()
    poll = taskId => ok(credentials(taskId))
    updateConfig.mockReturnValue(saved.promise)
    const { id } = setup.start()
    await settle()
    expect(setup.get(id).phase).toBe('saving')
    expect(() => setup.start()).toThrow('正在保存配置')
    expect(() => setup.cancel(id)).toThrow('正在保存配置')
    expect(requestsTo('create_bind_task')).toHaveLength(1)
    saved.resolve({})
    await settle()
    expect(setup.get(id).phase).toBe('complete')
  })

  it.each([
    { retcode: 0, data: { task_id: '../invalid' } },
    { retcode: 5, msg: 'PRIVATE_REMOTE_ERROR' },
    { retcode: 0, data: {} },
  ])('rejects malformed task creation responses', async (body) => {
    fetchMock.mockResolvedValue(json(body))
    const { id } = setup.start()
    await settle()
    expect(setup.get(id).phase).toBe('failed')
    expect(JSON.stringify(setup.get(id))).not.toContain('PRIVATE_REMOTE_ERROR')
    expect(updateConfig).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['invalid-appid', 'invalid-base64', 'invalid-tag', 'unknown-status'] as const)('rejects %s before writing config', async (failure) => {
    poll = taskId => {
      const data = credentials(taskId)
      if (failure === 'invalid-appid') data.bot_appid = '../../bot'
      if (failure === 'invalid-base64') data.bot_encrypt_secret = 'secret!'
      if (failure === 'invalid-tag') {
        const bytes = Buffer.from(data.bot_encrypt_secret, 'base64')
        bytes[bytes.length - 1] ^= 1
        data.bot_encrypt_secret = bytes.toString('base64')
      }
      if (failure === 'unknown-status') data.status = 100
      return ok(data)
    }
    const { id } = setup.start()
    await settle()
    expect(setup.get(id).phase).toBe('failed')
    expect(updateConfig).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('setup standby routes', () => {
  it('keeps expired state reads inert and creates a fresh QR only after another POST', async () => {
    poll = taskId => ok(taskId === 'task-1' ? { status: 3 } : { status: 1 })
    QQSetupRoutes.apply(ctx)
    const [prefix, app] = vi.mocked(ctx.webuiServer.route).mock.calls[0]
    const started = await app.request(`${prefix}/start`, { method: 'POST' })
    const first = await started.json()
    await settle()
    const callsAtExpiry = fetchMock.mock.calls.length
    for (let index = 0; index < 3; index++) {
      const response = await app.request(`${prefix}/${first.id}`)
      expect(await response.json()).toEqual({ id: first.id, phase: 'expired', message: '二维码已过期，请重新获取二维码' })
      await vi.advanceTimersByTimeAsync(2000)
    }
    expect(fetchMock).toHaveBeenCalledTimes(callsAtExpiry)
    expect(vi.getTimerCount()).toBe(0)

    const restarted = await app.request(`${prefix}/start`, { method: 'POST' })
    expect(restarted.status).toBe(202)
    const second = await restarted.json()
    expect(second.id).not.toBe(first.id)
    await settle()
    const state = await app.request(`${prefix}/${second.id}`)
    expect(await state.json()).toMatchObject({ id: second.id, phase: 'waiting', url: expect.stringContaining('task-2'), qrCode: 'data:image/png;base64,PNG' })
    expect(requestsTo('create_bind_task')).toHaveLength(2)
    expect(keys.get('task-1')!.equals(keys.get('task-2')!)).toBe(false)
    expect(updateConfig).not.toHaveBeenCalled()
  })

  it('mounts under the authenticated API, starts only on POST, and disposes its session', async () => {
    QQSetupRoutes.apply(ctx)
    const [prefix, app, options] = vi.mocked(ctx.webuiServer.route).mock.calls[0]
    expect(prefix).toBe('/api/qq-official/setup')
    expect(options).toBeUndefined() // WebuiServer.route defaults to authenticated API routing.
    const missing = await app.request(`${prefix}/missing`)
    expect(missing.status).toBe(404)
    expect(missing.headers.get('cache-control')).toBe('no-store')
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await app.request(`${prefix}/start`)).status).toBe(404)
    const started = await app.request(`${prefix}/start`, { method: 'POST' })
    expect(started.status).toBe(202)
    const { id } = await started.json()
    await settle()
    const state = await app.request(`${prefix}/${id}`)
    expect(await state.json()).toMatchObject({ id, phase: 'waiting', qrCode: 'data:image/png;base64,PNG' })
    expect(state.headers.get('cache-control')).toBe('no-store')
    const callsBeforeRead = fetchMock.mock.calls.length
    await app.request(`${prefix}/${id}`)
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeRead)
    const cancelled = await app.request(`${prefix}/${id}`, { method: 'DELETE' })
    expect(await cancelled.json()).toMatchObject({ id, phase: 'cancelled' })
    expect(vi.getTimerCount()).toBe(0)
    await app.request(`${prefix}/start`, { method: 'POST' })
    await settle()
    disposeEffects.forEach(dispose => dispose())
    expect(vi.getTimerCount()).toBe(0)
  })
})
