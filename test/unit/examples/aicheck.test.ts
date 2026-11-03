import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from '@/universal/testing'
import type { TestApp } from '../../../packages/plugin-sdk/src/testing'
import * as Gateway from '../../../examples/plugins/ai-gateway/src/index'
import * as AiCheck from '../../../examples/plugins/aicheck/src/index'
import { completion, FakeAnswer, FakeCall, PNG, startFakeAi } from './fakeAi'

let app: TestApp
let fake: Awaited<ReturnType<typeof startFakeAi>>
let provenance: FakeAnswer
let vision: FakeAnswer

const verdict = (value: unknown) => completion(JSON.stringify(value), 'vision-model-2026')

function route(call: FakeCall): FakeAnswer | undefined {
  // QQ sends some images as octet-stream: the plugin reads the type from the bytes
  if (call.path === '/img.png') return { body: PNG, type: 'application/octet-stream' }
  if (call.path === '/openai/v1/content_provenance_checks') return provenance
  if (call.path === '/vision/v1/chat/completions') return vision
}

async function setup(config: Partial<AiCheck.Config> = {}) {
  await app.ctx.plugin(Gateway, {
    ais: [
      { name: 'OpenAI', baseUrl: `${fake.url}/openai/v1`, apiKey: 'sk-openai', model: 'gpt-4o' },
      { name: 'Vision', baseUrl: `${fake.url}/vision/v1`, apiKey: 'sk-vision', model: 'vision-model', vision: true },
    ],
    default: 'Vision',
  })
  await vi.waitFor(() => expect(app.ctx.get('ai')).toBeTruthy())
  await app.ctx.plugin(AiCheck, { cooldown: 0, provenance: { ai: 'OpenAI' }, vision: { ai: '', model: '' }, ...config })
}

const image = () => `<img src="${fake.url}/img.png"/>`

beforeEach(async () => {
  provenance = { json: { object: 'content_provenance_check', created_at: 1, results: [{ type: 'synthid', outcome: 'not_detected' }] } }
  vision = { json: verdict({ verdict: 'ai', confidence: 85, reasons: ['左手有六根手指', '招牌文字无法辨认'] }) }
  fake = await startFakeAi(route)
  app = await createTestApp()
})

afterEach(async () => {
  await app.dispose()
  await fake.close()
})

describe('aicheck', () => {
  it('reports what OpenAI\'s watermark check finds, quoting the image', async () => {
    provenance = { json: { object: 'content_provenance_check', created_at: 1, results: [{ type: 'c2pa', outcome: 'detected' }] } }
    await setup()
    const bot = app.bot()
    expect(await bot.receive(`ai吗${image()}`, { guildId: 'G1' })).toEqual(['<quote id="message-1"/>图片是 ChatGPT 制作。'])
    const check = fake.calls.find(call => call.path === '/openai/v1/content_provenance_checks')!
    expect(check.headers.authorization).toBe('Bearer sk-openai')
    expect(check.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/)
    expect(check.raw.includes(PNG)).toBe(true)
    // A certain answer: no guessing after it
    expect(fake.calls.some(call => call.path.startsWith('/vision'))).toBe(false)
  })

  it('asks the vision model about what carries no watermark, on the quoted message\'s image', async () => {
    await setup()
    const answer = await app.bot().receive(`<quote id="q-9">${image()}</quote><at id="someone"/> AI吗`, { guildId: 'G1' })
    expect(answer).toEqual(['<quote id="q-9"/>vision-model-2026 判断：疑似 AI 生成（置信度 85%）\n- 左手有六根手指\n- 招牌文字无法辨认'])
    const ask = fake.calls.find(call => call.path === '/vision/v1/chat/completions')!
    expect(ask.headers.authorization).toBe('Bearer sk-vision')
    expect(ask.json).toMatchObject({ model: 'vision-model', temperature: 0 })
    expect(ask.json.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${PNG.toString('base64')}` } })
  })

  it('passes on what the model says when it gives no JSON, and escapes it', async () => {
    vision = { json: completion('看不太出来 <b>真</b>', 'vision-model') }
    await setup({ provenance: false })
    expect(await app.bot().receive(`ai吗${image()}`)).toEqual(['<quote id="message-1"/>vision-model 判断：看不太出来 &lt;b&gt;真&lt;/b&gt;'])
  })

  it('says so when nothing turns up, and why when the checks failed', async () => {
    await setup({ vision: false })
    const bot = app.bot()
    expect(await bot.receive(`ai吗${image()}`)).toEqual(['<quote id="message-1"/>没看出 AI 制作的痕迹。'])
    provenance = { status: 401, json: { error: { message: 'Incorrect API key provided' } } }
    expect(await bot.receive(`ai吗${image()}`)).toEqual(['<quote id="message-2"/>API Key 无效或没有权限。'])
  })

  it('falls back on the vision model when the watermark check fails, and names the failure when both do', async () => {
    provenance = { status: 403, json: { error: { message: 'unsupported_country_region_territory' } } }
    await setup()
    const bot = app.bot()
    expect(await bot.receive(`ai吗${image()}`)).toEqual([expect.stringContaining('vision-model-2026 判断：疑似 AI 生成')])
    vision = { status: 429, json: { error: { message: 'Rate limit reached' } } }
    // The watermark check's failure is the one reported
    expect(await bot.receive(`ai吗${image()}`)).toEqual(['<quote id="message-2"/>API Key 无效或没有权限。'])
  })

  it('reports a busy model, and one out of balance', async () => {
    vision = { status: 429, json: { error: { message: 'Rate limit reached' } } }
    await setup({ provenance: false })
    const bot = app.bot()
    expect(await bot.receive(`ai吗${image()}`)).toEqual(['<quote id="message-1"/>检测请求过于频繁，请稍后再试。'])
    vision = { status: 402, json: { error: { message: 'Insufficient Balance' } } }
    expect(await bot.receive(`ai吗${image()}`)).toEqual(['<quote id="message-2"/>AI 服务的余额或额度用完了。'])
  })

  it('reports an AI the gateway does not have', async () => {
    await setup({ provenance: false, vision: { ai: '已删掉的', model: '' } })
    expect(await app.bot().receive(`ai吗${image()}`)).toEqual(['<quote id="message-1"/>AI 网关里没有设置好要用的 AI。'])
  })

  it('leaves the message to others without an image, and keeps to the cooldown per chat', async () => {
    await setup({ cooldown: 60_000 })
    const passed: string[] = []
    app.ctx.on('bot/message', (session) => {
      passed.push(session.stripped.content)
    })
    const bot = app.bot()
    expect(await bot.receive('ai吗？')).toEqual([])
    expect(await bot.receive(`今天 ai吗${image()}`)).toEqual([])
    expect(await bot.receive(`ai吗${image()}`, { guildId: 'G1' })).toHaveLength(1)
    expect(await bot.receive(`ai吗${image()}`, { guildId: 'G1' })).toEqual([])
    expect(await bot.receive(`ai吗${image()}`, { guildId: 'G2' })).toHaveLength(1)
    expect(passed).toEqual(['ai吗？', `今天 ai吗${image()}`, `ai吗${image()}`])
  })

  it('says when the image cannot be downloaded', async () => {
    await setup()
    expect(await app.bot().receive(`ai吗<img src="${fake.url}/missing.png"/>`)).toEqual(['<quote id="message-1"/>图片下载失败，请稍后再试。'])
  })
})
