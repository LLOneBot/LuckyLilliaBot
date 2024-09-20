import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  message_id: number | string
}

export class SetEssenceMsg extends BaseAction<Payload, unknown> {
  actionName = ActionName.GoCQHTTP_SetEssenceMsg

  protected async _handle(payload: Payload) {
    if (!payload.message_id) {
      throw Error('message_id不能为空')
    }
    const msg = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msg) {
      throw new Error('msg not found')
    }
    return await this.ctx.ntGroupApi.addGroupEssence(
      msg.peer.peerUid,
      msg.msgId
    )
  }
}
