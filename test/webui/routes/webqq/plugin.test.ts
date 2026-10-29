import { rmSync } from 'node:fs'
import { Context, Fiber, Service } from 'cordis'
import { Hono } from 'hono'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATA_DIR } from '@/common/globalVars'
import { hashPassword } from '@/plugin/internal/service/webui/BE/passwordHash'
import { WebuiServer } from '@/plugin/internal/service/webui/BE/server'
import { WebQQ } from '@/plugin/internal/tool/webqq'

// The plugin creates its upload dir under TEMP_DIR and the WebUI writes an access log
vi.mock('@/common/globalVars', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llbot-webqq-plugin-'))
  fs.mkdirSync(path.join(dir, 'logs'))
  return {
    DATA_DIR: dir,
    TEMP_DIR: path.join(dir, 'temp'),
    LOG_DIR: path.join(dir, 'logs'),
    dbDir: path.join(dir, 'database'),
    selfInfo: { uid: 'test-uid', uin: '123456', nick: 'TestBot', online: true },
    authTokenStatus: { hasToken: false, validation: 'idle', message: '', loginError: '' },
    getFixedDataDir: () => dir,
  }
})

function stub(name: string) {
  return class extends Service {
    constructor(ctx: Context) {
      super(ctx, name)
    }
    // What the WebUI shell reads when `config` is the stubbed service
    get() {
      return { webui: { enable: false, host: '127.0.0.1', port: 0 } }
    }
  }
}

const env = { incoming: { socket: { remoteAddress: '127.0.0.1' } } }
// test/unit/setup.ts mocks the WebUI password to 'test-token'
const headers = { 'X-Webui-Token': hashPassword('test-token') }

let ctx: Context
let app: Hono

function request(path: string) {
  return app.fetch(new Request(`http://localhost${path}`, { headers }), env)
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, text: string): Promise<string> {
  const decoder = new TextDecoder()
  let received = ''
  while (!received.includes(text)) {
    const { done, value } = await reader.read()
    if (done) throw new Error(`stream ended before ${JSON.stringify(text)}, got ${JSON.stringify(received)}`)
    received += decoder.decode(value)
  }
  return received
}

afterAll(() => {
  rmSync(DATA_DIR, { recursive: true, force: true })
})

beforeEach(async () => {
  ctx = new Context()
  for (const name of ['qqProtocol', 'ntLoginApi', 'config', 'account', 'app', 'store', 'ntMsgApi', 'ntFileApi', 'ntUserApi', 'ntGroupApi', 'ntFriendApi']) {
    await ctx.plugin(stub(name))
  }
  await ctx.plugin(WebuiServer)
  app = (ctx.webuiServer as unknown as { app: Hono }).app
})

describe('WebQQ plugin', () => {
  it('serves /api/webqq and its event stream only while it runs', async () => {
    expect((await request('/api/webqq/events')).status).toBe(404)
    const fiber: Fiber = await ctx.plugin(WebQQ)

    const response = await request('/api/webqq/events')
    expect(response.headers.get('content-type')).toMatch(/text\/event-stream/)
    const reader = response.body!.getReader()
    await readUntil(reader, 'event: connected')

    await ctx.parallel('nt/message-deleted', {
      msgId: '7001', msgSeq: 42, chatType: 2, peerUid: '987654', peerUin: 987654,
      operatorUid: 'u_1', senderUin: 1, operatorUin: 1, displaySuffix: '',
    } as never)
    expect(await readUntil(reader, 'message-deleted')).toContain('"isSelfOperate":true')

    // Disposing ends the open stream instead of leaving the page waiting on it
    await fiber.dispose()
    await expect(reader.read()).resolves.toMatchObject({ done: true })
    expect((await request('/api/webqq/events')).status).toBe(404)
  })
})
