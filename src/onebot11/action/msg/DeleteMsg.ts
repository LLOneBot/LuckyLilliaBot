import { ActionName } from '../types'
import { BaseAction, Schema } from '../BaseAction'
import { ChatType } from '@/ntqqapi/types'

interface Payload {
  message_id: number | string
}

class DeleteMsg extends BaseAction<Payload, null> {
  actionName = ActionName.DeleteMsg
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const info = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!info) {
      throw new Error(`消息${payload.message_id}不存在`)
    }
    if (info.peer.chatType === ChatType.Group) {
      await this.ctx.ntMsgApi.recallMsg(info.peer, info.msgSeq)
    } else {
      let msg = this.ctx.store.getMsgBySeq(info.peer.peerUid, info.msgSeq)
      if (!msg) {
        const { msgList } = await this.ctx.ntMsgApi.getSingleMsg(info.peer, info.msgSeq)
        msg = msgList[0]
      }
      await this.ctx.ntMsgApi.recallMsg(info.peer, msg.msgSeq, msg.clientSeq, msg.msgRandom, +msg.msgTime)
    }
    return null
  }
}

export default DeleteMsg
