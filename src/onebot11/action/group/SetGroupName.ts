import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  group_name: string
}

export default class SetGroupName extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupName
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    group_name: Schema.string().required()
  })

  protected async _handle(payload: Payload): Promise<null> {
    await this.ctx.ntGroupApi.setGroupName(payload.group_id.toString(), payload.group_name)
    return null
  }
}
