import { BaseAction, Schema } from '../../../BaseAction'
import { ActionName } from '../../../types'

interface Payload {
  group_id: number | string
  album_id: string
}

export class DeleteGroupAlbum extends BaseAction<Payload, null> {
  actionName = ActionName.DeleteGroupAlbum
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    album_id: Schema.string().required()
  })

  protected async _handle(payload: Payload) {
    const res = await this.ctx.ntGroupApi.deleteGroupAlbum(payload.group_id.toString(), payload.album_id)
    if (res.result !== 0) {
      throw new Error(`CreateGroupAlbum failed: ${res.errMs}`)
    }
    return null
  }
}
