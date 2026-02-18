import { Handler } from '../index'
import { Dict } from 'cosmokit'
import { getPeer } from '../../utils'

interface Payload {
  channel_id: string
  message_id: string
}

export const deleteMessage: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const peer = await getPeer(ctx, payload.channel_id)
  const res = await ctx.ntMsgApi.recallMsg(peer, [payload.message_id])
  if (res.result !== 0) {
    throw new Error(res.errMsg)
  }
  return {}
}
