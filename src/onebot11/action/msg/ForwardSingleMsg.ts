import BaseAction from '../BaseAction'
import { ChatType } from '@/ntqqapi/types'
import { ActionName } from '../types'
import { Peer } from '@/ntqqapi/types'
import { MessageUnique } from '@/common/utils/messageUnique'

interface Payload {
  message_id: number | string
  group_id: number | string
  user_id?: number | string
}

abstract class ForwardSingleMsg extends BaseAction<Payload, null> {
  protected async getTargetPeer(payload: Payload): Promise<Peer> {
    if (payload.user_id) {
      const peerUid = await this.ctx.ntUserApi.getUidByUin(payload.user_id.toString())
      if (!peerUid) {
        throw new Error(`无法找到私聊对象${payload.user_id}`)
      }
      return { chatType: ChatType.friend, peerUid }
    }
    return { chatType: ChatType.group, peerUid: payload.group_id!.toString() }
  }

  protected async _handle(payload: Payload): Promise<null> {
    if (!payload.message_id) {
      throw Error('message_id不能为空')
    }
    const msg = await MessageUnique.getMsgIdAndPeerByShortId(+payload.message_id)
    if (!msg) {
      throw new Error(`无法找到消息${payload.message_id}`)
    }
    const peer = await this.getTargetPeer(payload)
    const ret = await this.ctx.ntMsgApi.forwardMsg(msg.Peer, peer, [msg.MsgId])
    if (ret.result !== 0) {
      throw new Error(`转发消息失败 ${ret.errMsg}`)
    }
    return null
  }
}

export class ForwardFriendSingleMsg extends ForwardSingleMsg {
  actionName = ActionName.ForwardFriendSingleMsg
}

export class ForwardGroupSingleMsg extends ForwardSingleMsg {
  actionName = ActionName.ForwardGroupSingleMsg
}
