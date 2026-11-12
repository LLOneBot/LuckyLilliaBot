import h from '@satorijs/element'
import { Opcode, Status } from '@satorijs/protocol'
import { Context, Logger } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { WebSocket, WebSocketServer } from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bot, Session } from '@luckylillia/plugin-sdk'
import type { QQOfficialConfig } from '@/common/types'
import BotsService from '@/universal/bots'
import { CommandService } from '@/universal/commands'
import SatoriAdapter from '@/plugin/internal/adapter/satori/adapter'
import * as QQOfficial from '@/plugin/internal/protocol/qq-official'
import type { QQOfficialBot } from '@/plugin/internal/protocol/qq-official'
import { crossPlatform } from '../crossPlatform'

// Markdown and buttons, the platform's own payloads, group management, guilds, interactions and menus, against a
// fake REST API and a local gateway

interface Call {
  method: string
  path: string
  query: string
  body?: any
  form?: FormData
}

let ctx: Context
let wss: WebSocketServer
let gatewaySocket: WebSocket | undefined
let calls: Call[]
let reply: (call: Call) => { status?: number; body: unknown } | undefined
let identified: any

const sentAt = () => new Date(Date.now() - 1000).toISOString()

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(async () => {
  calls = []
  reply = () => undefined
  identified = undefined
  wss = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await new Promise(resolve => wss.once('listening', resolve))
  const { port } = wss.address() as { port: number }
  wss.on('connection', (socket) => {
    gatewaySocket = socket
    socket.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 60_000 } }))
    socket.on('message', (data) => {
      const payload = JSON.parse(data.toString())
      if (payload.op !== 2) return
      identified = payload.d
      socket.send(JSON.stringify({ op: 0, s: 1, t: 'READY', d: { session_id: 'S', user: { id: 'B', username: 'TestBot' } } }))
    })
  })

  let sent = 0
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(input)
    if (url.pathname === '/app/getAppAccessToken') return json(200, { access_token: 'tok', expires_in: '7200' })
    const form = init.body instanceof FormData ? init.body : undefined
    const call: Call = {
      method: init.method ?? 'GET',
      path: url.pathname,
      query: url.search,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      form,
    }
    calls.push(call)
    const custom = reply(call)
    if (custom?.body instanceof Uint8Array) return new Response(custom.body, { status: custom.status ?? 200 })
    if (custom) return json(custom.status ?? 200, custom.body)
    if (call.path === '/gateway') return json(200, { url: `ws://127.0.0.1:${port}` })
    if (call.path === '/users/@me') return json(200, { id: 'B', username: 'TestBot' })
    if (call.path.endsWith('/files')) return json(200, { file_uuid: 'u', file_info: `info:${call.body?.url ?? 'data'}`, ttl: 300 })
    if (call.path.endsWith('/messages') && call.method === 'POST') {
      sent++
      return json(200, { id: `sent-${sent}`, timestamp: new Date().toISOString(), ext_info: { ref_idx: `REFIDX_sent${sent}` } })
    }
    return json(200, {})
  }))
})

afterEach(async () => {
  await ctx?.registry.delete(CommandService)
  await ctx?.registry.delete(SatoriAdapter)
  await ctx?.registry.delete(QQOfficial)
  await new Promise(resolve => wss.close(resolve))
  vi.unstubAllGlobals()
})

async function start(config: Partial<QQOfficialConfig> = {}) {
  ctx = new Context()
  await ctx.plugin(TimerService)
  await ctx.plugin(BotsService)
  await ctx.plugin(QQOfficial, { appId: 'APPID', secret: 's', ...config })
  await vi.waitFor(() => expect(ctx.bots.get('qq:APPID')?.status).toBe(Status.ONLINE))
}

const qq = () => ctx.bots.get('qq:APPID') as unknown as QQOfficialBot & Bot

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
const messageLogs = () => ctx.logger.buffer
  .filter(record => record.name === 'qq-official' && record.type === 'info')
  .map(record => Logger.format({}, record)).filter(line => /^\[(收|发)-/.test(line))

/** The bytes of a PNG its size is read from */
function pngHeader(width: number, height: number) {
  const png = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12, 'latin1')
  png.writeUInt32BE(width, 16)
  png.writeUInt32BE(height, 20)
  return png
}

/** Events other than messages, internal ones aside */
function collect() {
  const events: Session[] = []
  ctx.on('bot/event', (session) => {
    if (session.type !== 'internal') events.push(session)
  })
  return events
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 50))
}

describe('subscriptions', () => {
  it('uses the twelve crack defaults and sends their bitmask to the gateway', async () => {
    expect([...QQOfficial.Config({}).intents].sort()).toEqual([
      'GUILDS',
      'GROUP_MEMBER_EVENT',
      'GUILD_MEMBERS',
      'GUILD_MESSAGE_REACTIONS',
      'DIRECT_MESSAGE',
      'OPEN_FORUMS_EVENT',
      'AUDIO_OR_LIVE_CHANNEL_MEMBER',
      'GROUP_AND_C2C_EVENT',
      'INTERACTION',
      'MESSAGE_AUDIT',
      'AUDIO_ACTION',
      'PUBLIC_GUILD_MESSAGES',
    ].sort())

    await start()
    expect(identified).toEqual({ token: 'QQBot tok', intents: 1863062531, shard: [0, 1] })
    expect([...ctx.bots]).toEqual([qq()])
  })
})

describe('markdown and buttons', () => {
  it('sends markdown with buttons as one markdown message with a keyboard', async () => {
    await start()
    groupAt('M1', ' menu')
    await settle()
    await qq().sendMessage('G1', [
      h('markdown', '# 你好'),
      h('button', { text: '再来一次' }),
      h('button', { type: 'link', href: 'https://example.com', text: '打开' }),
    ])
    expect(messages()[0].body).toEqual({
      msg_type: 2,
      markdown: { content: '# 你好' },
      keyboard: {
        content: {
          rows: [{
            buttons: [
              {
                render_data: { label: '再来一次', visited_label: '再来一次', style: 1 },
                action: { type: 2, permission: { type: 2 }, data: '再来一次', enter: true },
              },
              {
                render_data: { label: '打开', visited_label: '打开', style: 1 },
                action: { type: 0, permission: { type: 2 }, data: 'https://example.com' },
              },
            ],
          }],
        },
      },
      msg_id: 'M1',
      msg_seq: 1,
    })
  })

  it('escapes the text before the first button, wraps rows at five, opens a row per button group', async () => {
    await start()
    await qq().sendMessage('G1', [
      'a_b ',
      ...[1, 2, 3, 4, 5, 6].map(n => h('button', { text: `b${n}` })),
      h('button-group', {}, [h('button', { text: 'g1' })]),
    ])
    const { markdown, keyboard } = messages()[0].body
    expect(markdown).toEqual({ content: 'a&#95;b ' })
    expect(keyboard.content.rows.map((row: { buttons: { render_data: { label: string } }[] }) =>
      row.buttons.map(button => button.render_data.label))).toEqual([['b1', 'b2', 'b3', 'b4', 'b5'], ['b6'], ['g1']])
  })

  it('takes the platform fields of a qq:button as they are', async () => {
    await start()
    await qq().sendMessage('G1', h('qq:button', {
      render_data: { label: '再来', style: 4 },
      action: { type: 1, permission: { type: 0, specify_user_ids: ['U1'] }, data: 'cb', enter: false },
    }))
    expect(messages()[0].body.keyboard.content.rows[0].buttons[0]).toEqual({
      render_data: { label: '再来', visited_label: '再来', style: 4 },
      action: { type: 1, permission: { type: 0, specify_user_ids: ['U1'] }, data: 'cb', enter: false },
    })
  })

  it('sends ark and the raw platform payloads as messages of their own', async () => {
    await start()
    await qq().sendMessage('G1', [
      'before',
      h('qq:ark24', {
        desc: '描述', prompt: '提示', title: '标题', metaDesc: '详情', img: 'https://a/i.png', link: 'https://a', subTitle: '来源',
      }),
      h('qq:json', { id: '102000000_1' }),
      h('qq:rawmarkdown', { content: '**粗**', keyboard: { id: 'K1' } }),
      h('qq:markdown', { custom_template_id: 'T1', params: [{ key: 'title', values: ['标题'] }] }),
      'after',
    ])
    expect(messages().map(call => ({ ...call.body, msg_id: undefined, msg_seq: undefined }))).toEqual([
      { msg_type: 0, content: 'before' },
      {
        msg_type: 3,
        content: ' ',
        ark: {
          template_id: 24,
          kv: [
            { key: '#DESC#', value: '描述' },
            { key: '#PROMPT#', value: '提示' },
            { key: '#TITLE#', value: '标题' },
            { key: '#METADESC#', value: '详情' },
            { key: '#IMG#', value: 'https://a/i.png' },
            { key: '#LINK#', value: 'https://a' },
            { key: '#SUBTITLE#', value: '来源' },
          ],
        },
      },
      { msg_type: 2, content: '', keyboard: { id: '102000000_1' } },
      { msg_type: 2, markdown: { content: '**粗**' }, keyboard: { id: 'K1' } },
      { msg_type: 2, markdown: { custom_template_id: 'T1', params: [{ key: 'title', values: ['标题'] }] } },
      { msg_type: 0, content: 'after' },
    ].map(body => ({ ...body, msg_id: undefined, msg_seq: undefined })))
  })

  it('turns a message that mentions a member into markdown, the only place a group renders it', async () => {
    await start()
    await qq().sendMessage('G1', 'hi_ <at id="U2"/> <at type="all"/>')
    expect(messages()[0].body).toEqual({ msg_type: 2, markdown: { content: 'hi&#95;&nbsp;<qqbot-at-user id="U2" /> <qqbot-at-everyone />' } })
  })

  it('writes a mention as plain @name when told not to switch to markdown for it', async () => {
    await start({ useMarkdownIfAt: false })
    await qq().sendMessage('G1', 'hi_ <at id="U2" name="Bob"/><at id="U3"/> <at type="all"/>')
    expect(messages()[0].body).toEqual({ msg_type: 0, content: 'hi_ @Bob <qqbot-at-everyone />' })
  })

  it('leaves the tags in the text alone when a button turns the message into markdown', async () => {
    await start()
    await qq().sendMessage('G1', ['a_b ', h('at', { type: 'all' }), h('button', {}, '签到')])
    expect(messages()[0].body).toMatchObject({ msg_type: 2, markdown: { content: 'a&#95;b <qqbot-at-everyone />' } })
  })

  it('sends a medium alone when markdown, buttons or a mention follow it', async () => {
    await start()
    const image = 'https://example.com/a.png'
    const sent = await qq().sendMessage('G1', [h.image(image), h.at('U2'), ' 看图'])
    await qq().sendMessage('G1', [h.image(image), h('at', { type: 'all' })])
    await qq().sendMessage('G1', [h.image(image), h('button', {}, '签到')])
    await qq().sendMessage('G1', [h.image(image), ' 图下的字'])
    expect(sent.map(message => message.content)).toEqual([`<img src="${image}"/>`, '<at id="U2"/> 看图'])
    const media = { msg_type: 7, media: { file_info: `info:${image}` } }
    expect(messages().map(call => call.body)).toEqual([
      media, { msg_type: 2, markdown: { content: '<qqbot-at-user id="U2" /> 看图' } },
      media, { msg_type: 0, content: '<qqbot-at-everyone />' },
      media, { msg_type: 2, markdown: { content: ' ' }, keyboard: expect.anything() },
      { ...media, content: ' 图下的字' },
    ])
  })

  it('writes a link with its text, as NT does', async () => {
    await start()
    await qq().sendMessage('G1', [h('a', { href: 'https://example.com' }, '官网'), ' ', h('a', { href: 'https://example.com' })])
    expect(messages()[0].body).toEqual({ msg_type: 0, content: '官网 ( https://example.com ) https://example.com' })
  })

  it('exposes official material APIs and sends an uploaded image reference in one Markdown message', async () => {
    await start()
    const image = { image_id: 'image/1', url: 'qqbot-media://image/v1/test-asset', ttl: 7776000 }
    reply = call => {
      if (call.path === '/v2/media-images/prepare') return { body: { upload_id: 'upload-1', presigned_url: 'https://upload.example.test/image.png', expires_in: 3600 } }
      if (call.path === '/v2/media-images/complete') return { body: image }
      if (call.path === '/v2/media-images') return { body: { images: [image], next_cursor: '', total: 1 } }
    }
    const prepared = await qq().internal.prepareMediaImage({ file_name: 'preview.png', file_size: 123, content_type: 'image/png', md5: 'a'.repeat(32), sha1: 'b'.repeat(40) })
    const uploaded = await qq().internal.completeMediaImage({ upload_id: prepared.upload_id, md5: 'a'.repeat(32) })
    expect((await qq().internal.getMediaImages({ cursor: 'cursor-1' })).total).toBe(1)
    const content = '![封面 #560px #395px](' + uploaded.url + ')\n\n**视频标题**\n\nAI 总结：示例'
    await qq().sendMessage('G1', h('markdown', {}, content))
    expect(messages()).toHaveLength(1)
    expect(messages()[0].body).toEqual({ msg_type: 2, markdown: { content } })
    expect(calls.some(call => call.path.endsWith('/files'))).toBe(false)
    await qq().internal.deleteMediaImage(uploaded.image_id)
    expect(calls.filter(call => call.path.startsWith('/v2/media-images')).map(call => [call.method, call.path, call.query])).toEqual([
      ['POST', '/v2/media-images/prepare', ''],
      ['POST', '/v2/media-images/complete', ''],
      ['GET', '/v2/media-images', '?cursor=cursor-1'],
      ['DELETE', '/v2/media-images/image%2F1/delete', ''],
    ])
  })

  it('splits inline data images out of markdown into media of their own', async () => {
    await start()
    await qq().sendMessage('private:U3', h('markdown', 'before ![x](data:image/png;base64,AAAA) after'))
    expect(calls.filter(call => call.path.endsWith('/files')).map(call => call.body)).toEqual([
      { file_type: 1, file_data: 'AAAA', file_name: 'file', srv_send_msg: false },
    ])
    // The text after an image does not join it
    expect(messages().map(call => call.body)).toEqual([
      { msg_type: 2, markdown: { content: 'before ' } },
      { msg_type: 7, media: { file_info: 'info:data' } },
      { msg_type: 2, markdown: { content: ' after' } },
    ])
  })
})

describe('sending', () => {
  it('pins a reply with a passive element', async () => {
    await start()
    await qq().sendMessage('G1', [h('passive', { messageId: 'X1', seq: 3 }), 'hi'])
    expect(messages()[0].body).toEqual({ msg_type: 0, content: 'hi', msg_id: 'X1', msg_seq: 3 })
  })

  it('streams plain text replies when set to, continuing the stream of the first part', async () => {
    await start({ autoStreamText: ['private'] })
    ctx.on('bot/message', async (session) => {
      await session.send('hi_')
      await session.send('more')
    })
    push('C2C_MESSAGE_CREATE', { id: 'C1', author: { id: 'U3', user_openid: 'U3' }, content: 'hello', timestamp: sentAt() })
    await vi.waitFor(() => expect(messages()).toHaveLength(2))
    expect(messages().map(call => call.body)).toEqual([
      { msg_type: 2, markdown: { content: 'hi&#95;' }, stream: { state: 1, index: 0, reset: false }, msg_id: 'C1', msg_seq: 1 },
      { msg_type: 2, markdown: { content: 'more' }, stream: { state: 1, id: 'sent-1', index: 1, reset: false }, msg_id: 'C1', msg_seq: 2 },
    ])
  })

  it('streams past the four replies of a C2C message, every part on that message', async () => {
    await start({ autoStreamText: ['private'] })
    ctx.on('bot/message', async (session) => {
      for (let i = 1; i <= 6; i++) await session.send(`part ${i}`)
    })
    push('C2C_MESSAGE_CREATE', { id: 'C1', author: { id: 'U3', user_openid: 'U3' }, content: 'hello', timestamp: sentAt() })
    await vi.waitFor(() => expect(messages()).toHaveLength(6))
    expect(messages().map(({ body }) => [body.msg_id, body.msg_seq, body.stream.index])).toEqual([
      ['C1', 1, 0], ['C1', 2, 1], ['C1', 3, 2], ['C1', 4, 3], ['C1', 5, 4], ['C1', 6, 5],
    ])
    expect(messageLogs()).toEqual(['[收-私] U3 U3：hello', '[发-私] U3 (流式回复)：part 1'])
    expect(qq().stats.snapshot(qq())).toMatchObject({ messageReceived: 1, messageSent: 1 })
  })

  it('ends a C2C stream with its end part, or before a message that follows it', async () => {
    await start()
    ctx.on('bot/message', async (session) => {
      await session.send(h('markdown', { stream: true }, 'a'))
      await session.send(h('markdown', { stream: 'end' }, 'b'))
      await session.send(h('markdown', { stream: true }, 'c'))
      await session.send('after')
    })
    push('C2C_MESSAGE_CREATE', { id: 'C1', author: { id: 'U3', user_openid: 'U3' }, content: 'hello', timestamp: sentAt() })
    await vi.waitFor(() => expect(messages()).toHaveLength(5))
    expect(messages().map(({ body }) => [body.markdown?.content ?? body.content, body.msg_seq, body.stream?.state, body.stream?.id, body.stream?.index])).toEqual([
      ['a', 1, 1, undefined, 0],
      ['b', 2, 10, 'sent-1', 1],
      ['c', 3, 1, undefined, 0],
      [' ', 4, 10, 'sent-3', 1],
      ['after', 5, undefined, undefined, undefined],
    ])
  })

  it('gathers the parts of a group stream, which groups lack, into one message sent when it ends', async () => {
    await start()
    const sent: { id?: string }[][] = []
    const counts: number[] = []
    ctx.on('bot/message', async (session) => {
      sent.push(await session.send(h('markdown', { stream: true }, '第一段，')))
      counts.push(qq().stats.snapshot(qq()).messageSent)
      sent.push(await session.send(h('markdown', { stream: true }, '第二段，')))
      counts.push(qq().stats.snapshot(qq()).messageSent)
      sent.push(await session.send(h('markdown', { stream: 'end' }, '完。')))
      counts.push(qq().stats.snapshot(qq()).messageSent)
    })
    groupAt('M1', ' hi')
    await vi.waitFor(() => expect(sent).toHaveLength(3))
    expect(messages().map(({ body }) => body)).toEqual([{ msg_type: 2, markdown: { content: '第一段，第二段，完。' }, msg_id: 'M1', msg_seq: 1 }])
    expect(sent.map(([resource]) => resource.id)).toEqual([undefined, undefined, 'sent-1'])
    expect(counts).toEqual([0, 0, 1])
    expect(messageLogs().filter(line => line.startsWith('[发-'))).toEqual(['[发-群] G1：[Markdown]第一段，第二段，完。'])
    expect(qq().stats.snapshot(qq())).toMatchObject({ messageReceived: 1, messageSent: 1 })
  })

  it('answers the message a session came from, not the latest of the channel, a stream each', async () => {
    await start({ autoStreamText: ['private'] })
    const sessions: Session[] = []
    ctx.on('bot/message', (session) => {
      sessions.push(session)
    })
    push('C2C_MESSAGE_CREATE', { id: 'C1', author: { id: 'U3', user_openid: 'U3' }, content: 'one', timestamp: sentAt() })
    push('C2C_MESSAGE_CREATE', { id: 'C2', author: { id: 'U3', user_openid: 'U3' }, content: 'two', timestamp: sentAt() })
    await vi.waitFor(() => expect(sessions).toHaveLength(2))
    expect(sessions[0].event.referrer).toEqual({ msg_id: 'C1' })
    const [first, second] = sessions
    await first.send('a1')
    await second.send('b1')
    await first.send('a2')
    await second.send('b2')
    expect(messages().map(({ body }) => [body.markdown.content, body.msg_id, body.msg_seq, body.stream.id, body.stream.index])).toEqual([
      ['a1', 'C1', 1, undefined, 0],
      ['b1', 'C2', 1, undefined, 0],
      ['a2', 'C1', 2, 'sent-1', 1],
      ['b2', 'C2', 2, 'sent-2', 1],
    ])
  })

  it('retries once on the codes it is told to', async () => {
    await start({ retryWhen: [22009] })
    let failed = false
    reply = (call) => {
      if (call.path.endsWith('/messages') && !failed) {
        failed = true
        return { status: 500, body: { code: 22009, message: '服务繁忙' } }
      }
    }
    const [sent] = await qq().sendMessage('G1', 'hi')
    expect(messages()).toHaveLength(2)
    expect(sent.id).toBe('sent-1')
  })

  it('waits for the audit of a message under audit', async () => {
    await start({ intents: ['GROUP_AND_C2C_EVENT', 'MESSAGE_AUDIT'] })
    reply = (call) => {
      if (call.path.endsWith('/messages')) return { body: { audit_id: 'A1' } }
    }
    const sending = qq().sendMessage('G1', 'hi')
    await vi.waitFor(() => expect(messages()).toHaveLength(1))
    expect(qq().stats.snapshot(qq()).messageSent).toBe(0)
    push('MESSAGE_AUDIT_PASS', { audit_id: 'A1', message_id: 'REAL1', create_time: '2026-10-28T00:00:00Z' })
    const [sent] = await sending
    expect(sent.id).toBe('REAL1')
    expect(qq().stats.snapshot(qq()).messageSent).toBe(1)
  })

  it('does not count an audited message when the platform rejects it', async () => {
    await start({ intents: ['GROUP_AND_C2C_EVENT', 'MESSAGE_AUDIT'] })
    reply = call => call.path.endsWith('/messages') ? { body: { audit_id: 'A2' } } : undefined
    const sending = qq().sendMessage('G1', 'rejected')
    await vi.waitFor(() => expect(messages()).toHaveLength(1))
    push('MESSAGE_AUDIT_REJECT', { audit_id: 'A2' })
    const [sent] = await sending
    expect(sent.id).toBeUndefined()
    expect(qq().stats.snapshot(qq())).toMatchObject({ messageSent: 0, lastMessageAt: undefined })
  })
})

describe('groups', () => {
  it('reports member and join request events, and answers a request by its id', async () => {
    await start({ intents: ['GROUP_AND_C2C_EVENT', 'GROUP_MEMBER_EVENT'] })
    expect(identified.intents).toBe((1 << 25) | (1 << 24))
    const events = collect()
    push('GROUP_MEMBER_ADD', { group_openid: 'G1', member_openid: 'U5', op_member_openid: 'U1', timestamp: 1_800_000_000 })
    push('GROUP_JOIN_REQUEST', {
      group_openid: 'G1',
      member_openid: 'U6',
      username: 'Bob',
      join_request_id: 'J1',
      verify_info: { method: 'verify_message', verify_message: 'let me in' },
    })
    await vi.waitFor(() => expect(events).toHaveLength(2))
    expect(events[0]).toMatchObject({ type: 'guild-member-added', guildId: 'G1', userId: 'U5' })
    expect(events[0].event.operator).toEqual({ id: 'U1' })
    expect(events[1]).toMatchObject({ type: 'guild-member-request', guildId: 'G1', userId: 'U6', messageId: 'J1', content: 'let me in' })
    expect(events[1].event.user.name).toBe('Bob')

    await qq().handleGuildMemberRequest('J1', false, 'no')
    expect(calls.at(-1)).toEqual({
      method: 'POST',
      path: '/v2/groups/G1/approval_join_request/U6',
      query: '',
      body: { op: 'decline', join_request_id: 'J1', reject_reason: 'no', add_to_member_blacklist: false },
    })
    await expect(qq().handleGuildMemberRequest('J1', true)).rejects.toThrow('J1')
  })

  it('mutes through the restrict setting, updating a member already muted', async () => {
    await start()
    reply = (call) => {
      if (call.method === 'GET' && call.path.endsWith('/restrict_chat_setting')) {
        return { body: { members: [{ member_openid: 'U2', mute_expire_at: '2026-11-01T00:00:00Z' }] } }
      }
    }
    await qq().muteGuildMember('G1', 'U2', 60_000)
    await qq().muteGuildMember('G1', 'U3', 60_000)
    await qq().muteGuildMember('G1', 'U2', 0)
    const writes = calls.filter(call => call.method === 'POST' && call.path.endsWith('/restrict_chat_setting'))
    expect(writes.map(call => call.body.members[0].op)).toEqual(['update', 'add', 'del'])
    expect(writes[2].body.members[0].mute_expire_at).toBe('')
    expect(Date.parse(writes[0].body.members[0].mute_expire_at)).toBeGreaterThan(Date.now())
  })

  it('names groups and members, and kicks onto the blacklist', async () => {
    await start()
    reply = (call) => {
      if (call.path === '/v2/groups/G1/info') return { body: { group_openid: 'G1', group_name: '测试群' } }
      if (call.path === '/v2/groups/G1/members') {
        return { body: { members: [{ member_openid: 'U2', username: 'Dan', member_role: 'admin', joined_at: '2026-01-01T00:00:00Z' }], next_cursor: 'N' } }
      }
    }
    expect(await qq().getGuild('G1')).toEqual({ id: 'G1', name: '测试群' })
    expect(await qq().getChannel('G1')).toMatchObject({ id: 'G1', name: '测试群' })
    const list = await qq().getGuildMemberList('G1')
    expect(list.next).toBe('N')
    expect(list.data[0]).toMatchObject({ user: { id: 'U2', name: 'Dan' }, roles: [{ id: 'admin' }] })
    await qq().kickGuildMember('G1', 'U2', true)
    expect(calls.at(-1)).toMatchObject({
      path: '/v2/groups/G1/batch_remove_members',
      body: { member_openids: ['U2'], add_to_member_blacklist: true },
    })
  })

  it('reports the message receive switch, and passes every event on as an internal one', async () => {
    await start()
    const internal: Session[] = []
    ctx.on('bot/event', (session) => {
      if (session.type === 'internal') internal.push(session)
    })
    const events = collect()
    push('GROUP_MSG_RECEIVE', { group_openid: 'G1', op_member_openid: 'U1', timestamp: 1_800_000_000 }, 'EV9')
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]).toMatchObject({ type: 'group-msg-receive', guildId: 'G1', event: { referrer: { event_id: 'EV9' } } })
    expect(internal[0].event).toMatchObject({ _type: 'qq/group-msg-receive', _data: { group_openid: 'G1' } })
    // A reply may cite the event
    await qq().sendMessage('G1', 'thanks')
    expect(messages()[0].body).toMatchObject({ event_id: 'EV9', msg_seq: 1 })
  })
})

describe('guilds', () => {
  const guildMessage = (overrides: object = {}) => ({
    id: 'GM1',
    author: { id: 'U9', username: 'Carol' },
    content: '<@!B> hello',
    guild_id: 'GU1',
    channel_id: 'CH1',
    timestamp: sentAt(),
    ...overrides,
  })

  it('keeps one bot with group-only subscriptions', async () => {
    await start({ intents: ['GROUP_AND_C2C_EVENT'] })
    expect(identified.intents).toBe(1 << 25)
    expect(ctx.bots.get('qqguild:APPID')).toBeUndefined()
    expect([...ctx.bots]).toEqual([qq()])
  })

  it('turns a guild @ message into a session of the same QQ bot and replies in its namespaced channel', async () => {
    await start({ intents: ['GROUP_AND_C2C_EVENT', 'PUBLIC_GUILD_MESSAGES'] })
    expect([...ctx.bots]).toEqual([qq()])
    const sessions: Session[] = []
    ctx.on('bot/message', async (session) => {
      sessions.push(session)
      await session.send('hi')
    })
    push('AT_MESSAGE_CREATE', guildMessage())
    await vi.waitFor(() => expect(messages()).toHaveLength(1))
    expect(sessions[0]).toMatchObject({
      platform: 'qq', userId: 'qqguild:U9', channelId: 'qqguild:CH1', guildId: 'qqguild:GU1', content: '<at id="APPID"/> hello', isDirect: false,
    })
    expect(sessions[0].bot).toBe(qq())
    expect(messages()[0]).toMatchObject({ path: '/channels/CH1/messages', body: { content: 'hi', msg_id: 'GM1' } })
    expect(messageLogs()).toEqual(['[收-频道] CH1 Carol(qqguild:U9)：@APPID hello', '[发-频道] CH1：hi'])
    expect(qq().stats.snapshot(qq())).toMatchObject({ messageReceived: 1, messageSent: 1 })
  })

  it('addresses guild DMs by their DM guild', async () => {
    await start({ intents: ['DIRECT_MESSAGE'] })
    const sessions: Session[] = []
    ctx.on('bot/message', session => {
      sessions.push(session)
      return session.send('hi').then(() => {})
    })
    push('DIRECT_MESSAGE_CREATE', guildMessage({ direct_message: true, src_guild_id: 'SRC', guild_id: 'DMG', channel_id: 'DMC', content: 'dm' }))
    await vi.waitFor(() => expect(messages()).toHaveLength(1))
    expect(messages()[0]).toMatchObject({ path: '/dms/DMG/messages', body: { content: 'hi', msg_id: 'GM1' } })
    expect(sessions[0]).toMatchObject({ platform: 'qq', channelId: 'private:qqguild:DMG_DMC', guildId: 'qqguild:SRC_DMG', isDirect: true })
    expect(sessions[0].bot).toBe(qq())
    expect(messageLogs()).toEqual(['[收-频道私信] DMG_DMC Carol(qqguild:U9)：dm', '[发-频道私信] DMG_DMC：hi'])
    expect(qq().stats.snapshot(qq())).toMatchObject({ messageReceived: 1, messageSent: 1 })
  })

  it('keeps identically named group/guild messages separate and exposes only one bot to send hooks', async () => {
    await start()
    const sessions: Session[] = []
    const sending: [Bot, string][] = []
    ctx.on('bot/message', session => { sessions.push(session) })
    ctx.on('bot/before-send', (bot, channel, content) => { sending.push([bot, channel]); return content })
    groupAt('GM1', ' group')
    push('AT_MESSAGE_CREATE', guildMessage({ content: '<@!B> <@U9> <#CH2>', message_reference: { message_id: 'OLDER' } }))
    await vi.waitFor(() => expect(sessions).toHaveLength(2))
    const group = sessions.find(session => session.channelId === 'G1')!
    const channel = sessions.find(session => session.channelId === 'qqguild:CH1')!
    expect(channel.content).toBe('<quote id="qqguild:OLDER"/><at id="APPID"/> <at id="qqguild:U9"/> <sharp id="qqguild:CH2"/>')
    expect(group.messageId).toBe('GM1')
    expect(channel.messageId).toBe('qqguild:GM1')
    expect(channel.event.referrer).toEqual({ msg_id: 'qqguild:GM1' })
    await group.send('group reply')
    const results = await channel.reply([h.at(channel.userId!), h('sharp', { id: 'qqguild:CH2' })])
    expect(sending).toEqual([[qq(), 'G1'], [qq(), 'qqguild:CH1']])
    expect(messages()[0]).toMatchObject({ path: '/v2/groups/G1/messages', body: { msg_id: 'GM1', msg_seq: 1 } })
    expect(messages()[1]).toMatchObject({ path: '/channels/CH1/messages', body: { content: '<@U9><#CH2>', msg_id: 'GM1', message_reference: { message_id: 'GM1' } } })
    expect(results[0]).toMatchObject({ id: 'qqguild:sent-2', channel: { id: 'qqguild:CH1' }, user: { id: 'APPID' } })
    expect(results[0].content).toBe('<at id="qqguild:U9"/><sharp id="qqguild:CH2"/>')
    expect(sessions.every(session => session.bot === qq())).toBe(true)
    expect(new Set(sessions.map(session => session.event.sn)).size).toBe(2)
  })

  it('opens and deletes guild DMs through the main bot without confusing C2C', async () => {
    await start()
    reply = call => call.path === '/users/@me/dms' ? { body: { guild_id: 'DMG', channel_id: 'DMC' } } : undefined
    const channel = await qq().createDirectChannel('qqguild:U9', 'qqguild:SRC_DMG')
    expect(channel).toEqual({ id: 'private:qqguild:DMG_DMC', type: 1 })
    expect(calls.find(call => call.path === '/users/@me/dms')?.body).toEqual({ recipient_id: 'U9', source_guild_id: 'SRC' })
    const [message] = await qq().sendPrivateMessage('qqguild:U9', 'guild dm', { guildId: 'qqguild:SRC' })
    expect(message).toMatchObject({ id: 'qqguild:sent-1', channel })
    await qq().deleteMessage(channel.id, message.id)
    await qq().sendPrivateMessage('U9', 'c2c')
    expect(messages().map(call => call.path)).toEqual(['/dms/DMG/messages', '/v2/users/U9/messages'])
    expect(calls).toContainEqual(expect.objectContaining({ method: 'DELETE', path: '/dms/DMG/messages/sent-1' }))
  })

  it('routes guild resource APIs with namespaced IDs and preserves raw internal endpoints', async () => {
    await start()
    reply = call => {
      if (call.path === '/users/@me/guilds') return { body: [{ id: 'GU1', name: 'Guild' }] }
      if (call.path === '/guilds/GU1') return { body: { id: 'GU1', name: 'Guild' } }
      if (call.path === '/guilds/GU1/channels') return { body: call.method === 'POST' ? { id: 'NEW', name: 'New', type: 0, parent_id: 'CAT' } : [{ id: 'CH1', type: 0 }] }
      if (call.path === '/guilds/GU1/members') return { body: [{ user: { id: 'U9', username: 'Carol' }, roles: ['2'] }] }
      if (call.path === '/guilds/GU1/members/U9' && call.method === 'GET') return { body: { user: { id: 'U9', username: 'Carol' }, roles: ['2'] } }
      if (call.path === '/guilds/GU1/members/B' && call.method === 'GET') return { body: { user: { id: 'B', username: 'TestBot', bot: true }, roles: ['1'] } }
      if (call.path === '/channels/CH1/messages/GM1') return { body: { message: guildMessage({ content: '<@U9>' }) } }
      if (call.path === '/channels/CH1/messages/GM1/reactions/1/4' && call.method === 'GET') return { body: { users: [{ id: 'U9', username: 'Carol' }], cookie: 'NEXT' } }
      if (call.path === '/v2/groups/GU1/info') return { body: { group_openid: 'GU1', group_name: 'Group' } }
    }
    expect(await qq().getGuild('GU1')).toMatchObject({ id: 'GU1', name: 'Group' })
    expect(await qq().getGuild('qqguild:GU1')).toMatchObject({ id: 'qqguild:GU1', name: 'Guild' })
    expect(await qq().getGuildList()).toMatchObject({ data: [{ id: 'qqguild:GU1' }] })
    expect(await qq().getChannelList('qqguild:GU1')).toMatchObject({ data: [{ id: 'qqguild:CH1' }] })
    expect(await qq().getGuildMember('qqguild:GU1', 'qqguild:U9')).toMatchObject({ user: { id: 'qqguild:U9' }, roles: [{ id: '2' }] })
    expect(await qq().getGuildMember('qqguild:GU1_DMG', 'APPID')).toMatchObject({ user: { id: 'APPID', is_bot: true } })
    expect(await qq().getGuildMemberList('qqguild:GU1', 'LAST')).toMatchObject({ data: [{ user: { id: 'qqguild:U9' } }], next: 'U9' })
    expect(await qq().getUser('qqguild:U9', 'qqguild:GU1')).toMatchObject({ id: 'qqguild:U9', name: 'Carol' })
    expect(await qq().getMessage('qqguild:CH1', 'qqguild:GM1')).toMatchObject({ id: 'qqguild:GM1', content: '<at id="qqguild:U9"/>', user: { id: 'qqguild:U9' }, channel: { id: 'qqguild:CH1' } })
    expect(await qq().createChannel('qqguild:GU1', { name: 'New', parentId: 'qqguild:CAT', private_user_ids: ['qqguild:U9'] })).toMatchObject({ id: 'qqguild:NEW', parent_id: 'qqguild:CAT' })
    expect(calls.find(call => call.method === 'POST' && call.path === '/guilds/GU1/channels')?.body).toMatchObject({ parent_id: 'CAT', private_user_ids: ['U9'] })
    await qq().muteGuildMember('qqguild:GU1', 'qqguild:U9', 60_000)
    await qq().kickGuildMember('qqguild:GU1', 'qqguild:U9')
    await qq().createReaction('qqguild:CH1', 'qqguild:GM1', '1:4')
    await qq().deleteReaction('qqguild:CH1', 'qqguild:GM1', '1:4')
    expect(await qq().getReactionList('qqguild:CH1', 'qqguild:GM1', '1:4')).toMatchObject({ data: [{ id: 'qqguild:U9' }], next: 'NEXT' })
    expect(calls).toContainEqual(expect.objectContaining({ method: 'PATCH', path: '/guilds/GU1/members/U9/mute', body: { mute_seconds: 60 } }))
    await qq().internal.sendMessage('GROUP', { content: 'raw group' })
    await qq().internal.sendGuildMessage('CHANNEL', { content: 'raw guild' })
    await qq().internal.deleteGuildMessage('CHANNEL', 'MESSAGE')
    expect(messages().slice(-2).map(call => call.path)).toEqual(['/v2/groups/GROUP/messages', '/channels/CHANNEL/messages'])
    expect(calls).toContainEqual(expect.objectContaining({ method: 'DELETE', path: '/channels/CHANNEL/messages/MESSAGE' }))
    expect(await qq().getUser('APPID')).toMatchObject({ id: 'APPID', name: 'TestBot' })
    await expect(qq().createChannel('GU1', { name: 'wrong namespace' })).rejects.toThrow('qqguild:')
  })

  it('dispatches guild button callbacks on the same bot and replies using their event ID', async () => {
    await start()
    const sessions: Session[] = []
    ctx.on('bot/event', async session => {
      if (session.type !== 'interaction/button') return
      sessions.push(session)
      await session.send('clicked')
    })
    push('INTERACTION_CREATE', { id: 'I9', chat_type: 3, guild_id: 'GU1', channel_id: 'CH1', data: { resolved: { user_id: 'U9', button_id: 'button', button_data: 'keep:raw' } } }, 'EV9')
    await vi.waitFor(() => expect(messages()).toHaveLength(1))
    expect(sessions[0]).toMatchObject({ platform: 'qq', userId: 'qqguild:U9', channelId: 'qqguild:CH1', event: { referrer: { event_id: 'qqguild:EV9' }, button: { id: 'button', data: 'keep:raw' } } })
    expect(sessions[0].bot).toBe(qq())
    expect(messages()[0]).toMatchObject({ path: '/channels/CH1/messages', body: { content: 'clicked', event_id: 'EV9' } })
    expect(messages()[0].body.msg_id).toBeUndefined()
    expect(calls).toContainEqual(expect.objectContaining({ method: 'PUT', path: '/interactions/I9' }))
  })

  it('runs the same registered command in a group and a guild without treating its own guild messages as input', async () => {
    await start()
    await ctx.plugin(CommandService)
    const bots: Bot[] = []
    ctx.command('unified').action(({ session }) => { bots.push(session.bot); return 'ok' })
    groupAt('CMD1', ' /unified')
    push('AT_MESSAGE_CREATE', guildMessage({ id: 'CMD1', content: '<@!B> /unified' }))
    push('MESSAGE_CREATE', guildMessage({ id: 'OWN', author: { id: 'B', bot: true }, content: '/unified' }))
    await vi.waitFor(() => expect(messages()).toHaveLength(2))
    await settle()
    expect(bots).toEqual([qq(), qq()])
    expect(messages().map(call => call.path).sort()).toEqual(['/channels/CH1/messages', '/v2/groups/G1/messages'])
    expect(qq().stats.snapshot(qq())).toMatchObject({ messageReceived: 2, messageSent: 2 })
  })

  it('publishes a single Satori login for group and guild events and routes guild sends through it', async () => {
    await start()
    await ctx.plugin(SatoriAdapter, { enable: true, host: '127.0.0.1', port: 0, token: '' })
    const server = (ctx.satori as any).server
    await vi.waitFor(() => expect(server.httpServer?.listening).toBe(true))
    const socket = new WebSocket(`ws://127.0.0.1:${server.httpServer.address().port}/v1/events`)
    const frames: any[] = []
    socket.on('message', data => frames.push(JSON.parse(data.toString())))
    try {
      await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
      socket.send(JSON.stringify({ op: Opcode.IDENTIFY, body: {} }))
      await vi.waitFor(() => expect(frames.some(frame => frame.op === Opcode.READY)).toBe(true))
      const ready = frames.find(frame => frame.op === Opcode.READY)
      expect(ready.body.logins).toHaveLength(1)
      expect(ready.body.logins[0]).toMatchObject({ platform: 'qq', user: { id: 'APPID' } })
      groupAt('S1', ' group')
      push('AT_MESSAGE_CREATE', guildMessage({ id: 'S1' }))
      await vi.waitFor(() => expect(frames.filter(frame => frame.body?.type === 'message-created')).toHaveLength(2))
      const events = frames.filter(frame => frame.body?.type === 'message-created').map(frame => frame.body)
      expect(new Set(events.map(event => event.login.sn)).size).toBe(1)
      expect(events.every(event => event.platform === 'qq' && event.login.platform === 'qq')).toBe(true)
      const response = await server.app.fetch(new Request('http://localhost/v1/message.create', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Satori-Platform': 'qq', 'Satori-User-ID': 'APPID' },
        body: JSON.stringify({ channel_id: 'qqguild:CH1', content: 'from Satori', referrer: { msg_id: 'qqguild:S1' } }),
      }))
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject([{ id: 'qqguild:sent-1', channel: { id: 'qqguild:CH1' } }])
      expect(messages()[0]).toMatchObject({ path: '/channels/CH1/messages', body: { msg_id: 'S1' } })
    } finally {
      socket.terminate()
    }
  })

  it('sends markdown with its AppID, remote images by URL, local ones as multipart', async () => {
    await start({ intents: ['PUBLIC_GUILD_MESSAGES'] })
    await qq().sendMessage('qqguild:CH1', [h('markdown', '**hi**'), h('button', { text: 'go' })])
    await qq().sendMessage('qqguild:CH1', h.image('https://example.com/a.png'))
    await qq().sendMessage('qqguild:CH1', h.image('data:image/png;base64,AAAA'))
    expect(messages()[0].body).toMatchObject({ msg_type: 2, markdown: { content: '**hi**' }, bot_appid: 'APPID' })
    expect(messages()[1].body).toEqual({ image: 'https://example.com/a.png' })
    const form = messages()[2].form!
    expect(form.get('file_image')).toBeInstanceOf(Blob)
  })

  it('lets a private bot with every guild message skip the duplicate @ message', async () => {
    await start({ type: 'private', intents: ['GUILD_MESSAGES', 'PUBLIC_GUILD_MESSAGES'] })
    const sessions: Session[] = []
    ctx.on('bot/message', (session) => {
      sessions.push(session)
    })
    push('AT_MESSAGE_CREATE', guildMessage({ id: 'A' }))
    push('MESSAGE_CREATE', guildMessage({ id: 'B2' }))
    await vi.waitFor(() => expect(sessions).toHaveLength(1))
    await settle()
    expect(sessions.map(session => session.messageId)).toEqual(['qqguild:B2'])
  })

  it('reports reactions, channels and members', async () => {
    await start({ intents: ['GUILDS', 'GUILD_MEMBERS', 'GUILD_MESSAGE_REACTIONS'] })
    const events = collect()
    push('MESSAGE_REACTION_ADD', {
      user_id: 'U9', guild_id: 'GU1', channel_id: 'CH1', target: { id: 'M5', type: 'ReactionTargetType_MSG' }, emoji: { id: '4', type: 1 },
    })
    push('CHANNEL_CREATE', { id: 'CH2', guild_id: 'GU1', name: '新频道', type: 0, op_user_id: 'U9' })
    push('GUILD_MEMBER_ADD', { guild_id: 'GU1', user: { id: 'U10', username: 'Eve' }, nick: 'E', roles: ['1'], joined_at: sentAt() })
    await vi.waitFor(() => expect(events).toHaveLength(3))
    expect(events.map(session => session.type)).toEqual(['reaction-added', 'channel-added', 'guild-member-added'])
    expect(events[0].event.message).toEqual({ id: 'qqguild:M5', content: '1:4' })
    expect(events[1].event.channel).toMatchObject({ id: 'qqguild:CH2', name: '新频道' })
    expect(events[2]).toMatchObject({ userId: 'qqguild:U10', guildId: 'qqguild:GU1', platform: 'qq' })
  })

  it('reads and writes QQ faces as <emoji:id>', async () => {
    await start({ intents: ['PUBLIC_GUILD_MESSAGES'] })
    const sessions: Session[] = []
    ctx.on('bot/message', (session) => {
      sessions.push(session)
    })
    push('AT_MESSAGE_CREATE', guildMessage({ content: '<@!B> hi<emoji:4>' }))
    await vi.waitFor(() => expect(sessions).toHaveLength(1))
    expect(sessions[0].content).toBe('<at id="APPID"/> hi<face id="4"/>')

    await qq().sendMessage('qqguild:CH1', [h.text('好的'), h('face', { id: '13', name: '呲牙' })])
    expect(messages()[0].body).toMatchObject({ content: '好的<emoji:13>' })
  })
})

describe('what the official bot sends of the cross-platform elements', () => {
  const image = 'https://example.com/a.png'
  const button = (label: string, action: object, id?: string) => ({
    ...(id ? { id } : {}),
    render_data: { label, visited_label: label, style: 1 },
    action,
  })
  const expected: Record<string, object[]> = {
    markdown: [{ msg_type: 2, markdown: { content: '# 标题\n**粗体** 和 [链接](https://example.com)' } }],
    buttons: [{
      msg_type: 2,
      markdown: { content: '选一个' },
      keyboard: {
        content: {
          rows: [{
            buttons: [
              button('签到', { type: 2, permission: { type: 2 }, data: '签到', enter: true }),
              button('每日签到', { type: 2, permission: { type: 2 }, data: '/sign', enter: true }),
              button('官网', { type: 0, permission: { type: 2 }, data: 'https://example.com' }),
              button('投票', { type: 1, permission: { type: 2 }, data: 'vote', enter: true }, 'vote'),
            ],
          }],
        },
      },
    }],
    // Markdown rather than ark, which takes an application; the image sized as read from it
    card: [{ msg_type: 2, markdown: { content: `**[标题](https://example.com/a)**\n描述\n![标题 #640px #360px](${image})` } }],
    // Sending faces is documented for guilds only
    face: [{ msg_type: 0, content: '好的[呲牙]' }],
  }
  const bodies = () => messages().map(({ body: { msg_id: _id, msg_seq: _seq, ...body } }) => body)

  it('says what it sends natively', async () => {
    await start({ intents: ['GROUP_AND_C2C_EVENT', 'PUBLIC_GUILD_MESSAGES'] })
    expect(qq().features).toEqual(['message.markdown', 'message.button', 'message.card', 'message.face', 'message.stream', 'message.proactive', 'guild.plain'])
  })

  it('covers every case', () => {
    expect(Object.keys(expected).sort()).toEqual(Object.keys(crossPlatform(image)).sort())
  })

  for (const [name, content] of Object.entries(crossPlatform(image))) {
    it(name, async () => {
      await start()
      reply = call => call.path === '/a.png' ? { body: pngHeader(640, 360) } : undefined
      groupAt('M1', ' x')
      await settle()
      await qq().sendMessage('G1', content)
      expect(bodies()).toEqual(expected[name])
    })
  }

  it('writes a card into the markdown around it, whatever fields it has', async () => {
    await start()
    await qq().sendMessage('G1', ['前面的字', h('card', { title: '标_题', desc: '描述' }), '后面的字'])
    await qq().sendMessage('G1', h('card', { url: 'https://example.com/a(1)' }))
    expect(messages().map(call => call.body)).toEqual([
      { msg_type: 2, markdown: { content: '前面的字\n**标&#95;题**\n描述\n后面的字' } },
      { msg_type: 2, markdown: { content: '[https://example.com/a(1)](https://example.com/a%281%29)' } },
    ])
  })

  it('sends the image of a card after it when it is not on the web, unsized when it cannot be read', async () => {
    await start()
    reply = call => call.path === '/gone.png' ? { status: 404, body: {} } : undefined
    await qq().sendMessage('G1', h('card', { title: '标题', url: 'https://example.com/a', image: 'data:image/png;base64,AAAA' }))
    await qq().sendMessage('G1', h('card', { title: '标题', image: 'https://example.com/gone.png' }))
    expect(messages().map(call => call.body)).toEqual([
      { msg_type: 2, markdown: { content: '**[标题](https://example.com/a)**' } },
      { msg_type: 7, media: { file_info: 'info:data' } },
      { msg_type: 2, markdown: { content: '**标题**\n![标题](https://example.com/gone.png)' } },
    ])
  })

  it('sends a card to a guild as ark', async () => {
    await start({ intents: ['PUBLIC_GUILD_MESSAGES'] })
    await qq().sendMessage('qqguild:CH1', h('card', { title: '标题', url: 'https://example.com/a', desc: '描述' }))
    expect(messages()[0]).toMatchObject({ path: '/channels/CH1/messages', body: { ark: { template_id: 23 } } })
  })
})

describe('interactions', () => {
  it('leaves interactions without a button out, still acknowledging them', async () => {
    await start({ intents: ['GROUP_AND_C2C_EVENT', 'INTERACTION'] })
    const events = collect()
    push('INTERACTION_CREATE', { id: 'I2', type: 13, chat_type: 1, group_openid: 'G1' }, 'EV2')
    await vi.waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: 'PUT', path: '/interactions/I2' })))
    await settle()
    expect(events).toEqual([])
  })

  it('leaves the acknowledgement to plugins when set to', async () => {
    await start({ intents: ['GROUP_AND_C2C_EVENT', 'INTERACTION'], manualAcknowledge: true })
    const events = collect()
    push('INTERACTION_CREATE', {
      id: 'I3', type: 11, chat_type: 2, user_openid: 'U3', data: { resolved: { button_id: 'b', button_data: 'd' } },
    }, 'EV3')
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]).toMatchObject({ type: 'interaction/button', channelId: 'private:U3' })
    expect(calls.some(call => call.path.startsWith('/interactions/'))).toBe(false)
  })
})

describe('menus', () => {
  it('puts the configured C2C menu and group panel in place after READY', async () => {
    await start({
      privateMenu: [{ type: 'send_message', name: '帮助', value: '/help' }],
      groupPanels: [{ type: 'command', name: '/help', description: '帮助', onlyAdmin: false }],
    })
    await vi.waitFor(() => expect(calls.some(call => call.method === 'POST' && call.path === '/v2/panels')).toBe(true))
    expect(calls.find(call => call.method === 'PUT' && call.path === '/v2/menu')!.body).toEqual({
      menu: { items: [{ name: '帮助', type: 'send_message', send_message: '/help' }] },
    })
    expect(calls.find(call => call.method === 'POST' && call.path === '/v2/panels')!.body).toEqual({
      scope: 'group',
      target_type: 'all',
      panel: { items: [{ name: '/help', desc: '帮助', type: 'command', only_admin: false }], remark: 'llbot-qq-official' },
    })
  })
})
