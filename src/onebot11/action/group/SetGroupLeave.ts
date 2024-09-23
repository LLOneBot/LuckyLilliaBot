import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  is_dismiss?: boolean
}

export default class SetGroupLeave extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupLeave
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    await this.ctx.ntGroupApi.quitGroup(payload.group_id.toString())
    return null
  }
}
