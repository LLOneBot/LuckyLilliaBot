import { Message } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeMessage, getPeer } from '../../utils'

interface Payload {
  channel_id: string
  message_id: string
}

export const getMessage: Handler<Message, Payload> = async (ctx, payload) => {
  const peer = await getPeer(ctx, payload.channel_id)
  // 直连模式没有 ntMsgApi.getMsgsByMsgId（按 msgId 索引消息）这个 API。
  // store 里通常会有刚发的消息缓存（msgId → RawMessage）；如果没缓存：
  //   - 数字 message_id 当 shortId 处理：先 store.getMsgInfoByShortId 拿 msgSeq，再 ntMsgApi.getSingleMsg
  //   - 原始 msgId 拿不到时只能放弃
  let raw = ctx.store.getMsgByMsgId(payload.message_id)
  if (!raw) {
    const asShortId = Number(payload.message_id)
    if (Number.isInteger(asShortId)) {
      const info = await ctx.store.getMsgInfoByShortId(asShortId)
      if (info) {
        const cached = ctx.store.getMsgByMsgId(info.msgId)
        if (cached) {
          raw = cached
        } else {
          const { msgList } = await ctx.ntMsgApi.getSingleMsg(peer, info.msgSeq)
          raw = msgList[0]
        }
      }
    }
  }
  if (!raw) throw new Error('消息为空')
  const result = await decodeMessage(ctx, raw)
  if (!result) {
    throw new Error('消息为空')
  }
  return result
}
