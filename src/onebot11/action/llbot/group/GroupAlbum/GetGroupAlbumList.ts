import { BaseAction, Schema } from '../../../BaseAction'
import { ActionName } from '../../../types'

interface Payload {
  group_id: number | string
}

export class GetGroupAlbumList extends BaseAction<Payload, unknown> {
  actionName = ActionName.GetGroupAlbumList
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const res = await this.ctx.ntGroupApi.getGroupAlbumList(payload.group_id.toString())
    if (res.response.result !== 0) {
      throw new Error(res.response.errMs)
    }
    return res.response.album_list
  }
}
