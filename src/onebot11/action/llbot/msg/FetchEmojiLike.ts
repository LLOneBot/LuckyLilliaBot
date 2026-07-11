import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { Dict } from 'cosmokit'

interface Payload {
  message_id: string | number
  emoji_id?: string | number
  emojiId?: string | number
  count: string | number
  cookie?: string
}

export class FetchEmojiLike extends BaseAction<Payload, Dict> {
  actionName = ActionName.FetchEmojiLike
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required(),
    emoji_id: Schema.union([Number, String]),
    emojiId: Schema.union([Number, String]),
    count: Schema.union([Number, String]).default(20),
    cookie: Schema.string()
  })

  async _handle(payload: Payload) {
    const msgInfo = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msgInfo) throw new Error('消息不存在')
    const emojiId = payload.emoji_id ?? payload.emojiId
    if (!emojiId) throw new Error('未指定表情 ID')
    const result = await this.ctx.ntMsgApi.getMsgReactionList(
      msgInfo.peer,
      msgInfo.msgSeq,
      emojiId.toString(),
      +payload.count,
      payload.cookie ?? ''
    )
    const emojiLikesList = result.users.map(u => ({
      tinyId: u.uin.toString(),
      nickName: '',
      headUrl: `https://q1.qlogo.cn/g?b=qq&nk=${u.uin}&s=640`,
    }))
    return {
      emojiLikesList,
      cookie: result.cookie,
      isLastPage: result.isLastPage,
      isFirstPage: result.isFirstPage,
    }
  }
}
