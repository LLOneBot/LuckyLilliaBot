import { BaseAction } from '../../../BaseAction'
import { ActionName } from '../../../types'

interface Payload {
  group_id: string,
  name: string,
  desc: string,
}

export class CreateGroupAlbum extends BaseAction<Payload, unknown> {
  actionName = ActionName.CreateGroupAlbum

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
