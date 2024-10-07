import { Handler } from '../index'
import { Dict } from 'cosmokit'
import { getPeer } from '../../utils'

interface Payload {
  channel_id: string
  message_id: string
}

export const deleteMessage: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const peer = await getPeer(ctx, payload.channel_id)
  const data = await ctx.ntMsgApi.recallMsg(peer, [payload.message_id])
  if (data.result !== 0) {
    ctx.logger.error('message.delete', payload.message_id, data)
    throw new Error(`消息撤回失败`)
  }
  return {}
}
