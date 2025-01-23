import { Direction, Message, Order, BidiList } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeMessage, getPeer } from '../../utils'
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
  let msgList: RawMessage[]
  if (!payload.next) {
    msgList = (await ctx.ntMsgApi.getAioFirstViewLatestMsgs(peer, count)).msgList
  } else {
    msgList = (await ctx.ntMsgApi.getMsgHistory(peer, payload.next, count)).msgList
  }
  const data = filterNullable(await Promise.all(msgList.map(e => decodeMessage(ctx, e))))
  if (payload.order === 'desc') data.reverse()
  return {
    data,
    next: msgList.at(-1)?.msgId
  }
}
