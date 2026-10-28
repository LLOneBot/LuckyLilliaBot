import h from '@satorijs/element'
import { Status } from '@satorijs/protocol'
import { Context } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { WebSocket, WebSocketServer } from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bot, Session } from '@luckylillia/plugin-sdk'
import type { QQOfficialConfig } from '@/common/types'
import BotsService from '@/universal/bots'
import * as QQOfficial from '@/universal/qqofficial'
import type { QQGuildBot, QQOfficialBot } from '@/universal/qqofficial'

// The parts of the adapter that follow Koishi adapter-qq-crack: markdown and buttons, the platform's own payloads,
// group management, guilds, interactions and menus, against a fake REST API and a local gateway

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
const guild = () => ctx.bots.get('qqguild:APPID') as unknown as QQGuildBot & Bot

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
    expect(markdown).toEqual({ content: 'a\\_b ' })
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

  it('writes a mention in markdown when set to', async () => {
    await start({ useMarkdownIfAt: true })
    await qq().sendMessage('G1', 'hi_ <at id="U2"/> <at type="all"/>')
    expect(messages()[0].body).toEqual({ msg_type: 2, markdown: { content: 'hi\\_ <@U2> @everyone' } })
  })

  it('splits inline data images out of markdown into media of their own', async () => {
    await start()
    await qq().sendMessage('private:U3', h('markdown', 'before ![x](data:image/png;base64,AAAA) after'))
    expect(calls.filter(call => call.path.endsWith('/files')).map(call => call.body)).toEqual([
      { file_type: 1, file_data: 'AAAA', file_name: 'file', srv_send_msg: false },
    ])
    // As Koishi adapter-qq-crack does: the text after an image does not join it
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
      { msg_type: 2, markdown: { content: 'hi\\_' }, stream: { state: 1, index: 0, reset: false }, msg_id: 'C1', msg_seq: 1 },
      { msg_type: 2, markdown: { content: 'more' }, stream: { state: 1, id: 'sent-1', index: 1, reset: false }, msg_id: 'C1', msg_seq: 2 },
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
    push('MESSAGE_AUDIT_PASS', { audit_id: 'A1', message_id: 'REAL1', create_time: '2026-10-28T00:00:00Z' })
    const [sent] = await sending
    expect(sent.id).toBe('REAL1')
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
    expect(events[0]).toMatchObject({ type: 'group-msg-receive', guildId: 'G1' })
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

  it('needs a guild event subscribed for the qqguild bot', async () => {
    await start()
    expect(ctx.bots.get('qqguild:APPID')).toBeUndefined()
  })

  it('turns an @ message in a guild into a session of the qqguild bot and replies in its channel', async () => {
    await start({ intents: ['GROUP_AND_C2C_EVENT', 'PUBLIC_GUILD_MESSAGES'] })
    expect(guild().status).toBe(Status.ONLINE)
    const sessions: Session[] = []
    ctx.on('bot/message', async (session) => {
      sessions.push(session)
      await session.send('hi')
    })
    push('AT_MESSAGE_CREATE', guildMessage())
    await vi.waitFor(() => expect(messages()).toHaveLength(1))
    expect(sessions[0]).toMatchObject({
      platform: 'qqguild', userId: 'U9', channelId: 'CH1', guildId: 'GU1', content: '<at id="APPID"/> hello', isDirect: false,
    })
    expect(messages()[0]).toMatchObject({ path: '/channels/CH1/messages', body: { content: 'hi', msg_id: 'GM1' } })
  })

  it('addresses guild DMs by their DM guild', async () => {
    await start({ intents: ['DIRECT_MESSAGE'] })
    ctx.on('bot/message', session => session.send('hi').then(() => {}))
    push('DIRECT_MESSAGE_CREATE', guildMessage({ direct_message: true, src_guild_id: 'SRC', guild_id: 'DMG', channel_id: 'DMC', content: 'dm' }))
    await vi.waitFor(() => expect(messages()).toHaveLength(1))
    expect(messages()[0]).toMatchObject({ path: '/dms/DMG/messages', body: { content: 'hi', msg_id: 'GM1' } })
  })

  it('sends markdown with its AppID, remote images by URL, local ones as multipart', async () => {
    await start({ intents: ['PUBLIC_GUILD_MESSAGES'] })
    await guild().sendMessage('CH1', [h('markdown', '**hi**'), h('button', { text: 'go' })])
    await guild().sendMessage('CH1', h.image('https://example.com/a.png'))
    await guild().sendMessage('CH1', h.image('data:image/png;base64,AAAA'))
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
    expect(sessions.map(session => session.messageId)).toEqual(['B2'])
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
    expect(events[0].event.message).toEqual({ id: 'M5', content: '1:4' })
    expect(events[1].event.channel).toMatchObject({ id: 'CH2', name: '新频道' })
    expect(events[2]).toMatchObject({ userId: 'U10', guildId: 'GU1', platform: 'qqguild' })
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
