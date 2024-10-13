import { BaseAction, Schema } from '../BaseAction'
import { OB11Message } from '../../types'
import { ActionName } from '../types'
import { ChatType } from '@/ntqqapi/types'
import { OB11Entities } from '../../entities'
import { RawMessage } from '@/ntqqapi/types'
import { filterNullable, parseBool } from '@/common/utils/misc'

interface Payload {
  group_id: number | string
  message_seq?: number | string
  count: number | string
  reverseOrder: boolean
}

interface Response {
  messages: OB11Message[]
}

export class GetGroupMsgHistory extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetGroupMsgHistory
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    message_seq: Schema.union([Number, String]),
    count: Schema.union([Number, String]).default(20),
    reverseOrder: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false)
  })

  protected async _handle(payload: Payload): Promise<Response> {
    const { count, reverseOrder } = payload
    const peer = { chatType: ChatType.Group, peerUid: payload.group_id.toString() }
    let msgList: RawMessage[]
    if (!payload.message_seq || +payload.message_seq === 0) {
      msgList = (await this.ctx.ntMsgApi.getAioFirstViewLatestMsgs(peer, +count)).msgList
    } else {
      const startMsgId = (await this.ctx.store.getMsgInfoByShortId(+payload.message_seq))?.msgId
      if (!startMsgId) throw new Error(`消息${payload.message_seq}不存在`)
      msgList = (await this.ctx.ntMsgApi.getMsgHistory(peer, startMsgId, +count, true)).msgList
    }
    if (!msgList?.length) throw new Error('未找到消息')
    if (reverseOrder) msgList.reverse()
    const ob11MsgList = await Promise.all(msgList.map(msg => OB11Entities.message(this.ctx, msg)))
    return { messages: filterNullable(ob11MsgList) }
  }
}
