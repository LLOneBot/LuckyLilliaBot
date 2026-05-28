import { BaseAction, Schema } from '../../../BaseAction'
import { ActionName } from '../../../types'

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
    const result = await this.ctx.ntGroupApi.getGroupAlbumMediaList(
      +payload.group_id,
      payload.album_id
    )
    if (result.status !== 0) {
      throw new Error(`fetch group album media list failed: status=${result.status}`)
    }
    const album = result.body?.album
    const mediaList = result.body?.mediaList ?? []
    return {
      album: album ? {
        album_id: album.albumId,
        owner: album.owner,
        name: album.name,
        desc: album.desc,
        create_time: String(album.createTime),
        modify_time: String(album.modifyTime),
        last_upload_time: String(album.lastUploadTime),
        upload_number: String(album.uploadNumber),
        creator: {
          nick: album.creator?.nick ?? '',
          uin: album.creator?.uin ?? ''
        },
      } : null,
      media_list: mediaList.map((m) => ({
        type: m.type,
        image: m.image ? {
          lloc: m.image.lloc,
          photo_url: m.image.photoUrls.map((p) => ({
            spec: p.spec,
            url: {
              url: p.url.url,
              width: p.url.width,
              height: p.url.height
            },
          })),
          default_url: m.image.defaultUrl ? {
            url: m.image.defaultUrl.url,
            width: m.image.defaultUrl.width,
            height: m.image.defaultUrl.height
          } : null,
        } : null,
        desc: m.desc,
        upload_user: {
          uin: m.uploaderUin
        },
        upload_time: String(m.uploadTime),
        batch_id: m.batchId?.key ?? '0',
      }))
    }
  }
}
