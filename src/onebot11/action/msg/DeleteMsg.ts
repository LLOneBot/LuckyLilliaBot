import { ActionName } from '../types'
import BaseAction from '../BaseAction'
import { MessageUnique } from '@/common/utils/messageUnique'

interface Payload {
  message_id: number | string
}

class DeleteMsg extends BaseAction<Payload, void> {
  actionName = ActionName.DeleteMsg

  protected async _handle(payload: Payload) {
    if (!payload.message_id) {
      throw Error('message_id不能为空')
    }
    const msg = await MessageUnique.getMsgIdAndPeerByShortId(+payload.message_id)
    if (!msg) {
      throw `消息${payload.message_id}不存在`
    }
    await this.ctx.ntMsgApi.recallMsg(msg.Peer, [msg.MsgId])
  }
}

export default DeleteMsg
