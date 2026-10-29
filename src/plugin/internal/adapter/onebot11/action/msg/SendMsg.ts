import {
  OB11MessageDataType,
  OB11PostSendMsg,
} from '../../types'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { transformOutgoingSegments } from '../../transform/message/outgoing'
import { parseBool } from '@/common/utils/misc'
import { createPeer, CreatePeerMode, message2List } from '@/plugin/internal/adapter/onebot11/utils'
import { isDebugEnabled } from '@/common/logger'

interface ReturnData {
  message_id: number
}

export class SendMsg extends BaseAction<OB11PostSendMsg, ReturnData> {
  actionName = ActionName.SendMsg
  payloadSchema = Schema.object({
    message_type: Schema.union(['private', 'group']),
    user_id: Schema.union([Number, String]),
    group_id: Schema.union([Number, String]),
    message: Schema.any().required(),
    auto_escape: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false)
  })

  protected async _handle(payload: OB11PostSendMsg) {
    const tStart = Date.now()
    let contextMode = CreatePeerMode.Normal
    if (payload.message_type === 'group') {
      contextMode = CreatePeerMode.Group
    } else if (payload.message_type === 'private') {
      contextMode = CreatePeerMode.Private
    }
    const peer = await createPeer(this.ctx, payload, contextMode)
    const messages = message2List(payload.message, payload.auto_escape)
    if (messages.some(e => e.type === OB11MessageDataType.Node)) {
      throw new Error('请使用 /send_group_forward_msg 或 /send_private_forward_msg 进行合并转发')
    }
    const tPeer = Date.now()
    const { sendElements, deleteAfterSentFiles } = await transformOutgoingSegments(this.ctx, messages, peer, false)
    const tTransform = Date.now()
    const returnMsg = await this.ctx.app.sendMessage(this.ctx, peer, sendElements, deleteAfterSentFiles)
    const tSend = Date.now()
    const msgShortId = this.ctx.store.createMsgShortId(returnMsg)
    if (isDebugEnabled()) {
      this.ctx.logger('SendMsg').debug(
        `[timing] send_msg total: peer=${tPeer - tStart}ms transform=${tTransform - tPeer}ms sendMessage=${tSend - tTransform}ms all=${Date.now() - tStart}ms`
      )
    }
    return { message_id: msgShortId }
  }
}

export default SendMsg
