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
    const result = await this.ctx.ntGroupApi.getGroupAlbumList(+payload.group_id)
    if (result.status !== 0) {
      throw new Error(`fetch group album list failed: status=${result.status}`)
    }
    return result.albumList.map((a) => {
      const photoUrls = a.cover?.image?.photoUrls ?? []
      const defaultUrl = a.cover?.image?.defaultUrl
      return {
        album_id: a.albumId,
        owner: a.owner,
        name: a.name,
        desc: a.desc,
        create_time: String(a.createTime),
        modify_time: String(a.modifyTime),
        last_upload_time: String(a.lastUploadTime),
        upload_number: String(a.uploadNumber),
        cover: {
          type: a.cover?.type ?? 0,
          image: a.cover?.image ? {
            lloc: a.cover.image.lloc,
            photo_url: photoUrls.map((p) => ({
              spec: p.spec,
              url: {
                url: p.url.url,
                width: p.url.width,
                height: p.url.height
              },
            })),
            default_url: defaultUrl ? {
              url: defaultUrl.url,
              width: defaultUrl.width,
              height: defaultUrl.height
            } : null,
          } : null,
          desc: a.desc,
        },
        creator: {
          nick: a.creator?.nick ?? '',
          uin: a.creator?.uin ?? '',
        },
      }
    })
  }
}
