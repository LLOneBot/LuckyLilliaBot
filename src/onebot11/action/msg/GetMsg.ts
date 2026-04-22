import { BaseAction, Schema } from '../BaseAction'
import { OB11Message } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { ParseMessageConfig } from '@/onebot11/types'

export interface PayloadType {
  message_id: number | string
}

export type ReturnDataType = OB11Message

class GetMsg extends BaseAction<PayloadType, OB11Message> {
  actionName = ActionName.GetMsg
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: PayloadType, config: ParseMessageConfig) {
    const msgInfo = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msgInfo) {
      throw new Error('消息不存在')
    }
    let status: 'normal' | 'deleted' = 'normal'
    let msg
    const res = await this.ctx.ntMsgApi.getMsgsByMsgId(msgInfo.peer, [msgInfo.msgId])
    if (res.msgList.length === 0 || res.msgList[0].elements[0].grayTipElement?.revokeElement) {
      const msgCache = this.ctx.store.getMsgCache(msgInfo.msgId)
      if (msgCache) {
        msg = msgCache
        status = 'deleted'
      } else if (res.msgList.length === 0) {
        throw new Error('无法获取该消息')
      } else {
        msg = res.msgList[0]
        status = 'deleted'
      }
    } else {
      msg = res.msgList[0]
    }
    const retMsg = await OB11Entities.message(this.ctx, msg, undefined, undefined, config)
    if (!retMsg) {
      throw new Error('消息为空')
    }
    retMsg.real_id = retMsg.message_seq
    retMsg.status = status
    return retMsg
  }
}

export default GetMsg
