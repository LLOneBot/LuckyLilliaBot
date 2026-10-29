import { Context, Service } from 'cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@luckylillia/plugin-sdk'
import * as NT from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import BotsService from '@/universal/bots'
import * as NTQQUniversal from '@/plugin/internal/service/ntqq-universal'

function stub(name: string, methods: Record<string, unknown> = {}) {
  return class extends Service {
    constructor(ctx: Context) {
      super(ctx, name)
      Object.assign(this, methods)
    }
  }
}

// selfInfo.uin is 123456 in test/unit/setup.ts
function rawMessage(overrides: Record<string, unknown> = {}) {
  return {
    msgId: '7001',
    msgSeq: 42,
    msgTime: '1700000000',
    clientSeq: 0,
    chatType: NT.ChatType.Group,
    peerUid: '987654',
    peerUin: 987654,
    peerName: 'Test Group',
    senderUin: 555,
    senderUid: 'u_555',
    sendNickName: 'Alice',
    sendMemberName: 'Alice',
    elements: [{ textElement: { content: 'echo hi', atType: NT.AtType.Unknown } }],
    ...overrides,
  } as unknown as NT.RawMessage
}

let ctx: Context
let sendMessage: ReturnType<typeof vi.fn>

beforeEach(async () => {
  ctx = new Context()
  sendMessage = vi.fn(async () => rawMessage({ senderUin: 123456, elements: [{ textElement: { content: 'hi', atType: 0 } }] }))
  await ctx.plugin(BotsService)
  for (const name of ['account', 'ntMsgApi', 'ntFileApi', 'ntFriendApi', 'ntGroupApi', 'ntUserApi', 'ntWebApi']) {
    await ctx.plugin(stub(name))
  }
  await ctx.plugin(stub('app', { sendMessage }))
  await ctx.plugin(stub('store', { getMsgBySeq: () => rawMessage() }))
  await ctx.plugin(NTQQUniversal)
})

describe('NTQQUniversal', () => {
  it('registers the logged-in account as a bot', () => {
    expect(ctx.bots.get('llonebot:123456')).toMatchObject({ platform: 'llonebot', selfId: '123456' })
  })

  it('turns a group message into a session and replies through the NT send path', async () => {
    const sessions: Session[] = []
    ctx.on('bot/message', async (session) => {
      sessions.push(session)
      await session.reply('hi')
    })
    await ctx.parallel('nt/message-created', { message: rawMessage() })
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledOnce())

    expect(sessions[0]).toMatchObject({
      type: 'message-created',
      platform: 'llonebot',
      selfId: '123456',
      userId: '555',
      channelId: '987654',
      guildId: '987654',
      messageId: '2|987654|42',
      isDirect: false,
      content: 'echo hi',
    })
    expect(sessions[0].elements.map(String)).toEqual(['echo hi'])

    const [, peer, elements] = sendMessage.mock.calls[0]
    expect(peer).toEqual({ chatType: NT.ChatType.Group, peerUid: '987654' })
    expect(elements.map((element: NT.SendMessageElement) => element.elementType))
      .toEqual([NT.ElementType.Reply, NT.ElementType.Text])
  })

  it('routes the bot\'s own messages past the middleware', async () => {
    const middleware = vi.fn()
    const events: string[] = []
    ctx.on('bot/message', middleware)
    ctx.on('bot/event', (session) => {
      events.push(`${session.type}:${session.userId}`)
    })
    await ctx.parallel('nt/message-created', { message: rawMessage({ senderUin: 123456 }) })
    await vi.waitFor(() => expect(events).toEqual(['message-created:123456']))
    expect(middleware).not.toHaveBeenCalled()
  })

  it('does not send when bot/before-send cancels', async () => {
    ctx.on('bot/before-send', () => [])
    const bot = ctx.bots.get('llonebot:123456')!
    expect(await bot.sendMessage('987654', 'hi')).toEqual([])
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
