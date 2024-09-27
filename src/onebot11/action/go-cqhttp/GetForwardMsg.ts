import { BaseAction, Schema } from '../BaseAction'
import { OB11ForwardMessage } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { filterNullable } from '@/common/utils/misc'

interface Payload {
  message_id: string // long msg id，gocq
  id?: string // long msg id, onebot11
}

interface Response {
  messages: OB11ForwardMessage[]
}

export class GetForwardMsg extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetForwardMsg
  payloadSchema = Schema.object({
    message_id: Schema.string(),
    id: Schema.string()
  })

  protected async _handle(payload: Payload) {
    const msgId = payload.id || payload.message_id
    if (!msgId) {
      throw Error('message_id不能为空')
    }
    const rootMsgId = await this.ctx.store.getShortIdByMsgId(msgId)
    const rootMsg = await this.ctx.store.getMsgInfoByShortId(rootMsgId || +msgId)
    if (!rootMsg) {
      throw Error('msg not found')
    }
    const data = await this.ctx.ntMsgApi.getMultiMsg(rootMsg.peer, rootMsg.msgId, rootMsg.msgId)
    if (data?.result !== 0) {
      throw Error('找不到相关的聊天记录' + data?.errMsg)
    }
    const messages: (OB11ForwardMessage | undefined)[] = await Promise.all(
      data.msgList.map(async (msg) => {
        const res = await OB11Entities.message(this.ctx, msg)
        if (res) {
          return {
            content: res.message,
            sender: {
              nickname: res.sender.nickname,
              user_id: res.sender.user_id
            },
            time: res.time,
            message_format: res.message_format,
            message_type: res.message_type
          }
        }
      })
    )
    return { messages: filterNullable(messages) }
  }
}
