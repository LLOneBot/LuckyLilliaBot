import { BaseAction, Schema } from '../BaseAction'
import { OB11ForwardMessage, OB11MessageDataType } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { filterNullable } from '@/common/utils/misc'
import { message2List } from '@/onebot11/helper/createMessage'

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
    const shortId = await this.ctx.store.getShortIdByMsgId(msgId)
    const msgInfo = await this.ctx.store.getMsgInfoByShortId(shortId || +msgId)
    if (!msgInfo) {
      throw Error('msg not found')
    }
    const multiMsgInfo = await this.ctx.store.getMultiMsgInfo(msgInfo.msgId)
    const rootMsgId = multiMsgInfo[0]?.rootMsgId ?? msgInfo.msgId
    const peer = multiMsgInfo[0]?.peerUid ? {
      ...msgInfo.peer,
      peerUid: multiMsgInfo[0].peerUid
    } : msgInfo.peer
    const data = await this.ctx.ntMsgApi.getMultiMsg(peer, rootMsgId, msgInfo.msgId)
    if (data?.result !== 0) {
      throw Error('找不到相关的聊天记录' + data?.errMsg)
    }
    const messages: (OB11ForwardMessage | undefined)[] = await Promise.all(
      data.msgList.map(async (msg) => {
        const res = await OB11Entities.message(this.ctx, msg, rootMsgId, peer.peerUid)
        if (res) {
          const segments = message2List(res.message)
          for (const item of segments) {
            if (item.type === OB11MessageDataType.Forward) {
              this.ctx.store.addMultiMsgInfo(rootMsgId, item.data.id, peer.peerUid)
            }
          }
          return {
            content: res.message,
            sender: {
              nickname: res.sender.nickname,
              user_id: res.sender.user_id
            },
            time: res.time,
            message_format: res.message_format,
            message_type: res.message_type
          }
        }
      })
    )
    return { messages: filterNullable(messages) }
  }
}
