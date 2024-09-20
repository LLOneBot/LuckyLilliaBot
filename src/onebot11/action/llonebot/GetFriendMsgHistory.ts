import { BaseAction, Schema } from '../BaseAction'
import { OB11Message } from '@/onebot11/types'
import { ActionName } from '../types'
import { ChatType, RawMessage } from '@/ntqqapi/types'
import { OB11Entities } from '@/onebot11/entities'
import { filterNullable } from '@/common/utils/misc'

interface Payload {
  user_id: number | string
  message_seq?: number | string
  message_id?: number | string
  count: number | string
  reverseOrder: boolean
}

interface Response {
  messages: OB11Message[]
}

export class GetFriendMsgHistory extends BaseAction<Payload, Response> {
  actionName = ActionName.GetFriendMsgHistory
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required(),
    message_seq: Schema.union([Number, String]),
    message_id: Schema.union([Number, String]),
    count: Schema.union([Number, String]).default(20),
    reverseOrder: Schema.boolean().default(false)
  })

  async _handle(payload: Payload): Promise<Response> {
    const startMsgId = payload.message_seq ?? payload.message_id
    let msgList: RawMessage[]
    if (startMsgId) {
      const msgInfo = await this.ctx.store.getMsgInfoByShortId(+startMsgId)
      if (!msgInfo) throw new Error(`消息${startMsgId}不存在`)
      msgList = (await this.ctx.ntMsgApi.getMsgHistory(msgInfo.peer, msgInfo.msgId, +payload.count)).msgList
    } else {
      const uid = await this.ctx.ntUserApi.getUidByUin(payload.user_id.toString())
      if (!uid) throw new Error(`记录${payload.user_id}不存在`)
      const isBuddy = await this.ctx.ntFriendApi.isBuddy(uid)
      const peer = { chatType: isBuddy ? ChatType.friend : ChatType.temp, peerUid: uid }
      msgList = (await this.ctx.ntMsgApi.getAioFirstViewLatestMsgs(peer, +payload.count)).msgList
    }
    if (msgList.length === 0) throw new Error('未找到消息')
    if (payload.reverseOrder) msgList.reverse()
    msgList.map(msg => {
      msg.msgShortId = this.ctx.store.createMsgShortId({ chatType: msg.chatType, peerUid: msg.peerUid }, msg.msgId)
    })
    const ob11MsgList = await Promise.all(msgList.map(msg => OB11Entities.message(this.ctx, msg)))
    return { messages: filterNullable(ob11MsgList) }
  }
}
