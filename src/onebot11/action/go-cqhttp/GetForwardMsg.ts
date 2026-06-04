import { BaseAction, Schema } from '../BaseAction'
import { OB11ForwardMessage } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { filterNullable } from '@/common/utils/misc'
import { ParseMessageConfig } from '@/onebot11/types'

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

  protected async _handle(payload: Payload, config: ParseMessageConfig) {
    // gocq 标准：get_forward_msg 的 message_id（或 id）就是 send_forward_msg 返回的
    // forward_id 字符串（resId），直接透传给 server。客户端不应该把 send 返回的
    // 整数 message_id 用在这里 —— 那个是消息的 shortId，跟 forward resId 是两个东西。
    const resId = payload.id || payload.message_id
    if (!resId) {
      throw new Error('message_id 不能为空')
    }
    const data = await this.ctx.ntMsgApi.getForwardedMsgs(resId)
    const messages: (OB11ForwardMessage | undefined)[] = await Promise.all(
      data.msgList.map(async (msg) => {
        const res = await OB11Entities.message(this.ctx, msg, config)
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
