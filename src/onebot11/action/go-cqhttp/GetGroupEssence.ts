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
      chatType: ChatType.Group,
      peerUid: groupCode
    }
    const result = await this.ctx.ntWebApi.getGroupEssenceList(+payload.group_id)
    if (result.retcode !== 0) {
      throw new Error(result.retmsg)
    }
    const data: EssenceMsg[] = []
    for (const item of result.data.msg_list) {
      let msg = this.ctx.store.getMsgBySeq(peer.peerUid, item.msg_seq)
      if (!msg) {
        const { msgList } = await this.ctx.ntMsgApi.getSingleMsg(peer, item.msg_seq)
        msg = msgList[0]
      }
      if (!msg) continue
      data.push({
        sender_id: +item.sender_uin,
        sender_nick: item.sender_nick,
        sender_time: +msg.msgTime,
        operator_id: +item.add_digest_uin,
        operator_nick: item.add_digest_nick,
        operator_time: item.add_digest_time,
        message_id: this.ctx.store.createMsgShortId(msg)
      })
    }
    return data
  }
}
