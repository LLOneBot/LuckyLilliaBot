import * as NT from '@/ntqqapi/types'
import { List, User } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeMessageId, decodeUser } from '../../utils'

interface Payload {
  channel_id: string
  message_id: string
  emoji_id: string
  next?: string
}

export const getReactionList: Handler<List<User>, Payload> = async (ctx, payload) => {
  const info = decodeMessageId(payload.message_id)
  if (info.chatType !== NT.ChatType.Group) {
    throw new Error('暂不支持私聊消息回应')
  }
  const data = await ctx.ntMsgApi.getMsgReactionList(info, info.msgSeq, payload.emoji_id, 15, payload.next ?? '')
  const users = await Promise.all(data.users.map(e => ctx.ntUserApi.getUserByUin(e.uin)))
  return {
    data: users.map(u => decodeUser(u)),
    next: data.cookie || undefined
  }
}
