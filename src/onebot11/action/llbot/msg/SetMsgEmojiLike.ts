import { ActionName } from '../../types'
import { BaseAction, Schema } from '../../BaseAction'
import { ChatType } from '@/ntqqapi/types'
import { parseBool } from '@/common/utils'

interface Payload {
  message_id: number | string
  emoji_id: number | string
  set: boolean
}

export class SetMsgEmojiLike extends BaseAction<Payload, null> {
  actionName = ActionName.SetMsgEmojiLike
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required(),
    emoji_id: Schema.union([Number, String]).required(),
    set: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(true)
  })
  set?: boolean

  protected async _handle(payload: Payload) {
    const msg = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msg) {
      throw new Error('msg not found')
    }
    if (msg.peer.chatType !== ChatType.Group) {
      throw new Error('只支持群聊消息')
    }
    const res = await this.ctx.ntMsgApi.setGroupMsgReaction(
      +msg.peer.peerUid,
      msg.msgSeq,
      payload.emoji_id.toString(),
      this.set ?? payload.set
    )
    if (res.errorCode !== 0) {
      throw new Error(res.errorMsg)
    }
    return null
  }
}

export class UnSetMsgEmojiLike extends SetMsgEmojiLike {
  actionName = ActionName.UnSetMsgEmojiLike
  set = false
}
