import { BaseAction } from '../BaseAction'
import { OB11Message } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'

export interface PayloadType {
  message_id: number | string
}

export type ReturnDataType = OB11Message

class GetMsg extends BaseAction<PayloadType, OB11Message> {
  actionName = ActionName.GetMsg

  protected async _handle(payload: PayloadType) {
    if (!payload.message_id) {
      throw new Error('参数message_id不能为空')
    }
    const msgInfo = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msgInfo) {
      throw new Error('消息不存在')
    }
    let msg = this.ctx.store.getMsgCache(msgInfo.msgId)
    if (!msg) {
      const res = await this.ctx.ntMsgApi.getMsgsByMsgId(msgInfo.peer, [msgInfo.msgId])
      if (res.msgList.length === 0) {
        throw new Error('无法获取该消息')
      }
      msg = res.msgList[0]
    }
    const retMsg = await OB11Entities.message(this.ctx, msg)
    if (!retMsg) {
      throw new Error('消息为空')
    }
    retMsg.real_id = retMsg.message_seq
    return retMsg
  }
}

export default GetMsg
