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
    // gocq 兼容：message_id 既可以直接是 forward resId（外部用户传 send 时返回的
    // forward_id 字符串），也可以是消息的 shortId（gocq 习惯：send 完回 message_id
    // 然后用同一个值取转发内容）。这里两种都接：先按 shortId 查 store，找不到再
    // 当作 resId 直接拉。
    const idOrResId = payload.id || payload.message_id
    if (!idOrResId) {
      throw new Error('message_id 不能为空')
    }
    let resId: string | undefined
    const asShortId = Number(idOrResId)
    if (Number.isInteger(asShortId)) {
      const msgInfo = await this.ctx.store.getMsgInfoByShortId(asShortId)
      const msg = msgInfo ? this.ctx.store.getMsgByMsgId(msgInfo.msgId) : undefined
      const arkElement = msg?.elements.find(e => e.arkElement)?.arkElement
      if (arkElement?.bytesData) {
        try {
          const data = JSON.parse(arkElement.bytesData)
          if (data.app === 'com.tencent.multimsg') {
            resId = data.meta?.detail?.resid
          }
        } catch { /* 不是合并转发 ark，下面 fallback */ }
      }
    }
    resId = resId || idOrResId
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
