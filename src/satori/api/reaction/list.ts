import { List, User } from '@satorijs/protocol'
import { Handler } from '../index'
import { ChatType } from '@/ntqqapi/types'
import { decodeUser, getPeer } from '../../utils'
import { filterNullable } from '@/common/utils/misc'

interface Payload {
  channel_id: string
  message_id: string
  emoji_id: string
  next?: string
}

export const getReactionList: Handler<List<User>, Payload> = async (ctx, payload) => {
  const peer = await getPeer(ctx, payload.channel_id)
  const msg = ctx.store.getMsgByMsgId(payload.message_id)
  if (!msg) throw new Error('无法获取该消息')
  if (peer.chatType !== ChatType.Group) {
    throw new Error('暂不支持私聊消息回应列表')
  }
  // FetchEmojiLikesResp.users 只有 uin；要拿 user 卡片必须先 uin -> uid -> NT.User
  const data = await ctx.ntMsgApi.getMsgReactionList(peer, msg.msgSeq, payload.emoji_id, 50)
  const uids = filterNullable(
    await Promise.all(data.users.map(u => ctx.ntUserApi.getUidByUin(u.uin, +peer.peerUid)))
  )
  const users = await Promise.all(uids.map(uid => ctx.ntUserApi.getUserByUid(uid)))
  return {
    data: filterNullable(users).map(u => decodeUser(u))
  }
}
