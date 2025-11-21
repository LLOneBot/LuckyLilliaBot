import { ActionName } from '../../types'
import { BaseAction, Schema } from '../../BaseAction'

interface Payload {
  message_id: number | string
  emoji_id: number | string
}

export class SetMsgEmojiLike extends BaseAction<Payload, unknown> {
  actionName = ActionName.SetMsgEmojiLike
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required(),
    emoji_id: Schema.union([Number, String]).required()
  })
  set: boolean = true

  protected async _handle(payload: Payload) {
    const msg = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msg) {
      throw new Error('msg not found')
    }
    const msgData = (await this.ctx.ntMsgApi.getMsgsByMsgId(msg.peer, [msg.msgId])).msgList
    if (!msgData || msgData.length == 0 || !msgData[0].msgSeq) {
      throw new Error('find msg by msgid error')
    }
    return await this.ctx.ntMsgApi.setEmojiLike(
      msg.peer,
      msgData[0].msgSeq,
      payload.emoji_id.toString(),
      this.set
    )
  }
}

export class UnSetMsgEmojiLike extends SetMsgEmojiLike {
  actionName = ActionName.UnSetMsgEmojiLike
  set = false
}
