import { Context, Fiber, Service } from 'cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bot, NeutralEvent } from '@luckylillia/plugin-sdk'
import * as NT from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import BotsService from '@/universal/bots'
import * as NTQQUniversal from '@/plugin/internal/service/ntqq-universal'
import SatoriAdapter from '@/plugin/internal/adapter/satori/adapter'

// The Satori adapter on the neutral layer: every bot of ctx.bots, the NT account under the name Satori clients have
// always seen (llonebot), the rest under their own

function stub(name: string, methods: Record<string, unknown> = {}) {
  return class extends Service {
    constructor(ctx: Context) {
      super(ctx, name)
      Object.assign(this, methods)
    }
  }
}

// The logged-in account, as ctx.account has it
const ACCOUNT = { uin: '123456', uid: 'test-uid', nick: 'TestBot', online: true }

function rawMessage(senderUin: number, elements: unknown[]) {
  return {
    msgId: '7001',
    msgSeq: 42,
    msgTime: '1700000000',
    clientSeq: 0,
    chatType: NT.ChatType.Group,
    peerUid: '987654',
    peerUin: 987654,
    peerName: 'Test Group',
    senderUin,
    senderUid: `u_${senderUin}`,
    sendNickName: 'Alice',
    sendMemberName: 'Alice',
    elements,
  } as unknown as NT.RawMessage
}

const text = (content: string) => ({ textElement: { content, atType: NT.AtType.Unknown } })
const ARK = { arkElement: { bytesData: '{"prompt":"[分享]标题"}' } }

let ctx: Context
let adapter: Fiber
let dispatched: Record<string, any>[]
let sendMessage: ReturnType<typeof vi.fn>
let setGroupMemberAdmin: ReturnType<typeof vi.fn>
let muteGroup: ReturnType<typeof vi.fn>

// A bot of another platform, as the QQ official bot registers it
const official: Bot = {
  platform: 'qq',
  selfId: 'APPID',
  sid: 'qq:APPID',
  status: 1,
  features: ['message.markdown'],
  user: { id: 'APPID', name: 'Official' },
  sendMessage: async () => [],
}

beforeEach(async () => {
  ctx = new Context()
  dispatched = []
  sendMessage = vi.fn(async () => rawMessage(123456, [ARK]))
  setGroupMemberAdmin = vi.fn(async () => ({ errorCode: 0, errorMsg: '' }))
  muteGroup = vi.fn(async () => ({ errorCode: 0, errorMsg: '' }))
  await ctx.plugin(BotsService)
  for (const name of ['ntMsgApi', 'ntFileApi', 'ntFriendApi', 'ntWebApi', 'ntSystemApi', 'config', 'timer', 'qqProtocol']) {
    await ctx.plugin(stub(name))
  }
  await ctx.plugin(stub('account', ACCOUNT))
  await ctx.plugin(stub('store', { getMsgBySeq: () => undefined }))
  await ctx.plugin(stub('app', { sendMessage }))
  await ctx.plugin(stub('ntGroupApi', { setGroupMemberAdmin, muteGroup }))
  await ctx.plugin(stub('ntUserApi', { getUidByUin: async () => 'u_555' }))
  await ctx.plugin(NTQQUniversal)
  adapter = await ctx.plugin(SatoriAdapter, { enable: true, host: '127.0.0.1', port: 0, token: '' })
  const satori = ctx.satori as unknown as { server: { dispatch: (body: unknown) => void } }
  vi.spyOn(satori.server, 'dispatch').mockImplementation(body => {
    dispatched.push(body as Record<string, any>)
  })
})

afterEach(async () => {
  await adapter.dispose()
})

function request(name: string, platform: string, selfId: string, body: object) {
  const { app } = (ctx.satori as unknown as { server: { app: { fetch: (request: Request) => Promise<Response> } } }).server
  return app.fetch(new Request(`http://localhost/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Satori-Platform': platform, 'Satori-User-ID': selfId },
    body: JSON.stringify(body),
  }))
}

describe('events', () => {
  it('sends the NT account the way it always went out', async () => {
    await ctx.parallel('nt/message-created', { message: rawMessage(555, [text('hi'), { faceElement: { faceIndex: 13, faceType: 1, faceText: '' } }, ARK]) })
    await vi.waitFor(() => expect(dispatched).toHaveLength(1))
    const [event] = dispatched
    expect(Object.keys(event).sort()).toEqual(
      ['channel', 'guild', 'id', 'login', 'member', 'message', 'platform', 'self_id', 'sn', 'timestamp', 'type', 'user'].sort(),
    )
    expect(event).toMatchObject({
      id: 1,
      sn: 1,
      type: 'message-created',
      self_id: '123456',
      platform: 'llonebot',
      login: { sn: 1, platform: 'llonebot', user: { id: '123456' } },
      message: { id: '2|987654|42', created_at: 1700000000000 },
      user: { id: '555', name: 'Alice', is_bot: false },
      channel: { id: '987654', type: 0, name: 'Test Group' },
      guild: { id: '987654' },
    })
    // Its own elements under the old prefix, its faces marked as before
    expect(event.message.content).toBe(
      'hi<face id="13" type="1" name="呲牙" platform="llonebot"/><llonebot:ark data="{&quot;prompt&quot;:&quot;[分享]标题&quot;}">[分享]标题</llonebot:ark>',
    )
    expect(Object.keys(event.login).sort()).toEqual(['platform', 'sn', 'user'])
  })

  it('keeps seeing messages that plugin middleware swallows, and the bot\'s own', async () => {
    ctx.on('bot/message', () => {}, { prepend: true })
    await ctx.parallel('nt/message-created', { message: rawMessage(555, [text('from someone')]) })
    await ctx.parallel('nt/message-created', { message: rawMessage(123456, [text('from the bot')]) })
    await vi.waitFor(() => expect(dispatched).toHaveLength(2))
    expect(dispatched.map(event => [event.sn, event.message.content])).toEqual([[1, 'from someone'], [2, 'from the bot']])
  })

  it('sends the other bots too, numbering events and logins across all of them', async () => {
    await ctx.plugin({ inject: ['bots'], apply: (ctx: Context) => { ctx.bots.register(official) } })
    await ctx.parallel('nt/message-created', { message: rawMessage(555, [text('nt')]) })
    await vi.waitFor(() => expect(dispatched.filter(event => event.type === 'message-created')).toHaveLength(1))
    await ctx.bots.dispatch(official, {
      sn: 1, type: 'message-created', self_id: 'APPID', platform: 'qq', timestamp: 0,
      message: { id: 'q1', content: 'official' }, channel: { id: 'G1', type: 0 },
    } as NeutralEvent)
    expect(dispatched.map(event => [event.type, event.platform, event.sn, event.login.sn])).toEqual([
      ['login-added', 'qq', 1, 1],
      ['message-created', 'llonebot', 2, 2],
      ['message-created', 'qq', 3, 1],
    ])
    expect(dispatched[0].login).toMatchObject({ platform: 'qq', adapter: 'qq', user: { id: 'APPID', name: 'Official' } })
  })
})

describe('API', () => {
  it('calls the bot named by the headers, under the name its clients know it by', async () => {
    const forbidden = await request('guild.list', 'luckylillia', '123456', {})
    expect(forbidden.status).toBe(403)
    expect((await request('guild.member.role.set', 'llonebot', '123456', { guild_id: '987654', user_id: '555', role_id: '3' })).status).toBe(200)
    // Admin is role 3, the id members carry
    expect(setGroupMemberAdmin).toHaveBeenCalledExactlyOnceWith(987654, 'u_555', true)
    await request('channel.mute', 'llonebot', '123456', { channel_id: '987654', guild_id: '987654', enable: false })
    expect(muteGroup).toHaveBeenCalledExactlyOnceWith(987654, false)
  })

  it('relays what a client sends without bot/before-send, renaming its elements both ways', async () => {
    const beforeSend = vi.fn((_bot, _channel, content, next) => next())
    ctx.on('bot/before-send', beforeSend)
    const response = await request('message.create', 'llonebot', '123456', { channel_id: '987654', content: '<llonebot:ark data="{&quot;app&quot;:&quot;x&quot;}"/>' })
    expect(response.status).toBe(200)
    const [, , [ark]] = sendMessage.mock.calls[0]
    expect(ark.arkElement.bytesData).toBe('{"app":"x"}')
    expect(beforeSend).not.toHaveBeenCalled()
    const [sent] = await response.json()
    expect(sent.content).toContain('<llonebot:ark ')
  })

  it('hands the referrer a client sends with a message to the bot, for a passive reply', async () => {
    const send = vi.spyOn(official, 'sendMessage')
    await ctx.plugin({ inject: ['bots'], apply: (ctx: Context) => { ctx.bots.register(official) } })
    expect((await request('message.create', 'qq', 'APPID', { channel_id: 'G1', content: 'hi', referrer: { msg_id: 'M1' } })).status).toBe(200)
    expect(send).toHaveBeenCalledExactlyOnceWith('G1', 'hi', { relay: true, referrer: { msg_id: 'M1' } })
    send.mockRestore()
  })

  it('answers login.get with the methods the bot has and what it can send, and 404 for a method it lacks', async () => {
    await ctx.plugin({ inject: ['bots'], apply: (ctx: Context) => { ctx.bots.register(official) } })
    const login = await (await request('login.get', 'llonebot', '123456', {})).json()
    expect(login).toMatchObject({ platform: 'llonebot', adapter: 'llonebot', user: { id: '123456', name: 'TestBot' } })
    expect(login.features).toEqual(expect.arrayContaining(['message.create', 'friend.list', 'guild.member.role.set', 'message.face', 'guild.plain']))
    expect(login.features).not.toContain('message.update')
    expect((await request('friend.list', 'qq', 'APPID', {})).status).toBe(404)
  })
})
