import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { Dict } from 'cosmokit'

interface Payload {
  emoji_id: string
  message_id: string | number
  count: string | number
}

export class FetchEmojiLike extends BaseAction<Payload, Dict> {
  actionName = ActionName.FetchEmojiLike
  payloadSchema = Schema.object({
    emoji_id: Schema.string().required(),
    message_id: Schema.union([Number, String]).required(),
    count: Schema.union([Number, String]).default(20)
  })

  async _handle(payload: Payload) {
    const msgInfo = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msgInfo) throw new Error('消息不存在')
    const result = await this.ctx.ntMsgApi.getMsgReactionList(
      msgInfo.peer,
      msgInfo.msgSeq,
      payload.emoji_id,
      +payload.count
    )
    const emojiLikesList = await Promise.all(result.users.map(async (u) => ({
      uid: await this.ctx.ntUserApi.getUidByUin(u.uin, +msgInfo.peer.peerUid),
      uin: u.uin.toString(),
      nickName: '',
      headUrl: `https://q1.qlogo.cn/g?b=qq&nk=${u.uin}&s=640`,
    })))
    return {
      emojiLikesList,
      cookie: '',
      isLastPage: !result.hasMore,
      isFirstPage: true,
    }
  }
}
