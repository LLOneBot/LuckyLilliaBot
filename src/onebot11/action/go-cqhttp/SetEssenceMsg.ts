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
    const info = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!info) {
      throw new Error('msg not found')
    }
    let msg = this.ctx.store.getMsgByMsgId(info.msgId)
    if (!msg) {
      const { msgList } = await this.ctx.ntMsgApi.getSingleMsg(info.peer, info.msgSeq)
      msg = msgList[0]
    }
    const res = await this.ctx.ntGroupApi.addGroupEssence(
      +info.peer.peerUid,
      info.msgSeq,
      msg.msgRandom
    )
    if (res.errorCode !== 0) {
      throw new Error(res.errorMsg)
    }
    return null
  }
}
