import { BaseAction, Schema } from '../BaseAction'
import { OB11ForwardMessage, OB11MessageDataType } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { filterNullable } from '@/common/utils/misc'
import { message2List } from '@/onebot11/utils'
import { decodeMultiMessage } from '@/onebot11/helper/decodeMultiMessage'
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
