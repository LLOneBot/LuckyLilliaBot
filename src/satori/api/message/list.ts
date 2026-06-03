import { Direction, Message, Order, BidiList } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeMessage, encodeMessageId, getPeer } from '../../utils'
import { RawMessage } from '@/ntqqapi/types'
import { filterNullable } from '@/common/utils/misc'

interface Payload {
  channel_id: string
  next?: string
  direction?: Direction
  limit?: number
  order?: Order
}

export const getMessageList: Handler<BidiList<Message>, Payload> = async (ctx, payload) => {
  const count = payload.limit ?? 50
  const peer = await getPeer(ctx, payload.channel_id)
  const latestSeq = await ctx.ntMsgApi.getLatestMsgSeq(peer)
  let msgList: RawMessage[]
  if (!payload.next) {
    msgList = (await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, latestSeq, count, false)).msgList
  } else {
    msgList = (await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, +payload.next, count, true)).msgList
  }
  const data = filterNullable(await Promise.all(msgList.map(e => decodeMessage(ctx, e))))
  if (payload.order === 'desc') data.reverse()
  const finallyMsg = msgList.at(-1)
  return {
    data,
    next: finallyMsg ? encodeMessageId(
      finallyMsg.chatType,
      finallyMsg.peerUid,
      finallyMsg.msgSeq
    ) : undefined
  }
}
