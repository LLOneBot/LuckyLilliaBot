import { createServer, AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from '@/universal/testing'
import type { TestApp } from '../../../packages/plugin-sdk/src/testing'
import * as Gateway from '../../../examples/plugins/ai-gateway/src/index'
import { AiGatewayService } from '../../../examples/plugins/ai-gateway/src/gateway'
import type { AiError } from '../../../examples/plugins/ai-gateway/src/types'
import * as Proxy from '@/plugin/internal/service/proxy'
import { completion, FakeAnswer, FakeCall, PNG, startConnectProxy, startFakeAi } from './fakeAi'

let app: TestApp
let fake: Awaited<ReturnType<typeof startFakeAi>>
let answer: (call: FakeCall) => FakeAnswer | undefined

const ai = (name: string, extra: Partial<Gateway.AiConfig> = {}): Partial<Gateway.AiConfig> => ({
  name,
  baseUrl: `${fake.url}/v1`,
  apiKey: `key-${name}`,
  model: `${name}-model`,
  ...extra,
})

async function mount(config: Partial<Gateway.Config>) {
  const fiber = await app.ctx.plugin(Gateway, config)
  await vi.waitFor(() => expect(app.ctx.get('ai')).toBeTruthy())
  return fiber
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise(resolve => server.close(resolve))
  return port
}

const failure = (promise: Promise<unknown>) => promise.then(() => {
  throw new Error('expected a failure')
}, (e: AiError) => e)

const piece = (content: string) => JSON.stringify({ choices: [{ delta: { content } }] })

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const pieces: string[] = []
  for await (const item of stream) pieces.push(item)
  return pieces
}

beforeEach(async () => {
  answer = call => (call.path === '/v1/chat/completions' ? { json: completion('好的', call.json?.model) } : undefined)
  fake = await startFakeAi(call => answer(call))
  app = await createTestApp()
})

afterEach(async () => {
  await app.dispose()
  await fake.close()
})

describe('the AI gateway', () => {
  it('asks the AI named, or the default one, with its key, model and extra fields', async () => {
    await mount({
      ais: [
        ai('a', { baseUrl: `${fake.url}/v1/chat/completions/`, headers: { 'x-test': '1' }, body: { enable_thinking: false } }),
        ai('b'),
      ],
      default: 'b',
    })
    const result = await app.ctx.ai.chat('你好')
    expect(result).toEqual({
      text: '好的', ai: 'b', model: 'b-model', usage: { input: 12, output: 3 }, finishReason: 'stop', raw: completion('好的', 'b-model'),
    })
    expect(fake.calls[0].headers.authorization).toBe('Bearer key-b')
    expect(fake.calls[0].json).toEqual({ model: 'b-model', messages: [{ role: 'user', content: '你好' }] })

    await app.ctx.ai.chat([{ role: 'system', content: '简短' }, { role: 'user', content: '你好' }], { ai: 'a', model: 'other', temperature: 0, maxTokens: 5 })
    expect(fake.calls[1].path).toBe('/v1/chat/completions')
    expect(fake.calls[1].headers).toMatchObject({ authorization: 'Bearer key-a', 'x-test': '1' })
    expect(fake.calls[1].json).toEqual({
      enable_thinking: false,
      model: 'other',
      messages: [{ role: 'system', content: '简短' }, { role: 'user', content: '你好' }],
      temperature: 0,
      max_tokens: 5,
    })
    expect(app.ctx.ai.list()).toEqual([
      { name: 'a', model: 'a-model', vision: false, proxy: true },
      { name: 'b', model: 'b-model', vision: false, proxy: true },
    ])
    expect(app.ctx.ai.get()?.name).toBe('b')
  })

  it('sends images as data URLs, typed by their bytes', async () => {
    await mount({ ais: [ai('v', { vision: true })] })
    await app.ctx.ai.chat([{ role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image', data: PNG }, { type: 'image', url: 'https://x/y.jpg' }] }])
    expect(fake.calls[0].json.messages[0].content).toEqual([
      { type: 'text', text: '看图' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${PNG.toString('base64')}` } },
      { type: 'image_url', image_url: { url: 'https://x/y.jpg' } },
    ])
  })

  it('streams the reply piece by piece', async () => {
    answer = () => ({
      sse: [
        JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] }),
        JSON.stringify({ choices: [{ delta: { content: '你' } }] }),
        ': keep-alive',
        JSON.stringify({ choices: [{ delta: { content: '好呀' } }] }),
        '[DONE]',
      ],
    })
    await mount({ ais: [ai('s')] })
    const pieces: string[] = []
    for await (const piece of app.ctx.ai.stream('你好')) pieces.push(piece)
    expect(pieces).toEqual(['你', '好呀'])
    expect(fake.calls[0].json.stream).toBe(true)
  })

  it('tells the failures apart, and counts them', async () => {
    // A port nothing listens on any more (fetch refuses some low ports outright, as "bad port")
    const closed = await freePort()
    await mount({ ais: [ai('a'), ai('slow', { timeout: 100 }), ai('gone', { baseUrl: `http://127.0.0.1:${closed}/v1` })] })
    answer = () => ({ status: 401, json: { error: { message: 'Incorrect API key provided' } } })
    expect(await failure(app.ctx.ai.chat('x'))).toMatchObject({
      name: 'AiError', kind: 'auth', status: 401, ai: 'a', message: 'a answered 401: Incorrect API key provided',
    })
    answer = () => ({ status: 429, json: { error: { message: 'Rate limit reached' } } })
    expect(await failure(app.ctx.ai.chat('x'))).toMatchObject({ kind: 'rate-limit', status: 429 })
    answer = () => ({ status: 503, json: { message: 'overloaded' } })
    expect(await failure(app.ctx.ai.chat('x'))).toMatchObject({ kind: 'server', message: 'a answered 503: overloaded' })
    answer = () => ({ json: { choices: [] } })
    expect(await failure(app.ctx.ai.chat('x'))).toMatchObject({ kind: 'response' })
    expect(await failure(app.ctx.ai.chat('x', { ai: 'nobody' }))).toMatchObject({ kind: 'config', message: 'no AI named nobody in the AI gateway' })
    answer = () => ({ json: completion('迟到了'), delay: 1000 })
    expect(await failure(app.ctx.ai.chat('x', { ai: 'slow' }))).toMatchObject({ kind: 'timeout' })
    expect(await failure(app.ctx.ai.chat('x', { ai: 'gone' }))).toMatchObject({ kind: 'network', code: 'ECONNREFUSED', message: expect.stringContaining('ECONNREFUSED') })
    const gateway = app.ctx.get('ai') as AiGatewayService
    expect(gateway.stats.get('a')).toMatchObject({ calls: 4, failures: 4, lastError: { message: 'a gave no message in its answer' } })
  })

  it('says when no AI is set up', async () => {
    await mount({ ais: [] })
    expect(await failure(app.ctx.ai.chat('x'))).toMatchObject({ kind: 'config', message: 'no AI is set up in the AI gateway' })
    expect(app.ctx.ai.get()).toBeUndefined()
  })

  it('reaches the rest of the API with the key in place', async () => {
    answer = call => (call.path === '/v1/models' ? { json: { data: [{ id: 'm1' }] } } : undefined)
    await mount({ ais: [ai('a', { apiKey: '' , headers: { 'api-key': 'azure-style' } }), ai('b')], default: 'b' })
    const response = await app.ctx.ai.request(undefined, 'models')
    expect(await response.json()).toEqual({ data: [{ id: 'm1' }] })
    expect(fake.calls[0].headers.authorization).toBe('Bearer key-b')
    // An empty key sends no Authorization: the provider takes it in a header of its own
    await app.ctx.ai.request('a', '/models')
    expect(fake.calls[1].headers.authorization).toBeUndefined()
    expect(fake.calls[1].headers['api-key']).toBe('azure-style')
    expect(await failure(app.ctx.ai.request('b', '/nothing'))).toMatchObject({ kind: 'request', status: 404 })
  })

  it('takes new settings without restarting the plugins that use it', async () => {
    const fiber = await mount({ ais: [ai('a')] })
    let applied = 0
    await app.ctx.plugin({
      name: 'user',
      inject: ['ai'],
      apply() {
        applied++
      },
    })
    expect(applied).toBe(1)
    await fiber.update({ ais: [ai('a'), ai('c')], default: 'c' })
    expect(app.ctx.ai.get()?.name).toBe('c')
    expect(applied).toBe(1)
  })

  it('reaches the AIs set to it through the builtin proxy, and the rest directly', async () => {
    const proxy = await startConnectProxy()
    try {
      // Hosts only the proxy reaches: it tunnels to 127.0.0.1, while going direct fails on the name
      const port = new URL(fake.url).port
      await mount({ ais: [ai('far', { baseUrl: `http://far.invalid:${port}/v1` }), ai('near', { baseUrl: `http://near.invalid:${port}/v1`, proxy: false })] })
      // Without the builtin proxy every AI goes direct
      expect(await failure(app.ctx.ai.chat('x', { ai: 'far' }))).toMatchObject({ kind: 'network', message: expect.stringContaining('ENOTFOUND') })
      const authorized = new URL(proxy.url)
      authorized.username = 'me'
      authorized.password = 'p@ss'
      await app.ctx.plugin(Proxy, { proxyAgent: authorized.href })
      expect(await app.ctx.ai.chat('x', { ai: 'far' })).toMatchObject({ text: '好的' })
      expect(proxy.tunnels).toEqual([{ target: `far.invalid:${port}`, authorization: `Basic ${Buffer.from('me:p@ss').toString('base64')}` }])
      expect(await failure(app.ctx.ai.chat('x', { ai: 'near' }))).toMatchObject({ kind: 'network' })
      expect(proxy.tunnels).toHaveLength(1)
      expect(fake.calls).toHaveLength(1)
    } finally {
      await app.ctx.registry.delete(Proxy)
      await proxy.close()
    }
  })

  it('answers its WebUI module: the AIs with how they did, and a test call', async () => {
    await mount({ ais: [ai('a', { vision: true }), ai('b')] })
    const gateway = app.ctx.get('ai') as AiGatewayService
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await Gateway.handle(gateway, new Request(`http://bot${path}`, { method, body: body && JSON.stringify(body) }))
      return { status: response.status, ...await response.json() as { data?: any } }
    }
    expect(await call('POST', '/api/ai-gateway/test', { ai: 'a' })).toMatchObject({
      status: 200, data: { ok: true, model: 'a-model', text: '好的' },
    })
    answer = () => ({ status: 401, json: { error: { message: 'bad key' } } })
    expect(await call('POST', '/api/ai-gateway/test', { ai: 'b' })).toMatchObject({
      data: { ok: false, kind: 'auth', error: 'b answered 401: bad key' },
    })
    expect(await call('GET', '/api/ai-gateway/ais')).toMatchObject({
      data: {
        default: 'a',
        ais: [
          { name: 'a', model: 'a-model', vision: true, calls: 1, failures: 0 },
          { name: 'b', calls: 1, failures: 1, lastError: { message: 'b answered 401: bad key' } },
        ],
      },
    })
    expect(await call('POST', '/api/ai-gateway/test', {})).toMatchObject({ status: 400 })
  })

  it('keeps a stream going while pieces come, and gives up when they stop', async () => {
    await mount({ ais: [ai('s', { timeout: 500 })] })
    // Longer than the timeout in all, never that long between two pieces
    answer = () => ({ sse: [piece('一'), piece('二'), piece('三'), piece('四'), '[DONE]'], interval: 150 })
    expect(await collect(app.ctx.ai.stream('x'))).toEqual(['一', '二', '三', '四'])
    answer = () => ({ sse: [piece('一')], hold: true })
    const pieces: string[] = []
    const error = await failure((async () => {
      for await (const item of app.ctx.ai.stream('x')) pieces.push(item)
    })())
    expect(pieces).toEqual(['一'])
    expect(error).toMatchObject({ kind: 'timeout' })
    // chat() waits for the whole answer, so an answer that stops halfway is a timeout too
    expect(await failure(app.ctx.ai.chat('x'))).toMatchObject({ kind: 'timeout' })
  })

  it('takes an answer at once when a stream was asked for', async () => {
    await mount({ ais: [ai('a')] })
    expect(await collect(app.ctx.ai.stream('x'))).toEqual(['好的'])
  })

  it('refuses an address without http://, in the settings and at a call', async () => {
    expect(() => Gateway.Config({ ais: [{ name: 'a', baseUrl: 'api.example.com/v1', model: 'm' }] } as never)).toThrow()
    const entry = { name: 'typo', baseUrl: 'api.example.com/v1', apiKey: '', model: 'm', vision: false, proxy: true, timeout: 1000, headers: {}, body: {} }
    await app.ctx.plugin(AiGatewayService, { current: { ais: [entry], default: '' } })
    await vi.waitFor(() => expect(app.ctx.get('ai')).toBeTruthy())
    expect(await failure(app.ctx.ai.chat('x'))).toMatchObject({ name: 'AiError', kind: 'config', ai: 'typo' })
    expect((app.ctx.get('ai') as AiGatewayService).stats.get('typo')).toMatchObject({ calls: 1, failures: 1 })
  })

  it('does not count the caller\'s own abort as a failure', async () => {
    answer = () => ({ json: completion('迟到了'), delay: 1000 })
    await mount({ ais: [ai('a')] })
    const controller = new AbortController()
    const reason = new Error('user left')
    setTimeout(() => controller.abort(reason), 50)
    expect(await failure(app.ctx.ai.chat('x', { signal: controller.signal }))).toBe(reason)
    expect((app.ctx.get('ai') as AiGatewayService).stats.get('a')).toEqual({ calls: 1, failures: 0 })
  })

  it('asks again without what a reasoning model refuses', async () => {
    answer = (call) => {
      const refused = 'temperature' in call.json ? 'temperature' : 'max_tokens' in call.json ? 'max_tokens' : undefined
      if (!refused) return { json: completion('好的') }
      return { status: 400, json: { error: { message: `Unsupported parameter: '${refused}'`, type: 'invalid_request_error', param: refused, code: 'unsupported_parameter' } } }
    }
    await mount({ ais: [ai('o')] })
    expect(await app.ctx.ai.chat('x', { temperature: 0, maxTokens: 5 })).toMatchObject({ text: '好的' })
    const sent = (call: FakeCall) => Object.keys(call.json).filter(key => key !== 'model' && key !== 'messages')
    expect(fake.calls.map(sent)).toEqual([['temperature', 'max_tokens'], ['max_tokens'], ['max_completion_tokens']])
    expect(fake.calls[2].json.max_completion_tokens).toBe(5)
    expect((app.ctx.get('ai') as AiGatewayService).stats.get('o')).toEqual({ calls: 1, failures: 0, latency: expect.any(Number) })
    // Any other 400 is the caller's to fix
    answer = () => ({ status: 400, json: { error: { message: 'bad messages', param: 'messages', code: 'invalid_value' } } })
    expect(await failure(app.ctx.ai.chat('x'))).toMatchObject({ kind: 'request', status: 400, code: 'invalid_value' })
    expect(fake.calls).toHaveLength(4)
  })

  it('tries once more after a 5xx or a dropped connection', async () => {
    await mount({ ais: [ai('a')] })
    let trouble: FakeAnswer[] = [{ status: 503, json: { error: { message: 'overloaded' } } }]
    answer = () => trouble.shift() ?? { json: completion('好的') }
    expect(await app.ctx.ai.chat('x')).toMatchObject({ text: '好的' })
    trouble = [{ drop: true }]
    expect(await app.ctx.ai.chat('x')).toMatchObject({ text: '好的' })
    expect(fake.calls).toHaveLength(4)
    expect((app.ctx.get('ai') as AiGatewayService).stats.get('a')).toMatchObject({ calls: 2, failures: 0 })
    trouble = [{ status: 503, json: { error: { message: 'overloaded' } } }, { status: 503, json: { error: { message: 'still overloaded' } } }]
    expect(await failure(app.ctx.ai.chat('x'))).toMatchObject({ kind: 'server', status: 503, message: 'a answered 503: still overloaded' })
    expect(fake.calls).toHaveLength(6)
  })

  it('leaves the thinking out of the answer', async () => {
    await mount({ ais: [ai('r')] })
    answer = () => ({ json: completion('<think>\n先想想\n</think>\n\n好的') })
    expect(await app.ctx.ai.chat('x')).toMatchObject({ text: '好的', reasoning: '先想想' })
    answer = () => ({ json: { model: 'r1', choices: [{ message: { role: 'assistant', content: '好的', reasoning_content: '想过了' }, finish_reason: 'stop' }] } })
    expect(await app.ctx.ai.chat('x')).toMatchObject({ text: '好的', reasoning: '想过了' })
    // The tags may come split over the pieces
    answer = () => ({ sse: [piece('<thi'), piece('nk>想'), piece('想</th'), piece('ink>\n'), piece('好'), piece('的'), '[DONE]'] })
    expect(await collect(app.ctx.ai.stream('x'))).toEqual(['好', '的'])
    // What only looked like the start of one is the answer
    answer = () => ({ sse: [piece('<th'), '[DONE]'] })
    expect(await collect(app.ctx.ai.stream('x'))).toEqual(['<th'])
    answer = () => ({ sse: [piece('<b>粗</b>'), '[DONE]'] })
    expect(await collect(app.ctx.ai.stream('x'))).toEqual(['<b>粗</b>'])
  })

  it('tells an empty balance from a rate limit', async () => {
    await mount({ ais: [ai('a')] })
    answer = () => ({ status: 402, json: { error: { message: 'Insufficient Balance' } } })
    expect(await failure(app.ctx.ai.chat('x'))).toMatchObject({ kind: 'quota', status: 402 })
    answer = () => ({ status: 429, json: { error: { message: 'You exceeded your current quota', type: 'insufficient_quota', code: 'insufficient_quota' } } })
    expect(await failure(app.ctx.ai.chat('x'))).toMatchObject({ kind: 'quota', code: 'insufficient_quota' })
    answer = () => ({ status: 429, json: { error: { message: '您的账户已欠费，请充值后重试', code: '1113' } } })
    expect(await failure(app.ctx.ai.chat('x'))).toMatchObject({ kind: 'quota', code: '1113' })
    answer = () => ({ status: 429, json: { error: { message: 'Quota exceeded for metric: requests per minute', code: 'rate_limit_exceeded' } } })
    expect(await failure(app.ctx.ai.chat('x'))).toMatchObject({ kind: 'rate-limit', code: 'rate_limit_exceeded' })
  })
})
