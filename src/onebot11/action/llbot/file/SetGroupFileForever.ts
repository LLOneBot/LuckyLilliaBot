import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  group_id: number | string
  file_id: string
}

export class SetGroupFileForever extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupFileForever
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    file_id: Schema.string().required(),
  })

  async _handle(payload: Payload) {
    const res = await this.ctx.ntGroupApi.persistGroupFile(+payload.group_id, payload.file_id)
    if (res.retCode !== 0) {
      throw new Error(res.clientWording)
    }
    return null
  }
}
