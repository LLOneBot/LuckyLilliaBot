import { BaseAction } from '../../../BaseAction'
import { ActionName } from '../../../types'
import { uri2local } from '@/common/utils'

interface Payload {
  group_id: string,
  album_id: string
  files: string[]
}

export class UploadGroupAlbum extends BaseAction<Payload, unknown> {
  actionName = ActionName.UploadGroupAlbum

  protected async _handle(payload: Payload): Promise<unknown> {
    const filePathList = await Promise.all(
      payload.files.map(async uri => (await uri2local(this.ctx, uri)).path || uri)
    )
    return this.ctx.ntWebApi.uploadGroupAlbum(payload.group_id.toString(), filePathList, payload.album_id)
  }
}
