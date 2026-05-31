import { Handler } from '../index'
import { Dict } from 'cosmokit'
import { getPeer } from '../../utils'

interface Payload {
  channel_id: string
  message_id: string
}

export const deleteMessage: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const peer = await getPeer(ctx, payload.channel_id)
  // 新签名：recallMsg(peer, msgSeq, clientSeq?, msgRandom?, msgTime?)
  // 走 store 拿 msgSeq / clientSeq / msgRandom / msgTime 全套。
  const msg = ctx.store.getMsgByMsgId(payload.message_id)
  if (!msg) throw new Error('找不到要撤回的消息')
  await ctx.ntMsgApi.recallMsg(peer, msg.msgSeq, msg.clientSeq, msg.msgRandom, +msg.msgTime)
  return {}
}
