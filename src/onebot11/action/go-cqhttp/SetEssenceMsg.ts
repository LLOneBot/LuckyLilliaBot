import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  message_id: number | string
}

export class SetEssenceMsg extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_SetEssenceMsg
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const msg = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msg) {
      throw new Error('msg not found')
    }
    await this.ctx.ntGroupApi.addGroupEssence(msg.peer.peerUid, msg.msgId)
    return null
  }
}
