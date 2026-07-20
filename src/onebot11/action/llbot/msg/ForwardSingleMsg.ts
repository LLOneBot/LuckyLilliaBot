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
    // 获取源消息判断是否存在
    const info = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!info) {
      throw new Error(`无法找到消息${payload.message_id}`)
    }

    // 获取源消息内容
    let msg = this.ctx.store.getMsgByMsgId(info.msgId)
    if (!msg) {
      msg = (await this.ctx.ntMsgApi.getSingleMsg(info.peer, info.msgSeq)).msgList[0]
    }
    if (!msg) {
      throw new Error(`无法找到消息内容${payload.message_id}`)
    }

    // 转换消息元素
    const { elements, deleteAfterSentFiles } = await rawElementsToSend(this.ctx, msg.elements, msg.chatType === ChatType.Group)

    // 发送目标的peer
    const peer = await createPeer(this.ctx, payload)

    // 转发消息
    const ret = await this.ctx.app.sendMessage(this.ctx, peer, elements, deleteAfterSentFiles)

    // 创建消息id
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
