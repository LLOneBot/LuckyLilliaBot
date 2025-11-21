import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  group_id: number | string
  remark?: string
}

export class SetGroupRemark extends BaseAction<Payload, unknown> {
  actionName = ActionName.SetGroupRemark
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    remark: Schema.string()
  })

  protected async _handle(payload: Payload): Promise<unknown> {
    return this.ctx.ntGroupApi.setGroupRemark(payload.group_id.toString(), payload.remark)
  }
}
