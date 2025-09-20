import { BaseAction, Schema } from '../BaseAction'
import { OB11Message } from '@/onebot11/types'
import { ActionName } from '../types'
import { ChatType, Peer, RawMessage } from '@/ntqqapi/types'
import { OB11Entities } from '@/onebot11/entities'
import { filterNullable, parseBool } from '@/common/utils/misc'

interface Payload {
  user_id: number | string
  message_seq?: number | string
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
    count: Schema.union([Number, String]).default(20),
    reverseOrder: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false)
  })

  private async getMessage(peer: Peer, count: number, seq?: number | string) {
    let msgList: RawMessage[]
    if (!seq || +seq === 0) {
      msgList = (await this.ctx.ntMsgApi.getAioFirstViewLatestMsgs(peer, count)).msgList
    } else {
      msgList = (await this.ctx.ntMsgApi.getMsgsBySeqAndCount(peer, String(seq), count, true, true)).msgList
    }
    if (!msgList?.length) return
    const ob11MsgList = await Promise.all(msgList.map(msg => {
      let rawMsg = msg
      if (rawMsg.recallTime !== '0') {
        let msg = this.ctx.store.getMsgCache(rawMsg.msgId)
        if (msg) {
          rawMsg = msg
        }
      }
      return OB11Entities.message(this.ctx, rawMsg)
    }))
    return { list: filterNullable(ob11MsgList), seq: +msgList[0].msgSeq }
  }

  async _handle(payload: Payload): Promise<Response> {
    const uid = await this.ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!uid) throw new Error(`无法获取用户信息`)
    const isBuddy = await this.ctx.ntFriendApi.isBuddy(uid)
    const peer = { chatType: isBuddy ? ChatType.C2C : ChatType.TempC2CFromGroup, peerUid: uid }

    const messages: OB11Message[] = []
    let seq = payload.message_seq
    let count = +payload.count

    while (count > 0) {
      const res = await this.getMessage(peer, count, seq)
      if (!res) break
      seq = res.seq - 1
      count -= res.list.length
      messages.unshift(...res.list)
    }

    if (payload.reverseOrder) messages.reverse()
    return { messages }
  }
}
