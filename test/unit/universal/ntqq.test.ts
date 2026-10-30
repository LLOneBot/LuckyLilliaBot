import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import h from '@satorijs/element'
import { Context, Service } from 'cordis'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@luckylillia/plugin-sdk'
import * as NT from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import BotsService from '@/universal/bots'
import * as NTQQUniversal from '@/plugin/internal/service/ntqq-universal'
import { crossPlatform } from './crossPlatform'

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
let getMsgsBySeqAndCount: ReturnType<typeof vi.fn>
let muteGroupMember: ReturnType<typeof vi.fn>
let kickGroupMember: ReturnType<typeof vi.fn>

beforeEach(async () => {
  ctx = new Context()
  sendMessage = vi.fn(async () => rawMessage({ senderUin: 123456, elements: [{ textElement: { content: 'hi', atType: 0 } }] }))
  recallMsg = vi.fn(async () => ({}))
  getMsgsBySeqAndCount = vi.fn(async () => ({ msgList: [rawMessage({ msgSeq: 39 })] }))
  muteGroupMember = vi.fn(async () => ({ errorCode: 0, errorMsg: '' }))
  kickGroupMember = vi.fn(async () => ({ errorCode: 1, errorMsg: '没有权限' }))
  await ctx.plugin(BotsService)
  for (const name of ['ntFileApi', 'ntFriendApi', 'ntWebApi']) {
    await ctx.plugin(stub(name))
  }
  await ctx.plugin(stub('account', ACCOUNT))
  await ctx.plugin(stub('ntMsgApi', { recallMsg, getMsgsBySeqAndCount, getLatestMsgSeq: async () => 50 }))
  await ctx.plugin(stub('ntGroupApi', { muteGroupMember, kickGroupMember }))
  await ctx.plugin(stub('ntUserApi', { getUidByUin: async () => 'u_555' }))
  await ctx.plugin(stub('app', { sendMessage }))
  await ctx.plugin(stub('store', { getMsgBySeq: () => rawMessage() }))
  await ctx.plugin(NTQQUniversal)
})

describe('NTQQUniversal', () => {
  it('registers the logged-in account as a bot', () => {
    expect(ctx.bots.get('luckylillia:123456')).toMatchObject({ platform: 'luckylillia', selfId: '123456' })
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
      platform: 'luckylillia',
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
    const bot = ctx.bots.get('luckylillia:123456')!
    expect(await bot.sendMessage('987654', 'hi')).toEqual([])
    expect(sendMessage).not.toHaveBeenCalled()
  })
})

describe('NTQQBot capabilities', () => {
  it('reads and recalls a message by its id alone', async () => {
    const bot = ctx.bots.get('luckylillia:123456')!
    expect(await bot.getMessage!('987654', '2|987654|42')).toMatchObject({ id: '2|987654|42', content: 'echo hi' })
    await bot.deleteMessage!('987654', '2|987654|42')
    expect(recallMsg).toHaveBeenCalledWith({ chatType: NT.ChatType.Group, peerUid: '987654', msgSeq: 42 }, 42)
  })

  it('mutes and kicks group members by QQ number, and passes on why NTQQ refused', async () => {
    const bot = ctx.bots.get('luckylillia:123456')!
    await bot.muteGuildMember!('987654', '555', 60_000)
    expect(muteGroupMember).toHaveBeenCalledWith(987654, [{ uid: 'u_555', duration: 60 }])
    await expect(bot.kickGuildMember!('987654', '555')).rejects.toThrow('没有权限')
    expect(kickGroupMember).toHaveBeenCalledWith(987654, ['u_555'], false)
    await expect(bot.createReaction!('private:555', '1|u_555|42', '76')).rejects.toThrow('暂不支持私聊消息回应')
  })

  it('pages the message list by the id of the last message it gave', async () => {
    const bot = ctx.bots.get('luckylillia:123456')!
    const first = await bot.getMessageList!('987654')
    expect(getMsgsBySeqAndCount).toHaveBeenLastCalledWith({ chatType: NT.ChatType.Group, peerUid: '987654' }, 50, 50, true)
    expect(first.next).toBe('2|987654|39')
    await bot.getMessageList!('987654', first.next, undefined, 20)
    expect(getMsgsBySeqAndCount).toHaveBeenLastCalledWith({ chatType: NT.ChatType.Group, peerUid: '987654' }, 39, 20, true)
  })

  it('lists the roles by the ids members carry', async () => {
    const bot = ctx.bots.get('luckylillia:123456')!
    expect((await bot.getGuildRoleList!('987654')).data).toEqual([
      { id: '4', name: 'owner' },
      { id: '3', name: 'admin' },
      { id: '2', name: 'member' },
    ])
    await expect(bot.setGuildMemberRole!('987654', '555', '4')).rejects.toThrow('只能设置或取消管理员')
  })
})

// A picture and a file the encoder reads from disk, instead of downloading
const DIR = mkdtempSync(path.join(tmpdir(), 'llbot-ntqq-'))
const PNG = path.join(DIR, 'a.png')
const TXT = path.join(DIR, 'a.txt')
writeFileSync(PNG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))
writeFileSync(TXT, 'hello')

afterAll(() => {
  rmSync(DIR, { recursive: true, force: true })
})

/** What each message the bot sent was made of: element types and the text of its text elements. */
function sent() {
  return sendMessage.mock.calls.map(([, , elements]: [unknown, unknown, NT.SendMessageElement[]]) => ({
    types: elements.map(element => element.elementType),
    text: elements.map(element => element.elementType === NT.ElementType.Text ? element.textElement.content : '').join(''),
  }))
}

describe('what the account sends of the cross-platform elements', () => {
  const Text = NT.ElementType.Text
  const expected: Record<string, ReturnType<typeof sent>> = {
    markdown: [{ types: [Text, Text, Text, Text, Text], text: '标题\n粗体 和 链接 ( https://example.com )' }],
    buttons: [{
      types: [Text, Text, Text, Text, Text, Text],
      text: '选一个\n「签到」  每日签到（发送「/sign」）  官网 ( https://example.com )',
    }],
    card: [{ types: [Text, Text, Text, Text, NT.ElementType.Pic], text: '标题 ( https://example.com/a )\n描述\n' }],
    face: [{ types: [Text, NT.ElementType.Face], text: '好的' }],
  }

  it('says what it sends natively', () => {
    expect(ctx.bots.get('luckylillia:123456')!.features).toEqual(['message.face', 'message.forward', 'message.proactive', 'guild.plain'])
  })

  it('covers every case', () => {
    expect(Object.keys(expected).sort()).toEqual(Object.keys(crossPlatform(PNG)).sort())
  })

  for (const [name, content] of Object.entries(crossPlatform(PNG))) {
    it(name, async () => {
      await ctx.bots.get('luckylillia:123456')!.sendMessage('987654', content)
      expect(sent()).toEqual(expected[name])
    })
  }

  it('sends a file and a card as messages of their own', async () => {
    const bot = ctx.bots.get('luckylillia:123456')!
    await bot.sendMessage('987654', [h.text('看'), h.file(TXT, { title: 'notes.txt' }), h('luckylillia:ark', { data: '{"app":"x"}' })])
    expect(sent().map(message => message.types)).toEqual([[NT.ElementType.Text], [NT.ElementType.File], [NT.ElementType.Ark]])
    const [, [, , [file]], [, , [ark]]] = sendMessage.mock.calls
    expect(file.fileElement).toMatchObject({ fileName: 'notes.txt', fileSize: 5 })
    expect(ark.arkElement.bytesData).toBe('{"app":"x"}')
  })
})

describe('what plugins read of a message from an official bot', () => {
  it('gets its markdown and buttons, the line a card shows and the name of a face', async () => {
    const sessions: Session[] = []
    ctx.on('bot/message', (session) => {
      sessions.push(session)
    })
    const button = (type: number, label: string, data: string, id = '') => ({ id, label, type, data })
    await ctx.parallel('nt/message-created', {
      message: rawMessage({
        elements: [
          { faceElement: { faceIndex: 13, faceType: 1, faceText: '' } },
          { markdownElement: { content: '**hi**' } },
          { inlineKeyboardElement: { rows: [{ buttons: [button(2, '签到', '/sign'), button(0, '官网', 'https://e.com'), button(1, '投票', 'vote', '3')] }] } },
          { arkElement: { bytesData: '{"prompt":"[分享]标题","app":"com.tencent.structmsg"}' } },
        ],
      }),
    })
    await vi.waitFor(() => expect(sessions).toHaveLength(1))
    const [face, markdown, row, ark] = sessions[0].elements
    expect(face.attrs).toMatchObject({ id: '13', name: '呲牙' })
    expect(markdown.type).toBe('markdown')
    expect(markdown.children.join('')).toBe('**hi**')
    expect(row.children.map(item => [item.attrs, item.children.join('')])).toEqual([
      [{ type: 'input', text: '/sign' }, '签到'],
      [{ type: 'link', href: 'https://e.com' }, '官网'],
      [{ type: 'action', id: '3', data: 'vote' }, '投票'],
    ])
    expect(ark.type).toBe('luckylillia:ark')
    expect(ark.children.join('')).toBe('[分享]标题')
  })
})
