import {
  OB11MessageDataType,
  OB11PostSendMsg,
} from '../../types'
import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'
import { message2List, createSendElements, createPeer, CreatePeerMode } from '../../helper/createMessage'

interface ReturnData {
  message_id: number
}

export class SendMsg extends BaseAction<OB11PostSendMsg, ReturnData> {
  actionName = ActionName.SendMsg

  protected async _handle(payload: OB11PostSendMsg) {
    let contextMode = CreatePeerMode.Normal
    if (payload.message_type === 'group') {
      contextMode = CreatePeerMode.Group
    } else if (payload.message_type === 'private') {
      contextMode = CreatePeerMode.Private
    }
    const peer = await createPeer(this.ctx, payload, contextMode)
    const messages = message2List(
      payload.message,
      payload.auto_escape === true || payload.auto_escape === 'true',
    )
    if (messages.some(e => e.type === OB11MessageDataType.Node)) {
      throw new Error('请使用 /send_group_forward_msg 或 /send_private_forward_msg 进行合并转发')
    }
    const { sendElements, deleteAfterSentFiles } = await createSendElements(this.ctx, messages, peer)
    if (sendElements.length === 1) {
      if (sendElements[0] === null) {
        return { message_id: 0 }
      }
    }
    const returnMsg = await this.ctx.app.sendMessage(this.ctx, peer, sendElements, deleteAfterSentFiles)
    if (!returnMsg) {
      throw new Error('消息发送失败')
    }
    const msgShortId = this.ctx.store.createMsgShortId(returnMsg)
    return { message_id: msgShortId }
  }
}

export default SendMsg
