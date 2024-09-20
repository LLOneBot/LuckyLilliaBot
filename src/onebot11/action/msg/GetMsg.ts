import { BaseAction } from '../BaseAction'
import { OB11Message } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'

export interface PayloadType {
  message_id: number | string
}

export type ReturnDataType = OB11Message

class GetMsg extends BaseAction<PayloadType, OB11Message> {
  actionName = ActionName.GetMsg

  protected async _handle(payload: PayloadType) {
    if (!payload.message_id) {
      throw new Error('参数message_id不能为空')
    }
    const msgInfo = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msgInfo) {
      throw new Error('消息不存在')
    }
    const peer = {
      guildId: '',
      peerUid: msgInfo.peer.peerUid,
      chatType: msgInfo.peer.chatType
    }
    const msg = this.adapter.getMsgCache(msgInfo.msgId) ?? (await this.ctx.ntMsgApi.getMsgsByMsgId(peer, [msgInfo.msgId])).msgList[0]
    const retMsg = await OB11Entities.message(this.ctx, msg)
    if (!retMsg) {
      throw new Error('消息为空')
    }
    retMsg.message_id = this.ctx.store.createMsgShortId(peer, msg.msgId)
    retMsg.message_seq = retMsg.message_id
    retMsg.real_id = retMsg.message_id
    return retMsg
  }
}

export default GetMsg
