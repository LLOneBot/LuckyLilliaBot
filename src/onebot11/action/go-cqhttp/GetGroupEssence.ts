import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { ChatType } from '@/ntqqapi/types'

interface Payload {
  group_id: number | string
}

interface EssenceMsg {
  sender_id: number
  sender_nick: string
  sender_time: number
  operator_id: number
  operator_nick: string
  operator_time: number
  message_id: number
}

export class GetEssenceMsgList extends BaseAction<Payload, EssenceMsg[]> {
  actionName = ActionName.GoCQHTTP_GetEssenceMsgList
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const groupCode = payload.group_id.toString()
    const peer = {
      guildId: '',
      chatType: ChatType.group,
      peerUid: groupCode
    }
    const essence = await this.ctx.ntGroupApi.queryCachedEssenceMsg(groupCode)
    const data: EssenceMsg[] = []
    for (const item of essence.items) {
      const { msgList } = await this.ctx.ntMsgApi.queryMsgsWithFilterExBySeq(peer, String(item.msgSeq), '0')
      const sourceMsg = msgList.find(e => e.msgRandom === String(item.msgRandom))
      if (!sourceMsg) continue
      data.push({
        sender_id: +item.msgSenderUin,
        sender_nick: item.msgSenderNick,
        sender_time: +sourceMsg.msgTime,
        operator_id: +item.opUin,
        operator_nick: item.opNick,
        operator_time: item.opTime,
        message_id: this.ctx.store.createMsgShortId(peer, sourceMsg.msgId)
      })
    }
    return data
  }
}
