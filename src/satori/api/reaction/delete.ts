import { Handler } from '../index'
import { Dict } from 'cosmokit'
import { getPeer } from '../../utils'

interface Payload {
  channel_id: string
  message_id: string
  emoji_id: string
  user_id?: string
}

export const deleteReaction: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const peer = await getPeer(ctx, payload.channel_id)
  const { msgList } = await ctx.ntMsgApi.getMsgsByMsgId(peer, [payload.message_id])
  if (!msgList.length) {
    throw new Error('无法获取该消息')
  }
  const res = await ctx.ntMsgApi.setEmojiLike(peer, msgList[0].msgSeq, payload.emoji_id, false)
  if (res.result !== 0) {
    throw new Error(res.errMsg)
  }
  return {}
}
