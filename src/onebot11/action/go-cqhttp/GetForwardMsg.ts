import BaseAction from '../BaseAction'
import { OB11ForwardMessage, OB11Message, OB11MessageData } from '../../types'
import { NTQQMsgApi, Peer } from '../../../ntqqapi/api'
import { dbUtil } from '../../../common/db'
import { OB11Constructor } from '../../constructor'
import { ActionName } from '../types'

interface Payload {
  message_id: string // long msg id，gocq
  id?: string // long msg id, onebot11
}

interface Response {
  messages: (OB11Message & { content: OB11MessageData })[]
}

export class GoCQHTTGetForwardMsgAction extends BaseAction<Payload, any> {
  actionName = ActionName.GoCQHTTP_GetForwardMsg
  protected async _handle(payload: Payload): Promise<any> {
    const message_id = payload.id || payload.message_id
    if (!message_id) {
      throw Error('message_id不能为空')
    }
    const rootMsg = await dbUtil.getMsgByLongId(message_id)
    if (!rootMsg) {
      throw Error('msg not found')
    }
    let data = await NTQQMsgApi.getMultiMsg(
      { chatType: rootMsg.chatType, peerUid: rootMsg.peerUid },
      rootMsg.msgId,
      rootMsg.msgId,
    )
    if (data.result !== 0) {
      throw Error('找不到相关的聊天记录' + data.errMsg)
    }
    let msgList = data.msgList
    let messages = await Promise.all(
      msgList.map(async (msg) => {
        let resMsg = await OB11Constructor.message(msg)
        resMsg.message_id = await dbUtil.addMsg(msg)
        return resMsg
      }),
    )
    messages.map((msg) => {
      ;(<OB11ForwardMessage>msg).content = msg.message
      delete msg.message
    })
    return { messages }
  }
}
