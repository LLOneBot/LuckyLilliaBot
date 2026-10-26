import { ChatType } from '@/ntqqapi/types'
import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { createPeer } from '@/onebot11/utils'
import { rawElementsToSend } from '@/ntqqapi/helper/forwardMsg'

interface Payload {
  message_id: number | string
  group_id?: number | string
  user_id?: number | string
}

interface Response {
  message_id: number
}

abstract class ForwardSingleMsg extends BaseAction<Payload, Response> {
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required(),
    group_id: Schema.union([Number, String]),
    user_id: Schema.union([Number, String])
  })

  protected async _handle(payload: Payload) {
    const info = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!info) {
      throw new Error(`无法找到消息${payload.message_id}`)
    }

    let msg = this.ctx.store.getMsgByMsgId(info.msgId)
    if (!msg) {
      msg = (await this.ctx.ntMsgApi.getSingleMsg(info.peer, info.msgSeq)).msgList[0]
    }
    if (!msg) {
      throw new Error(`无法找到消息内容${payload.message_id}`)
    }

    const { elements, deleteAfterSentFiles } = await rawElementsToSend(
      this.ctx,
      msg.elements,
      info.peer
    )

    const peer = await createPeer(this.ctx, payload)

    const ret = await this.ctx.app.sendMessage(this.ctx, peer, elements, deleteAfterSentFiles)

    const msgShortId = this.ctx.store.createMsgShortId(ret)
    return { message_id: msgShortId }
  }
}

export class ForwardFriendSingleMsg extends ForwardSingleMsg {
  actionName = ActionName.ForwardFriendSingleMsg
}

export class ForwardGroupSingleMsg extends ForwardSingleMsg {
  actionName = ActionName.ForwardGroupSingleMsg
}
