import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  message_id: number | string
}

export class DeleteEssenceMsg extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_DeleteEssenceMsg
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const msg = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msg) {
      throw new Error('msg not found')
    }
    const res = await this.ctx.ntGroupApi.removeGroupEssence(
      msg.peer.peerUid,
      msg.msgId,
    )
    if (res.errCode !== 0) {
      throw new Error(res.errMsg)
    }
    return null
  }
}
