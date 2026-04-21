import { ChatType } from '@/ntqqapi/types'
import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  user_id: number | string
  event_type: number | string
}

export class SetInputStatus extends BaseAction<Payload, null> {
  actionName = ActionName.SetInputStatus
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required(),
    event_type: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const uin = payload.user_id.toString()
    const uid = await this.ctx.ntUserApi.getUidByUin(uin)
    if (!uid) throw new Error('无法获取用户信息')
    const result = await this.ctx.ntMsgApi.sendShowInputStatusReq(ChatType.C2C, +payload.event_type, uid)
    if (result.result !== 0) {
      throw new Error(result.errMsg)
    }
    return null
  }
}
