import { ActionName } from '../types'
import { BaseAction, Schema } from '../BaseAction'

interface Payload {
  message_id: number | string
}

class DeleteMsg extends BaseAction<Payload, null> {
  actionName = ActionName.DeleteMsg
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const msg = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msg) {
      throw new Error(`消息${payload.message_id}不存在`)
    }
    const data = await this.ctx.ntMsgApi.recallMsg(msg.peer, [msg.msgId])
    if (data.result !== 0) {
      throw new Error(data.errMsg)
    }
    return null
  }
}

export default DeleteMsg
