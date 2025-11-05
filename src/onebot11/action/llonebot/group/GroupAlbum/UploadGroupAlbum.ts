import { BaseAction } from '../../../BaseAction'
import { ActionName } from '../../../types'
import { uri2local } from '@/common/utils'

interface Payload {
  group_id: string,
  album_id: string
  file: string
}

export class UploadGroupAlbum extends BaseAction<Payload, unknown> {
  actionName = ActionName.UploadGroupAlbum

  protected async _handle(payload: Payload): Promise<unknown> {
    const filePath = (await uri2local(this.ctx, payload.file)).path || payload.file
    return this.ctx.ntWebApi.uploadGroupAlbum(payload.group_id.toString(), filePath, payload.album_id)
  }
}
