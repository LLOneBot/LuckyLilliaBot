import * as NT from '@/ntqqapi/types'
import { Handler } from '../index'
import { Dict } from 'cosmokit'
import { decodeMessageId } from '../../utils'

interface Payload {
  channel_id: string
  message_id: string
  emoji_id: string
  user_id?: string
}

export const deleteReaction: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const info = decodeMessageId(payload.message_id)
  if (info.chatType !== NT.ChatType.Group) {
    throw new Error('暂不支持私聊消息回应')
  }
  const result = await ctx.ntMsgApi.setGroupMsgReaction(
    +info.peerUid,
    info.msgSeq,
    payload.emoji_id,
    false
  )
  if (result.errorCode !== 0) {
    throw new Error(result.errorMsg)
  }
  return {}
}
