import BaseAction from '../BaseAction'
import { NTQQMsgApi, Peer } from '../../../ntqqapi/api'
import { ChatType, RawMessage } from '../../../ntqqapi/types'
import { dbUtil } from '../../../common/db'
import { getUidByUin } from '../../../common/data'
import { ActionName } from '../types'

interface Payload {
  message_id: number
  group_id: number
  user_id?: number
}

interface Response {
  message_id: number
}

class ForwardSingleMsg extends BaseAction<Payload, Response> {
  protected async getTargetPeer(payload: Payload): Promise<Peer> {
    if (payload.user_id) {
      return { chatType: ChatType.friend, peerUid: getUidByUin(payload.user_id.toString()) }
    }
    return { chatType: ChatType.group, peerUid: payload.group_id.toString() }
  }

  protected async _handle(payload: Payload): Promise<Response> {
    const msg = await dbUtil.getMsgByShortId(payload.message_id)
    const peer = await this.getTargetPeer(payload)
    const sentMsg = await NTQQMsgApi.forwardMsg(
      {
        chatType: msg.chatType,
        peerUid: msg.peerUid,
      },
      peer,
      [msg.msgId],
    )
    const ob11MsgId = await dbUtil.addMsg(sentMsg)
    return {message_id: ob11MsgId}
  }
}

export class ForwardFriendSingleMsg extends ForwardSingleMsg {
  actionName = ActionName.ForwardFriendSingleMsg
}

export class ForwardSingleGroupMsg extends ForwardSingleMsg {
  actionName = ActionName.ForwardGroupSingleMsg
}
