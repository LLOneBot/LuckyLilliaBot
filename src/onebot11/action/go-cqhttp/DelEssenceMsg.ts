import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  message_id: number | string
}

export class DelEssenceMsg extends BaseAction<Payload, unknown> {
  actionName = ActionName.GoCQHTTP_DelEssenceMsg
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const msg = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msg) {
      throw new Error('msg not found')
    }
    return await this.ctx.ntGroupApi.removeGroupEssence(
      msg.peer.peerUid,
      msg.msgId,
    )
  }
}
