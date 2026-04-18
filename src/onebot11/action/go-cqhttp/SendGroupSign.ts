import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
}

export class SendGroupSign extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_SendGroupSign
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
  })

  async _handle(payload: Payload) {
    await this.ctx.pmhq.groupClockIn(String(payload.group_id))
    return null
  }
}
