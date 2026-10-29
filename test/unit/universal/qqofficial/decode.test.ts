import { Channel } from '@satorijs/protocol'
import { describe, expect, it } from 'vitest'
import { decodeDispatch, DecodeHost } from '@/plugin/internal/protocol/qq-official/decode'
import { PassiveReplies } from '@/plugin/internal/protocol/qq-official/passive'
import type { GatewayPayload, UserMessage } from '@/plugin/internal/protocol/qq-official/types'

function host(): DecodeHost {
  return {
    selfId: 'APPID',
    passive: new PassiveReplies(),
    event: (type, data) => ({ type, ...data }) as ReturnType<DecodeHost['event']>,
  }
}

// Recent, so the passive window is still open
const SENT = new Date(Date.now() - 1000).toISOString()

function groupMessage(overrides: Partial<UserMessage> = {}): UserMessage {
  return {
    id: 'ROBOT1.0_m1',
    author: { id: 'U1', member_openid: 'U1', username: 'Alice', member_role: 'admin' },
    content: ' echo hi',
    timestamp: SENT,
    group_openid: 'G1',
    message_type: 0,
    message_scene: { source: 'default', ext: ['msg_idx=REFIDX_m1', 'auth_token=x'] },
    ...overrides,
  }
}

const dispatch = (t: string, d: unknown, id?: string): GatewayPayload => ({ op: 0, s: 1, t, d, id })

describe('decodeDispatch', () => {
  it('puts the stripped mention of the bot back in front of a group @ message', () => {
    const bot = host()
    const event = decodeDispatch(bot, dispatch('GROUP_AT_MESSAGE_CREATE', groupMessage()))
    expect(event).toMatchObject({
      type: 'message-created',
      message: { id: 'ROBOT1.0_m1', content: '<at id="APPID"/> echo hi', created_at: Date.parse(SENT) },
      user: { id: 'U1', name: 'Alice', avatar: 'https://q.qlogo.cn/qqapp/APPID/U1/640' },
      member: { nick: 'Alice', roles: [{ id: 'admin', name: 'admin' }] },
      channel: { id: 'G1', type: Channel.Type.TEXT },
      guild: { id: 'G1' },
    })
    // Remembered for passive replies and quotes
    expect(bot.passive.pick('G1')?.id).toBe('ROBOT1.0_m1')
    expect(bot.passive.refOf('ROBOT1.0_m1')).toBe('REFIDX_m1')
  })

  it('drops a message the platform pushes twice', () => {
    const bot = host()
    expect(decodeDispatch(bot, dispatch('GROUP_AT_MESSAGE_CREATE', groupMessage()))).toBeDefined()
    expect(decodeDispatch(bot, dispatch('GROUP_AT_MESSAGE_CREATE', groupMessage()))).toBeUndefined()
  })

  it('turns the mentions of a full group message into at elements, the bot into its AppID', () => {
    const bot = host()
    const event = decodeDispatch(bot, dispatch('GROUP_MESSAGE_CREATE', groupMessage({
      content: '<@BOT> hi <@U2> <@all> <@NOBODY>',
      mentions: [
        { id: 'BOT', member_openid: 'BOT', is_you: true, bot: true },
        { id: 'U2', member_openid: 'U2', username: 'Bob' },
        { scope: 'all' },
      ],
    })))
    expect(event?.message?.content).toBe('<at id="APPID"/> hi <at id="U2" name="Bob"/> <at type="all"/> &lt;@NOBODY&gt;')
    expect(bot.botOpenid).toBe('BOT')

    // Later messages name the bot without flagging it
    const next = decodeDispatch(bot, dispatch('GROUP_MESSAGE_CREATE', groupMessage({ id: 'ROBOT1.0_m2', content: '<@BOT> again' })))
    expect(next?.message?.content).toBe('<at id="APPID"/> again')
  })

  it('decodes attachments into media elements', () => {
    const event = decodeDispatch(host(), dispatch('C2C_MESSAGE_CREATE', {
      id: 'ROBOT1.0_c1',
      author: { id: 'U3', user_openid: 'U3' },
      content: ' ',
      timestamp: SENT,
      attachments: [
        { content_type: 'image/png', url: 'multimedia.nt.qq.com.cn/a.png', width: 10, height: 20 },
        { content_type: 'voice', url: 'https://x/v.silk', voice_wav_url: 'https://x/v.wav' },
        { content_type: 'video/mp4', url: 'https://x/v.mp4' },
        { content_type: 'file', url: 'https://x/f', filename: 'a.txt' },
      ],
    }))
    expect(event).toMatchObject({
      channel: { id: 'private:U3', type: Channel.Type.DIRECT },
      user: { id: 'U3' },
    })
    expect(event?.guild).toBeUndefined()
    expect(event?.message?.content).toBe(
      '<img width="10" height="20" src="https://multimedia.nt.qq.com.cn/a.png"/>'
      + '<audio src="https://x/v.wav"/><video src="https://x/v.mp4"/><file title="a.txt" src="https://x/f"/>',
    )
  })

  it('decodes a quote, citing the quoted message by id once it is known', () => {
    const bot = host()
    decodeDispatch(bot, dispatch('GROUP_AT_MESSAGE_CREATE', groupMessage()))
    const event = decodeDispatch(bot, dispatch('GROUP_AT_MESSAGE_CREATE', groupMessage({
      id: 'ROBOT1.0_m2',
      content: ' yes',
      message_type: 103,
      message_scene: { ext: ['msg_idx=REFIDX_m2', 'ref_msg_idx=REFIDX_m1'] },
      msg_elements: [{ content: '=== 消息 1 ===\n[消息内容] echo hi\n[消息类型] 文本' }],
    })))
    expect(event?.message?.content).toBe('<quote id="ROBOT1.0_m1">echo hi</quote><at id="APPID"/> yes')
  })

  it('maps group and friend events, remembering their event ids for a passive reply', () => {
    const bot = host()
    const added = decodeDispatch(bot, dispatch('GROUP_ADD_ROBOT', { timestamp: Date.now() / 1000, group_openid: 'G2', op_member_openid: 'U1' }, 'EV1'))
    expect(added).toMatchObject({ type: 'guild-added', guild: { id: 'G2' }, operator: { id: 'U1' } })
    expect(bot.passive.claim(bot.passive.pick('G2')!)).toEqual({ event_id: 'EV1', msg_seq: 1 })

    const friend = decodeDispatch(bot, dispatch('FRIEND_ADD', { timestamp: Date.now() / 1000, openid: 'U4' }, 'EV2'))
    expect(friend).toMatchObject({ type: 'friend-added', user: { id: 'U4' }, channel: { id: 'private:U4' } })
    expect(bot.passive.pick('private:U4')?.id).toBe('EV2')

    expect(decodeDispatch(bot, dispatch('GROUP_DEL_ROBOT', { timestamp: 0, group_openid: 'G2' }))).toMatchObject({ type: 'guild-removed' })
  })

  it('maps a button click', () => {
    const bot = host()
    const event = decodeDispatch(bot, dispatch('INTERACTION_CREATE', {
      id: 'I1',
      chat_type: 1,
      group_openid: 'G1',
      group_member_openid: 'U1',
      data: { resolved: { button_id: 'b1', button_data: 'go' } },
    }, 'EV3'))
    expect(event).toMatchObject({
      type: 'interaction/button',
      button: { id: 'b1', data: 'go' },
      user: { id: 'U1' },
      channel: { id: 'G1' },
      guild: { id: 'G1' },
    })
    expect(bot.passive.pick('G1')?.id).toBe('EV3')
  })

  it('ignores events it does not handle', () => {
    expect(decodeDispatch(host(), dispatch('GUILD_CREATE', {}))).toBeUndefined()
  })
})
