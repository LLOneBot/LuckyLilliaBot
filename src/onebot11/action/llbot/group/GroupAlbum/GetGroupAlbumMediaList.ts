import { BaseAction, Schema } from '../../../BaseAction'
import { ActionName } from '../../../types'
import { pick } from 'cosmokit'

interface Payload {
  group_id: number | string
  album_id: string
  attach_info?: string
}

export class GetGroupAlbumMediaList extends BaseAction<Payload, unknown> {
  actionName = ActionName.GetGroupAlbumMediaList
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    album_id: Schema.string().required(),
    attach_info: Schema.string()
  })

  protected async _handle(payload: Payload) {
    const res = await this.ctx.ntGroupApi.getGroupAlbumMediaList(
      payload.group_id.toString(),
      payload.album_id,
      payload.attach_info
    )
    if (res.response.result !== 0) {
      throw new Error(res.response.errMs)
    }
    return pick(res.response, ['album', 'media_list', 'next_attach_info', 'next_has_more'])
  }
}
