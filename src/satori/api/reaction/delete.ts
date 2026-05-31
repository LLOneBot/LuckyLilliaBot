import { Handler } from '../index'
import { Dict } from 'cosmokit'
import { getPeer } from '../../utils'
import { resolveStoredMsg } from './_resolve'

interface Payload {
  channel_id: string
  message_id: string
  emoji_id: string
  user_id?: string
}

export const deleteReaction: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const peer = await getPeer(ctx, payload.channel_id)
  const msg = await resolveStoredMsg(ctx, payload.message_id)
  if (!msg) throw new Error('无法获取该消息')
  const res = await ctx.ntMsgApi.setEmojiLike(peer, msg.msgSeq, payload.emoji_id, false)
  if (res.errorCode !== 0) {
    throw new Error(res.errorMsg)
  }
  return {}
}
