import { Handler } from '../index'
import { Dict } from 'cosmokit'
import { getPeer } from '../../utils'

interface Payload {
  channel_id: string
  message_id: string
  emoji: string
  user_id?: string
}

export const deleteReaction: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const peer = await getPeer(ctx, payload.channel_id)
  const { msgList } = await ctx.ntMsgApi.getMsgsByMsgId(peer, [payload.message_id])
  if (!msgList.length || !msgList[0].msgSeq) {
    throw new Error('无法获取该消息')
  }
  await ctx.ntMsgApi.setEmojiLike(peer, msgList[0].msgSeq, payload.emoji, false)
  return {}
}
