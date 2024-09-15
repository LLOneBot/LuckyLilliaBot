import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: string | number
  file_id: string
  busid: number
}

export class DelGroupFile extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_DelGroupFile
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    file_id: Schema.string().required(),
    busid: Schema.number().default(102)
  })

  async _handle(payload: Payload) {
    await this.ctx.ntGroupApi.deleteGroupFile(payload.group_id.toString(), [payload.file_id], [payload.busid])
    return null
  }
}
