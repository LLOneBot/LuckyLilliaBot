import { Message } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeMessage, getPeer } from '../../utils'

interface Payload {
  channel_id: string
  message_id: string
}

export const getMessage: Handler<Message, Payload> = async (ctx, payload) => {
  const peer = await getPeer(ctx, payload.channel_id)
  const raw = ctx.store.getMsgCache(payload.message_id) ?? (await ctx.ntMsgApi.getMsgsByMsgId(peer, [payload.message_id])).msgList[0]
  const result = await decodeMessage(ctx, raw)
  if (!result) {
    throw new Error('消息为空')
  }
  return result
}
