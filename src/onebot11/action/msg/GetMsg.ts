import BaseAction from '../BaseAction'
import { OB11Message } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { MessageUnique } from '@/common/utils/messageUnique'

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
    const msgShortId = MessageUnique.getShortIdByMsgId(payload.message_id.toString())
    const msgIdWithPeer = await MessageUnique.getMsgIdAndPeerByShortId(msgShortId || +payload.message_id)
    if (!msgIdWithPeer) {
      throw new Error('消息不存在')
    }
    const peer = {
      guildId: '',
      peerUid: msgIdWithPeer.Peer.peerUid,
      chatType: msgIdWithPeer.Peer.chatType
    }
    const msg = this.adapter.getMsgCache(msgIdWithPeer.MsgId) ?? (await this.ctx.ntMsgApi.getMsgsByMsgId(peer, [msgIdWithPeer.MsgId])).msgList[0]
    const retMsg = await OB11Entities.message(this.ctx, msg)
    if (!retMsg) {
      throw new Error('消息为空')
    }
    retMsg.message_id = MessageUnique.createMsg(peer, msg.msgId)!
    retMsg.message_seq = retMsg.message_id
    retMsg.real_id = retMsg.message_id
    return retMsg
  }
}

export default GetMsg
