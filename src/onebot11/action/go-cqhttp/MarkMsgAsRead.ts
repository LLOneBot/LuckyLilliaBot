import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  message_id: number | string
}

export class MarkMsgAsRead extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_MarkMsgAsRead
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const info = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!info) {
      throw new Error('msg not found')
    }
    await this.ctx.ntMsgApi.setMsgRead(info.peer, info.msgSeq)
    return null
  }
}
