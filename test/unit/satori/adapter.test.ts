import { Context, Service } from 'cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as NT from '@/ntqqapi/types'
import BotsService from '@/universal/bots'
import * as NTQQUniversal from '@/universal/ntqq'
import SatoriAdapter from '@/satori/adapter'

function stub(name: string, methods: Record<string, unknown> = {}) {
  return class extends Service {
    constructor(ctx: Context) {
      super(ctx, name)
      Object.assign(this, methods)
    }
  }
}

// selfInfo.uin is 123456 in test/unit/setup.ts
function rawMessage(senderUin: number, content: string) {
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
    elements: [{ textElement: { content, atType: NT.AtType.Unknown } }],
  } as unknown as NT.RawMessage
}

let ctx: Context
let dispatched: Record<string, any>[]

beforeEach(async () => {
  ctx = new Context()
  dispatched = []
  await ctx.plugin(BotsService)
  for (const name of ['account', 'ntMsgApi', 'ntFileApi', 'ntFriendApi', 'ntGroupApi', 'ntUserApi', 'ntWebApi', 'app']) {
    await ctx.plugin(stub(name))
  }
  await ctx.plugin(stub('store', { getMsgBySeq: () => undefined }))
  await ctx.plugin(NTQQUniversal)
  await ctx.plugin(SatoriAdapter, { enable: false, host: '127.0.0.1', port: 0, token: '' })
  const satori = ctx.satori as unknown as { server: { dispatch: (body: unknown) => void }; listenEvent: () => void }
  vi.spyOn(satori.server, 'dispatch').mockImplementation(body => {
    dispatched.push(body as Record<string, any>)
  })
  satori.listenEvent()
})

describe('SatoriAdapter on the neutral layer', () => {
  it('sends the same envelope the adapter used to build itself', async () => {
    await ctx.parallel('nt/message-created', { message: rawMessage(555, 'hi') })
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
      message: { id: '2|987654|42', content: 'hi', created_at: 1700000000000 },
      user: { id: '555', name: 'Alice', is_bot: false },
      channel: { id: '987654', type: 0, name: 'Test Group' },
      guild: { id: '987654' },
    })
    // non-login events carry only sn, user and platform of the login
    expect(Object.keys(event.login).sort()).toEqual(['platform', 'sn', 'user'])
  })

  it('keeps seeing messages that plugin middleware swallows, and the bot\'s own', async () => {
    ctx.on('bot/message', () => {}, { prepend: true })
    await ctx.parallel('nt/message-created', { message: rawMessage(555, 'from someone') })
    await ctx.parallel('nt/message-created', { message: rawMessage(123456, 'from the bot') })
    await vi.waitFor(() => expect(dispatched).toHaveLength(2))
    expect(dispatched.map(event => [event.sn, event.message.content])).toEqual([[1, 'from someone'], [2, 'from the bot']])
  })
})
