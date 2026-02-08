import { List, User } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeUser, getPeer } from '../../utils'
import { filterNullable } from '@/common/utils/misc'

interface Payload {
  channel_id: string
  message_id: string
  emoji: string
  next?: string
}

export const getReactionList: Handler<List<User>, Payload> = async (ctx, payload) => {
  const peer = await getPeer(ctx, payload.channel_id)
  const { msgList } = await ctx.ntMsgApi.getMsgsByMsgId(peer, [payload.message_id])
  if (!msgList.length) {
    throw new Error('无法获取该消息')
  }
  const count = msgList[0].emojiLikesList.find(e => e.emojiId === payload.emoji)?.likesCnt ?? '50'
  const data = await ctx.ntMsgApi.getMsgEmojiLikesList(peer, msgList[0].msgSeq, payload.emoji, +count)
  if (data.result !== 0) {
    throw new Error(data.errMsg)
  }
  const uids = await Promise.all(data.emojiLikesList.map(e => ctx.ntUserApi.getUidByUin(e.tinyId, peer.chatType === 2 ? peer.peerUid : undefined)))
  const raw = await ctx.ntUserApi.getCoreAndBaseInfo(filterNullable(uids))
  return {
    data: raw.values().map(e => decodeUser(e.coreInfo)).toArray()
  }
}
