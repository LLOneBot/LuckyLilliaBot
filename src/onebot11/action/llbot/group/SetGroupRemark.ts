import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  group_id: number | string
  remark?: string
}

export class SetGroupRemark extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupRemark
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    remark: Schema.string()
  })

  protected async _handle(payload: Payload) {
    const res = await this.ctx.ntGroupApi.setGroupRemark(payload.group_id.toString(), payload.remark)
    if (res.result !== 0) {
      throw new Error(res.errMsg)
    }
    return null
  }
}
