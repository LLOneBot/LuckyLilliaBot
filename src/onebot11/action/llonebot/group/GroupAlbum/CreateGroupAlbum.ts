import { BaseAction, Schema } from '../../../BaseAction'
import { ActionName } from '../../../types'

interface Payload {
  group_id: number | string
  name: string
  desc: string
}

export class CreateGroupAlbum extends BaseAction<Payload, unknown> {
  actionName = ActionName.CreateGroupAlbum
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    name: Schema.string().required(),
    desc: Schema.string()
  })

  protected async _handle(payload: Payload): Promise<unknown> {
    const res = await this.ctx.ntGroupApi.createGroupAlbum(
      payload.group_id.toString(),
      payload.name,
      payload.desc,
    )
    if (res.result !== 0) {
      throw new Error(`CreateGroupAlbum failed: ${res.errMs}`)
    }
    return res.album_info
  }
}
