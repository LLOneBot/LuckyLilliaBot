import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { MessageUnique } from '@/common/utils/messageUnique'

interface Payload {
  message_id: number | string
}

export class MarkMsgAsRead extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_MarkMsgAsRead

  protected async _handle(payload: Payload) {
    if (!payload.message_id) {
      throw new Error('参数 message_id 不能为空')
    }
    const msg = await MessageUnique.getMsgIdAndPeerByShortId(+payload.message_id)
    if (!msg) {
      throw new Error('msg not found')
    }
    await this.ctx.ntMsgApi.setMsgRead(msg.Peer)
    return null
  }
}
