import { OB11Message } from '../../types'
import { OB11Constructor } from '../../constructor'
import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { NTQQMsgApi } from '@/ntqqapi/api'
import { MessageUnique } from '@/common/utils/MessageUnique'
import { getMsgCache } from '@/common/data'

export interface PayloadType {
  message_id: number | string
}

export type ReturnDataType = OB11Message

class GetMsg extends BaseAction<PayloadType, OB11Message> {
  actionName = ActionName.GetMsg

  protected async _handle(payload: PayloadType) {
    // log("history msg ids", Object.keys(msgHistory));
    if (!payload.message_id) {
      throw '参数message_id不能为空'
    }
    const msgShortId = MessageUnique.getShortIdByMsgId(payload.message_id.toString())
    const msgIdWithPeer = await MessageUnique.getMsgIdAndPeerByShortId(msgShortId || +payload.message_id)
    if (!msgIdWithPeer) {
      throw ('消息不存在')
    }
    const peer = {
      guildId: '',
      peerUid: msgIdWithPeer.Peer.peerUid,
      chatType: msgIdWithPeer.Peer.chatType
    }
    const msg = getMsgCache(msgIdWithPeer.MsgId) ?? (await NTQQMsgApi.getMsgsByMsgId(peer, [msgIdWithPeer.MsgId])).msgList[0]
    const retMsg = await OB11Constructor.message(msg)
    retMsg.message_id = MessageUnique.createMsg(peer, msg.msgId)!
    retMsg.message_seq = retMsg.message_id
    retMsg.real_id = retMsg.message_id
    return retMsg
  }
}

export default GetMsg
