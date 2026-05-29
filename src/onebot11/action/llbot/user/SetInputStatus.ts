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
    const uid = await this.ctx.ntUserApi.getUidByUin(+payload.user_id)
    if (!uid) throw new Error('无法获取用户信息')
    const result = await this.ctx.ntMsgApi.setPrivateInputStatus(uid, +payload.event_type)
    if (result.retCode !== 0) {
      throw new Error('设置输入状态失败')
    }
    return null
  }
}
