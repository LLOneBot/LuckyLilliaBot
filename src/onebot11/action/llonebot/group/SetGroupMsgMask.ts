import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  group_id: number | string
  mask: number | string  // 1, 2, 3, 4
}

export class SetGroupMsgMask extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupMsgMask
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    mask: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const res = await this.ctx.ntGroupApi.setGroupMsgMask(payload.group_id.toString(), +payload.mask)
    if (res.result !== 0) {
      throw new Error(res.errMsg)
    }
    return null
  }
}
