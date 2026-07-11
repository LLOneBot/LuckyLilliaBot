import { Message } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeMessage, decodeMessageId } from '../../utils'

interface Payload {
  channel_id: string
  message_id: string
}

export const getMessage: Handler<Message, Payload> = async (ctx, payload) => {
  const info = decodeMessageId(payload.message_id)
  let msg = ctx.store.getMsgBySeq(info.peerUid, info.msgSeq)
  if (!msg) {
    const { msgList } = await ctx.ntMsgApi.getSingleMsg(info, info.msgSeq)
    msg = msgList[0]
  }
  if (!msg) throw new Error('获取不到消息')
  const result = await decodeMessage(ctx, msg)
  if (!result) {
    throw new Error('消息为空')
  }
  return result
}
