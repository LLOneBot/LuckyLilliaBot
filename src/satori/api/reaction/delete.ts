import { Handler } from '../index'
import { Dict } from 'cosmokit'
import { ChatType } from '@/ntqqapi/types'
import { getPeer } from '../../utils'

interface Payload {
  channel_id: string
  message_id: string
  emoji_id: string
  user_id?: string
}

export const deleteReaction: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const peer = await getPeer(ctx, payload.channel_id)
  const msg = ctx.store.getMsgByMsgId(payload.message_id)
  if (!msg) throw new Error('无法获取该消息')
  if (peer.chatType !== ChatType.Group) {
    throw new Error('暂不支持私聊消息回应')
  }
  const res = await ctx.ntMsgApi.setGroupMsgReaction(+peer.peerUid, msg.msgSeq, payload.emoji_id, false)
  if (res.errorCode !== 0) {
    throw new Error(res.errorMsg)
  }
  return {}
}
