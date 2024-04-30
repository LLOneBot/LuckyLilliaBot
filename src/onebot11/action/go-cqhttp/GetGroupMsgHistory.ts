import BaseAction from '../BaseAction'
import { OB11Message, OB11User } from '../../types'
import { groups } from '../../../common/data'
import { ActionName } from '../types'
import { ChatType } from '../../../ntqqapi/types'
import { dbUtil } from '../../../common/db'
import { NTQQMsgApi } from '../../../ntqqapi/api/msg'
import { OB11Constructor } from '../../constructor'
import { log } from '../../../common/utils'

interface Payload {
  group_id: number
  message_seq: number
  count: number
}

interface Response {
  messages: OB11Message[]
}

export default class GoCQHTTPGetGroupMsgHistory extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetGroupMsgHistory

  protected async _handle(payload: Payload): Promise<Response> {
    const group = groups.find((group) => group.groupCode === payload.group_id.toString())
    if (!group) {
      throw `群${payload.group_id}不存在`
    }
    const startMsgId = (await dbUtil.getMsgByShortId(payload.message_seq))?.msgId || '0'
    // log("startMsgId", startMsgId)
    let msgList = (
      await NTQQMsgApi.getMsgHistory(
        { chatType: ChatType.group, peerUid: group.groupCode },
        startMsgId,
        parseInt(payload.count?.toString()) || 20,
      )
    ).msgList
    await Promise.all(
      msgList.map(async (msg) => {
        msg.msgShortId = await dbUtil.addMsg(msg)
      }),
    )
    const ob11MsgList = await Promise.all(msgList.map((msg) => OB11Constructor.message(msg)))
    return { messages: ob11MsgList }
  }
}
