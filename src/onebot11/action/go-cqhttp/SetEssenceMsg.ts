import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { MessageUnique } from '@/common/utils/messageUnique'

interface Payload {
  message_id: number | string
}

export default class GoCQHTTPSetEssenceMsg extends BaseAction<Payload, any> {
  actionName = ActionName.GoCQHTTP_SetEssenceMsg;

  protected async _handle(payload: Payload): Promise<any> {
    if (!payload.message_id) {
      throw Error('message_id不能为空')
    }
    const msg = await MessageUnique.getMsgIdAndPeerByShortId(+payload.message_id)
    if (!msg) {
      throw new Error('msg not found')
    }
    return await this.ctx.ntGroupApi.addGroupEssence(
      msg.Peer.peerUid,
      msg.MsgId
    )
  }
}
