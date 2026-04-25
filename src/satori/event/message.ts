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
  const revokeElement = input.elements[0].grayTipElement!.revokeElement!
  let operator
  if (revokeElement.operatorUid === revokeElement.origMsgSenderUid) {
    operator = message.user!
  } else {
    operator = decodeUser((await bot.ctx.ntUserApi.getUserSimpleInfo(revokeElement.operatorUid)).coreInfo)
  }

  return bot.event('message-deleted', {
    message: omit(message, ['member', 'user', 'channel', 'guild']),
    member: message.member,
    user: message.user,
    channel: message.channel,
    guild: message.guild,
    operator: omit(operator, ['is_bot'])
  })
}
