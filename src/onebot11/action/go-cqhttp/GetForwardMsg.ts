import { BaseAction, Schema } from '../BaseAction'
import { OB11ForwardMessage } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
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
  payloadSchema = Schema.object({
    message_id: Schema.string(),
    id: Schema.string()
  })

  protected async _handle(payload: Payload) {
    const msgId = payload.id || payload.message_id
    if (!msgId) {
      throw Error('message_id不能为空')
    }
    const rootMsgId = await this.ctx.store.getShortIdByMsgId(msgId)
    const rootMsg = await this.ctx.store.getMsgInfoByShortId(rootMsgId || +msgId)
    if (!rootMsg) {
      throw Error('msg not found')
    }
    const data = await this.ctx.ntMsgApi.getMultiMsg(rootMsg.peer, rootMsg.msgId, rootMsg.msgId)
    if (data?.result !== 0) {
      throw Error('找不到相关的聊天记录' + data?.errMsg)
    }
    const msgList = data.msgList
    const messages = await Promise.all(
      msgList.map(async (msg) => {
        const resMsg = await OB11Entities.message(this.ctx, msg)
        if (!resMsg) return
        resMsg.message_id = this.ctx.store.createMsgShortId({
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
