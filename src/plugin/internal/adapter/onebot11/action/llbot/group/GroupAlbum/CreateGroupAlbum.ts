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
    const result = await this.ctx.ntGroupApi.createGroupAlbum(
      +payload.group_id,
      payload.name,
      payload.desc,
    )
    if (result.retCode !== 0) {
      throw new Error(result.retMsg)
    }
    if (!result.info?.albumId) {
      throw new Error('create group album failed: server returned no album_id')
    }
    return {
      album_id: result.info.albumId,
      owner: result.info.groupCode,
      name: result.info.name,
      desc: result.info.desc
    }
  }
}
