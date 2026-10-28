import { Context } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiBase, CredentialError, QQOfficialApi } from '@/universal/qqofficial/api'

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

let ctx: Context
let fetchMock: ReturnType<typeof vi.fn>
let tokens: string[]

beforeEach(async () => {
  tokens = ['t1', 't2', 't3']
  fetchMock = vi.fn(async (input: string) => {
    if (input.endsWith('/app/getAppAccessToken')) return json(200, { access_token: tokens.shift(), expires_in: '120' })
    return json(200, { ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
  ctx = new Context()
  await ctx.plugin(TimerService)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const tokenCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/app/getAppAccessToken'))

describe('QQOfficialApi', () => {
  it('fetches the token once for concurrent callers and signs requests with it', async () => {
    const api = new QQOfficialApi(ctx, { appId: 'APPID', secret: 's', sandbox: false })
    const [a, b] = await Promise.all([api.accessToken(), api.accessToken()])
    expect([a, b]).toEqual(['t1', 't1'])
    expect(tokenCalls()).toHaveLength(1)
    expect(JSON.parse(tokenCalls()[0][1].body)).toEqual({ appId: 'APPID', clientSecret: 's' })

    await api.request('POST', '/v2/groups/G/messages', { content: 'x' })
    const [url, init] = fetchMock.mock.calls.at(-1)!
    expect(url).toBe('https://api.bot.qq.com/v2/groups/G/messages')
    expect(init.headers).toMatchObject({ 'Authorization': 'QQBot t1', 'X-Union-Appid': 'APPID', 'Content-Type': 'application/json' })
    api.dispose()
  })

  it('uses the sandbox host', async () => {
    const api = new QQOfficialApi(ctx, { appId: 'APPID', secret: 's', sandbox: true })
    await api.request('GET', '/gateway')
    expect(fetchMock.mock.calls.at(-1)![0]).toBe('https://sandbox.api.bot.qq.com/gateway')
    api.dispose()
  })

  it('takes a custom endpoint, the sandbox prefixed to its host', () => {
    expect(apiBase('', false)).toBe('https://api.bot.qq.com')
    expect(apiBase('https://api.sgroup.qq.com/', false)).toBe('https://api.sgroup.qq.com')
    expect(apiBase('api.sgroup.qq.com', true)).toBe('https://sandbox.api.sgroup.qq.com')
  })

  it('sends query parameters, and multipart without a JSON content type', async () => {
    const api = new QQOfficialApi(ctx, { appId: 'APPID', secret: 's', sandbox: false })
    await api.request('GET', '/v2/groups/G/members', undefined, { params: { cursor: 'c 1', limit: 10, skip: undefined } })
    expect(fetchMock.mock.calls.at(-1)![0]).toBe('https://api.bot.qq.com/v2/groups/G/members?cursor=c+1&limit=10')
    const form = new FormData()
    form.append('content', 'x')
    await api.request('POST', '/channels/C/messages', undefined, { form })
    const init = fetchMock.mock.calls.at(-1)![1]
    expect(init.body).toBe(form)
    expect(init.headers).not.toHaveProperty('Content-Type')
    api.dispose()
  })

  it('refreshes the token inside its last minute', async () => {
    vi.useFakeTimers()
    const api = new QQOfficialApi(ctx, { appId: 'APPID', secret: 's', sandbox: false })
    expect(await api.accessToken()).toBe('t1')
    await vi.advanceTimersByTimeAsync(69_000)
    expect(tokenCalls()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(tokenCalls()).toHaveLength(2)
    expect(await api.accessToken()).toBe('t2')
    api.dispose()
  })

  it('retries once with a new token when the server rejects the cached one', async () => {
    const api = new QQOfficialApi(ctx, { appId: 'APPID', secret: 's', sandbox: false })
    let first = true
    fetchMock.mockImplementation(async (input: string, init: RequestInit) => {
      if (input.endsWith('/app/getAppAccessToken')) return json(200, { access_token: tokens.shift(), expires_in: 7200 })
      if (first) {
        first = false
        return json(401, { code: 11241, message: 'token invalid' })
      }
      return json(200, { auth: (init.headers as Record<string, string>).Authorization })
    })
    expect(await api.request('GET', '/gateway')).toEqual({ auth: 'QQBot t2' })
    api.dispose()
  })

  it('reports the platform error code and trace id', async () => {
    const api = new QQOfficialApi(ctx, { appId: 'APPID', secret: 's', sandbox: false })
    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith('/app/getAppAccessToken')) return json(200, { access_token: 'tok', expires_in: 7200 })
      if (input.endsWith('/a')) return json(400, { code: 40034128, message: '被动回复超时' }, { 'X-Tps-trace-ID': 'trace-1' })
      return json(200, { err_code: 22009, message: '频率限制' })
    })
    const error = await api.request('POST', '/a', {}).catch(e => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, code: 40034128, traceId: 'trace-1' })
    expect(error.message).toContain('被动回复超时')
    // A 2xx can carry an error too
    await expect(api.request('POST', '/b', {})).rejects.toMatchObject({ code: 22009 })
    api.dispose()
  })

  it('tells wrong credentials apart from other failures', async () => {
    fetchMock.mockImplementation(async () => json(200, { code: 100016, message: 'invalid appid or secret' }))
    const api = new QQOfficialApi(ctx, { appId: 'APPID', secret: 'wrong', sandbox: false })
    await expect(api.accessToken()).rejects.toBeInstanceOf(CredentialError)

    fetchMock.mockImplementation(async () => json(200, { code: 100001, message: 'too many requests' }))
    await expect(api.accessToken()).rejects.toBeInstanceOf(ApiError)
    api.dispose()
  })
})
