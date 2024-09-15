import { BaseAction } from '../BaseAction'
import { OB11ForwardMessage } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { MessageUnique } from '@/common/utils/messageUnique'
import { filterNullable } from '@/common/utils/misc'

interface Payload {
  message_id: string // long msg id，gocq
  id?: string // long msg id, onebot11
}

interface Response {
  messages: OB11ForwardMessage[]
}

export class GetForwardMsg extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetForwardMsg
  protected async _handle(payload: Payload) {
    const msgId = payload.id || payload.message_id
    if (!msgId) {
      throw Error('message_id不能为空')
    }
    const rootMsgId = MessageUnique.getShortIdByMsgId(msgId)
    const rootMsg = await MessageUnique.getMsgIdAndPeerByShortId(rootMsgId || +msgId)
    if (!rootMsg) {
      throw Error('msg not found')
    }
    const data = await this.ctx.ntMsgApi.getMultiMsg(rootMsg.Peer, rootMsg.MsgId, rootMsg.MsgId)
    if (data?.result !== 0) {
      throw Error('找不到相关的聊天记录' + data?.errMsg)
    }
    const msgList = data.msgList
    const messages = await Promise.all(
      msgList.map(async (msg) => {
        const resMsg = await OB11Entities.message(this.ctx, msg)
        if (!resMsg) return
        resMsg.message_id = MessageUnique.createMsg({
          chatType: msg.chatType,
          peerUid: msg.peerUid,
        }, msg.msgId)
        return resMsg
      })
    )
    const forwardMessages = filterNullable(messages)
      .map(v => {
        const msg = v as Partial<OB11ForwardMessage>
        msg.content = msg.message
        delete msg.message
        return msg as OB11ForwardMessage
      })
    return { messages: forwardMessages }
  }
}
