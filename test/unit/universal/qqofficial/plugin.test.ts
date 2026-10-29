import { Status } from '@satorijs/protocol'
import { Context } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { WebSocket, WebSocketServer } from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@luckylillia/plugin-sdk'
import BotsService from '@/universal/bots'
import * as QQOfficial from '@/plugin/internal/protocol/qq-official'
import * as Echo from '../../../../examples/plugins/echo/src/index'

interface Call {
  method: string
  path: string
  body?: any
}

let ctx: Context
let wss: WebSocketServer
let gatewaySocket: WebSocket | undefined
let calls: Call[]
// Answers a REST call; the default sends back a fresh message id
let reply: (call: Call) => { status?: number; body: unknown } | undefined

const sentAt = () => new Date(Date.now() - 1000).toISOString()

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(async () => {
  calls = []
  reply = () => undefined
  wss = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await new Promise(resolve => wss.once('listening', resolve))
  const { port } = wss.address() as { port: number }
  wss.on('connection', (socket) => {
    gatewaySocket = socket
    socket.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 60_000 } }))
    socket.on('message', (data) => {
      const payload = JSON.parse(data.toString())
      if (payload.op === 2) socket.send(JSON.stringify({ op: 0, s: 1, t: 'READY', d: { session_id: 'S', user: { id: 'B', username: 'TestBot' } } }))
    })
  })

  let sent = 0
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input)
    if (url.pathname === '/app/getAppAccessToken') return json(200, { access_token: 'tok', expires_in: '7200' })
    const call: Call = { method: init.method ?? 'GET', path: url.pathname, body: init.body ? JSON.parse(init.body as string) : undefined }
    calls.push(call)
    const custom = reply(call)
    if (custom) return json(custom.status ?? 200, custom.body)
    if (call.path === '/gateway') return json(200, { url: `ws://127.0.0.1:${port}` })
    if (call.path === '/users/@me') return json(200, { id: 'B', username: 'TestBot', avatar: 'https://example.com/bot.png' })
    if (call.path.endsWith('/files')) return json(200, { file_uuid: 'u', file_info: `info:${call.body.url ?? 'data'}`, ttl: 300 })
    sent++
    return json(200, { id: `sent-${sent}`, timestamp: new Date().toISOString(), ext_info: { ref_idx: `REFIDX_sent${sent}` } })
  }))

  ctx = new Context()
  await ctx.plugin(TimerService)
  await ctx.plugin(BotsService)
  await ctx.plugin(QQOfficial, { appId: 'APPID', secret: 's', sandbox: false, intents: ['GROUP_AND_C2C_EVENT', 'INTERACTION'] })
  await vi.waitFor(() => expect(ctx.bots.get('qq:APPID')?.status).toBe(Status.ONLINE))
})

afterEach(async () => {
  await ctx.registry.delete(QQOfficial)
  await new Promise(resolve => wss.close(resolve))
  vi.unstubAllGlobals()
})

function push(t: string, d: object, id?: string) {
  gatewaySocket!.send(JSON.stringify({ op: 0, s: 2, t, d, id }))
}

function groupAt(id: string, content: string) {
  push('GROUP_AT_MESSAGE_CREATE', {
    id,
    author: { id: 'U1', member_openid: 'U1', username: 'Alice' },
    content,
    timestamp: sentAt(),
    group_openid: 'G1',
    message_scene: { ext: [`msg_idx=REFIDX_${id}`] },
  })
}

const messages = () => calls.filter(call => call.method === 'POST' && call.path.endsWith('/messages'))

describe('QQOfficial', () => {
  it('connects with the configured intents and registers the bot', () => {
    const bot = ctx.bots.get('qq:APPID')!
    expect(bot).toMatchObject({ platform: 'qq', selfId: 'APPID', sid: 'qq:APPID' })
    expect((bot as unknown as { user: { name?: string } }).user.name).toBe('TestBot')
    expect(calls[0]).toEqual({ method: 'GET', path: '/gateway', body: undefined })
  })

  it('turns a group @ message into a session and replies passively, quoting it', async () => {
    const sessions: Session[] = []
    ctx.on('bot/message', async (session) => {
      sessions.push(session)
      await session.reply('pong')
      await session.send('again')
    })
    groupAt('M1', ' ping')
    await vi.waitFor(() => expect(messages()).toHaveLength(2))

    expect(sessions[0]).toMatchObject({
      platform: 'qq',
      selfId: 'APPID',
      userId: 'U1',
      channelId: 'G1',
      guildId: 'G1',
      messageId: 'M1',
      isDirect: false,
      content: '<at id="APPID"/> ping',
    })
    expect(messages()[0]).toEqual({
      method: 'POST',
      path: '/v2/groups/G1/messages',
      body: { msg_type: 0, content: 'pong', msg_id: 'M1', msg_seq: 1, message_reference: { message_id: 'REFIDX_M1' } },
    })
    // A plain send still goes out as a reply to the message, with the next sequence number
    expect(messages()[1].body).toEqual({ msg_type: 0, content: 'again', msg_id: 'M1', msg_seq: 2 })
  })

  it('runs the echo example plugin on a group @ message', async () => {
    await ctx.plugin(Echo, { prefix: 'echo ' })
    groupAt('M9', ' echo hi')
    await vi.waitFor(() => expect(messages()).toHaveLength(1))
    expect(messages()[0].body).toEqual({
      msg_type: 0, content: 'hi', msg_id: 'M9', msg_seq: 1, message_reference: { message_id: 'REFIDX_M9' },
    })
  })

  it('returns what it sent as Satori resources', async () => {
    groupAt('M1', ' hi')
    await vi.waitFor(() => expect(ctx.bots.get('qq:APPID')).toBeDefined())
    await new Promise(resolve => setTimeout(resolve, 20))
    const sent = await ctx.bots.get('qq:APPID')!.sendMessage('G1', 'hi <at id="U2"/>')
    expect(sent).toMatchObject([{ id: 'sent-1', content: 'hi <at id="U2"/>', channel: { id: 'G1' }, user: { id: 'APPID' } }])
    expect(messages()[0].body.content).toBe('hi <qqbot-at-user id="U2" />')
  })

  it('retries a deduplicated reply with the next msg_seq', async () => {
    let refused = false
    reply = (call) => {
      if (call.path.endsWith('/messages') && !refused) {
        refused = true
        return { status: 400, body: { code: 40054005, message: '消息被去重' } }
      }
    }
    ctx.on('bot/message', session => session.reply('pong').then(() => {}))
    groupAt('M1', ' ping')
    await vi.waitFor(() => expect(messages()).toHaveLength(2))
    expect(messages().map(call => call.body.msg_seq)).toEqual([1, 2])
  })

  it('falls back to the next reply target, then to a proactive message, when the platform refuses one', async () => {
    reply = (call) => {
      if (call.path.endsWith('/messages') && call.body.msg_id) return { status: 400, body: { code: 40034128, message: '被动回复超时或超次数' } }
    }
    groupAt('M1', ' one')
    groupAt('M2', ' two')
    await new Promise(resolve => setTimeout(resolve, 50))
    await ctx.bots.get('qq:APPID')!.sendMessage('G1', 'hello')
    expect(messages().map(call => call.body.msg_id)).toEqual(['M2', 'M1', undefined])
  })

  it('uploads a medium first and sends the text written after it in the same message', async () => {
    groupAt('M1', ' pic')
    await new Promise(resolve => setTimeout(resolve, 50))
    await ctx.bots.get('qq:APPID')!.sendMessage('G1', 'before<img src="https://example.com/a.png"/>after')
    const files = calls.filter(call => call.path.endsWith('/files'))
    expect(files).toEqual([{
      method: 'POST',
      path: '/v2/groups/G1/files',
      body: { file_type: 1, url: 'https://example.com/a.png', srv_send_msg: false },
    }])
    expect(messages().map(call => call.body)).toEqual([
      { msg_type: 0, content: 'before', msg_id: 'M1', msg_seq: 1 },
      { msg_type: 7, media: { file_info: 'info:https://example.com/a.png' }, content: 'after', msg_id: 'M1', msg_seq: 2 },
    ])
  })

  it('sends the bytes when the platform cannot download the URL itself', async () => {
    const image = Buffer.from('fake-png')
    reply = (call) => {
      if (call.path.endsWith('/files') && call.body.url) return { status: 400, body: { code: 850026, message: '下载失败' } }
    }
    const realFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    const fallback = realFetch.getMockImplementation()!
    realFetch.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === 'http://127.0.0.1:1/a.png') return new Response(image)
      return fallback(input, init)
    })
    await ctx.bots.get('qq:APPID')!.sendMessage('private:U3', '<img src="http://127.0.0.1:1/a.png"/>')
    const files = calls.filter(call => call.path.endsWith('/files'))
    expect(files.map(call => call.path)).toEqual(['/v2/users/U3/files', '/v2/users/U3/files'])
    expect(files[1].body).toEqual({ file_type: 1, file_data: image.toString('base64'), file_name: 'a.png', srv_send_msg: false })
    expect(messages()[0]).toMatchObject({ path: '/v2/users/U3/messages', body: { msg_type: 7 } })
  })

  it('replies to a C2C message in its private channel', async () => {
    ctx.on('bot/message', session => session.send('hi').then(() => {}))
    push('C2C_MESSAGE_CREATE', { id: 'C1', author: { id: 'U3', user_openid: 'U3' }, content: 'hello', timestamp: sentAt() })
    await vi.waitFor(() => expect(messages()).toHaveLength(1))
    expect(messages()[0]).toEqual({
      method: 'POST',
      path: '/v2/users/U3/messages',
      body: { msg_type: 0, content: 'hi', msg_id: 'C1', msg_seq: 1 },
    })
  })

  it('acknowledges a button click before handing it to plugins', async () => {
    const seen: string[] = []
    ctx.on('bot/event', (session) => {
      if (session.type !== 'internal') seen.push(session.type)
    })
    push('INTERACTION_CREATE', {
      id: 'I1', chat_type: 1, group_openid: 'G1', group_member_openid: 'U1',
      data: { resolved: { button_id: 'b', button_data: 'd' } },
    }, 'EV1')
    await vi.waitFor(() => expect(seen).toEqual(['interaction/button']))
    expect(calls).toContainEqual({ method: 'PUT', path: '/interactions/I1', body: { code: 0 } })
  })

  it('deletes a message in a group or a private channel', async () => {
    const bot = ctx.bots.get('qq:APPID')!
    await bot.deleteMessage!('G1', 'sent-1')
    await bot.deleteMessage!('private:U3', 'sent-2')
    expect(calls.filter(call => call.method === 'DELETE').map(call => call.path)).toEqual([
      '/v2/groups/G1/messages/sent-1',
      '/v2/users/U3/messages/sent-2',
    ])
  })

  it('fails to start with wrong credentials, saying why', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => json(200, { code: 10004, message: '机器人不存在' }))
    const other = new Context()
    await other.plugin(TimerService)
    await other.plugin(BotsService)
    await expect(other.plugin(QQOfficial, { appId: 'NOPE', secret: 's', sandbox: false, intents: ['GROUP_AND_C2C_EVENT'] }))
      .rejects.toThrow('机器人不存在')
    expect(other.bots.get('qq:NOPE')).toBeUndefined()
  })

  it('goes offline and unregisters when disposed', async () => {
    const bot = ctx.bots.get('qq:APPID')!
    const closed = new Promise(resolve => gatewaySocket!.once('close', resolve))
    await ctx.registry.delete(QQOfficial)
    await closed
    expect(bot.status).toBe(Status.OFFLINE)
    expect(ctx.bots.get('qq:APPID')).toBeUndefined()
  })
})
