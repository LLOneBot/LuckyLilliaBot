import BaseAction from '../BaseAction'
import { OB11Message } from '../../types'
import { ActionName } from '../types'
import { ChatType } from '@/ntqqapi/types'
import { NTQQMsgApi } from '@/ntqqapi/api/msg'
import { OB11Constructor } from '../../constructor'
import { RawMessage } from '@/ntqqapi/types'
import { MessageUnique } from '@/common/utils/MessageUnique'

interface Payload {
  group_id: number | string
  message_seq?: number
  count?: number
  reverseOrder?: boolean
}

interface Response {
  messages: OB11Message[]
}

export default class GoCQHTTPGetGroupMsgHistory extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetGroupMsgHistory

  protected async _handle(payload: Payload): Promise<Response> {
    const count = payload.count || 20
    const isReverseOrder = payload.reverseOrder || true
    const peer = { chatType: ChatType.group, peerUid: payload.group_id.toString() }
    let msgList: RawMessage[] | undefined
    // 包含 message_seq 0
    if (!payload.message_seq) {
      msgList = (await NTQQMsgApi.getLastestMsgByUids(peer, count))?.msgList
    } else {
      const startMsgId = (await MessageUnique.getMsgIdAndPeerByShortId(payload.message_seq))?.MsgId
      if (!startMsgId) throw `消息${payload.message_seq}不存在`
      msgList = (await NTQQMsgApi.getMsgHistory(peer, startMsgId, count)).msgList
    }
    if (!msgList?.length) throw '未找到消息'
    if (isReverseOrder) msgList.reverse()
    await Promise.all(
      msgList.map(async msg => {
        msg.msgShortId = MessageUnique.createMsg({ chatType: msg.chatType, peerUid: msg.peerUid }, msg.msgId)
      })
    )
    const ob11MsgList = await Promise.all(msgList.map((msg) => OB11Constructor.message(msg)))
    return { messages: ob11MsgList }
  }
}
