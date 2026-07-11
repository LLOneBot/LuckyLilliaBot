import * as NT from '@/ntqqapi/types'
import { Handler } from '../index'
import { Dict } from 'cosmokit'
import { decodeMessageId } from '../../utils'

interface Payload {
  channel_id: string
  message_id: string
}

export const deleteMessage: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const info = decodeMessageId(payload.message_id)
  if (info.chatType === NT.ChatType.Group) {
    await ctx.ntMsgApi.recallMsg(info, info.msgSeq)
  } else {
    let msg = ctx.store.getMsgBySeq(info.peerUid, info.msgSeq)
    if (!msg) {
      const { msgList } = await ctx.ntMsgApi.getSingleMsg(info, info.msgSeq)
      msg = msgList[0]
    }
    await ctx.ntMsgApi.recallMsg(info, msg.msgSeq, msg.clientSeq, msg.msgRandom, msg.msgTime)
  }
  return {}
}
