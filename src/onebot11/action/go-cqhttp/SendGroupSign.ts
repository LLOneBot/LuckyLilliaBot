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
    const result = await this.ctx.ntGroupApi.groupClockIn(+payload.group_id)
    if (result.errorCode !== 0) {
      throw new Error(result.errorMsg)
    }
    return null
  }
}
