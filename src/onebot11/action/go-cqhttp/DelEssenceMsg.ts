import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { MessageUnique } from '@/common/utils/messageUnique'

interface Payload {
  message_id: number | string
}

export class DelEssenceMsg extends BaseAction<Payload, unknown> {
  actionName = ActionName.GoCQHTTP_DelEssenceMsg
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const msg = await MessageUnique.getMsgIdAndPeerByShortId(+payload.message_id)
    if (!msg) {
      throw new Error('msg not found')
    }
    return await this.ctx.ntGroupApi.removeGroupEssence(
      msg.Peer.peerUid,
      msg.MsgId,
    )
  }
}
