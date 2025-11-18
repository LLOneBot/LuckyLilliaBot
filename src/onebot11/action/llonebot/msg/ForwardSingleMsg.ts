import { BaseAction } from '../../BaseAction'
import { ActionName } from '../../types'
import { createPeer } from '@/onebot11/helper/createMessage'

interface Payload {
  message_id: number | string
  group_id: number | string
  user_id?: number | string
}

interface Response {
  message_id: number
}

abstract class ForwardSingleMsg extends BaseAction<Payload, Response> {
  protected async _handle(payload: Payload) {
    // 判断为空
    if (!payload.message_id) {
      throw Error('message_id不能为空')
    }

    // 判断长id
    if (!(+payload.message_id >= -2147483648 && +payload.message_id <= 2147483647)) {
      const short_msg_id = await this.ctx.store.getShortIdByMsgId(String(payload.message_id))
      if (!short_msg_id) {
        throw new Error(`无法找到长id消息${payload.message_id}`)
      }
      payload.message_id = short_msg_id
    }

    // 获取源消息判断是否存在
    const msg = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msg) {
      throw new Error(`无法找到消息${payload.message_id}`)
    }

    // 发送目标的peer
    const peer = await createPeer(this.ctx, payload)

    // 转发消息
    const ret = await this.ctx.ntMsgApi.forwardMsg(msg.peer, peer, [msg.msgId])

    // 判断是否成功
    if (ret.length === 0) {
      throw new Error(`转发消息失败`)
    }

    // 创建消息id
    const msgShortId = this.ctx.store.createMsgShortId(ret[0])
    return { message_id: msgShortId }
  }
}

export class ForwardFriendSingleMsg extends ForwardSingleMsg {
  actionName = ActionName.ForwardFriendSingleMsg
}

export class ForwardGroupSingleMsg extends ForwardSingleMsg {
  actionName = ActionName.ForwardGroupSingleMsg
}
