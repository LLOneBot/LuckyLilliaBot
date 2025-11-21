import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  file_id: string
  busid: number | string
}

export class DeleteGroupFile extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_DeleteGroupFile
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    file_id: Schema.string().required(),
    busid: Schema.union([Number, String]).default(102)
  })

  async _handle(payload: Payload) {
    const res = await this.ctx.ntGroupApi.deleteGroupFile(payload.group_id.toString(), [payload.file_id], [+payload.busid])
    if (res.transGroupFileResult.result.retCode !== 0) {
      throw new Error(res.transGroupFileResult.result.clientWording)
    }
    return null
  }
}
