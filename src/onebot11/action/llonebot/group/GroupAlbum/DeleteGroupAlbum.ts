import { BaseAction } from '../../../BaseAction'
import { ActionName } from '../../../types'

interface Payload {
  group_id: string,
  album_id: string,
}

export class DeleteGroupAlbum extends BaseAction<Payload, unknown> {
  actionName = ActionName.DeleteGroupAlbum

  protected async _handle(payload: Payload): Promise<unknown> {
    const res = await this.ctx.ntGroupApi.deleteGroupAlbum(payload.group_id, payload.album_id)
    if (res.result !== 0) {
      throw new Error(`CreateGroupAlbum failed: ${res.errMs}`)
    }
    return null
  }
}
