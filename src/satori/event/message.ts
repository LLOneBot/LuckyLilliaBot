import SatoriAdapter from '../adapter'
import { RawMessage } from '@/ntqqapi/types'
import { decodeMessage, decodeUser } from '../utils'
import { omit } from 'cosmokit'

export async function parseMessageCreated(bot: SatoriAdapter, input: RawMessage) {
  const message = await decodeMessage(bot.ctx, input)
  if (!message) return

  return bot.event('message-created', {
    message: omit(message, ['member', 'user', 'channel', 'guild']),
    member: message.member,
    user: message.user,
    channel: message.channel,
    guild: message.guild
  })
}

export async function parseMessageDeleted(bot: SatoriAdapter, input: RawMessage) {
  const origin = bot.ctx.store.getMsgCache(input.msgId)
  if (!origin) return
  const message = await decodeMessage(bot.ctx, origin)
  if (!message) return
  const operatorUid = input.elements[0].grayTipElement!.revokeElement!.operatorUid
  const user = await bot.ctx.ntUserApi.getUserSimpleInfo(operatorUid)

  return bot.event('message-deleted', {
    message: omit(message, ['member', 'user', 'channel', 'guild']),
    member: message.member,
    user: message.user,
    channel: message.channel,
    guild: message.guild,
    operator: omit(decodeUser(user.coreInfo), ['is_bot'])
  })
}
