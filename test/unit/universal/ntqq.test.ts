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
let recallMsg: ReturnType<typeof vi.fn>
let muteGroupMember: ReturnType<typeof vi.fn>
let kickGroupMember: ReturnType<typeof vi.fn>

beforeEach(async () => {
  ctx = new Context()
  sendMessage = vi.fn(async () => rawMessage({ senderUin: 123456, elements: [{ textElement: { content: 'hi', atType: 0 } }] }))
  recallMsg = vi.fn(async () => ({}))
  muteGroupMember = vi.fn(async () => ({ errorCode: 0, errorMsg: '' }))
  kickGroupMember = vi.fn(async () => ({ errorCode: 1, errorMsg: '没有权限' }))
  await ctx.plugin(BotsService)
  for (const name of ['account', 'ntFileApi', 'ntFriendApi', 'ntWebApi']) {
    await ctx.plugin(stub(name))
  }
  await ctx.plugin(stub('ntMsgApi', { recallMsg }))
  await ctx.plugin(stub('ntGroupApi', { muteGroupMember, kickGroupMember }))
  await ctx.plugin(stub('ntUserApi', { getUidByUin: async () => 'u_555' }))
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

describe('NTQQBot capabilities', () => {
  it('reads and recalls a message by its id alone', async () => {
    const bot = ctx.bots.get('llonebot:123456')!
    expect(await bot.getMessage!('987654', '2|987654|42')).toMatchObject({ id: '2|987654|42', content: 'echo hi' })
    await bot.deleteMessage!('987654', '2|987654|42')
    expect(recallMsg).toHaveBeenCalledWith({ chatType: NT.ChatType.Group, peerUid: '987654', msgSeq: 42 }, 42)
  })

  it('mutes and kicks group members by QQ number, and passes on why NTQQ refused', async () => {
    const bot = ctx.bots.get('llonebot:123456')!
    await bot.muteGuildMember!('987654', '555', 60_000)
    expect(muteGroupMember).toHaveBeenCalledWith(987654, [{ uid: 'u_555', duration: 60 }])
    await expect(bot.kickGuildMember!('987654', '555')).rejects.toThrow('没有权限')
    expect(kickGroupMember).toHaveBeenCalledWith(987654, ['u_555'], false)
    await expect(bot.createReaction!('private:555', '1|u_555|42', '76')).rejects.toThrow('暂不支持私聊消息回应')
  })
})
