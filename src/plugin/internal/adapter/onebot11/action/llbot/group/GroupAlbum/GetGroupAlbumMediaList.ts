import { DeepPartial } from '@/common/utils'
import { BaseAction, Schema } from '../../../BaseAction'
import { ActionName } from '../../../types'
import { objectToSnake } from 'ts-case-convert'

interface Payload {
  group_id: number | string
  album_id: string
  attach_info?: string
}

interface Response {
  album: DeepPartial<{
    album_id: string
    owner: string
    name: string
    desc: string
    create_time: string
    modify_time: string
    last_upload_time: string
    upload_number: string
    cover: {
      type: number
      image: {
        name: string
        sloc: string
        lloc: string
        photo_url: {
          spec: number
          url: {
            url: string
            width: number
            height: number
          }
        }[]
        default_url: {
          url: string
          width: number
          height: number
        }
        is_gif: boolean
        has_raw: boolean
      }
      video: unknown
      desc: string
      lbs: unknown
      uploader: string
      batch_id: string
      upload_time: string
      upload_order: number
      like: unknown
      comment: unknown
      upload_user: unknown
      ext: unknown[]
      shoot_time: string
      link_id: string
      op_mask: unknown[]
      lbs_source: number
    }
    creator: {
      uid: string
      nick: string
      yellow_info: unknown
      star_info: unknown
      is_sweet: boolean
      is_special: boolean
      is_super_like: boolean
      custom_id: string
      poly_id: string
      portrait: string
      can_follow: number
      isfollowed: number
      uin: string
      ditto_uin: string
    }
    top_flag: string
    busi_type: number
    status: number
    permission: null | string
    allow_share: boolean
    is_subscribe: boolean
    bitmap: string
    is_share_album: boolean
    share_album: null | string
    qz_album_type: number
    family_album: null | string
    lover_album: null | string
    cover_type: number
    travel_album: null | string
    visitor_info: null | string
    default_desc: string
    op_info: null | string
    active_album: null | string
    memory_info: null | string
    sort_type: number
  }>
  media_list: DeepPartial<{
    type: number
    image: {
      name: string
      sloc: string
      lloc: string
      photo_url: {
        spec: number
        url: {
          url: string
          width: number
          height: number
        }
      }[]
      default_url: {
        url: string
        width: number
        height: number
      }
      is_gif: boolean
      has_raw: boolean
    } | null
    video: {
      id: string
      url: string
      cover: {
        name: string
        sloc: string
        lloc: string
        photo_url: {
          spec: number
          url: {
            url: string
            width: number
            height: number
          }
        }[]
        default_url: {
          url: string
          width: number
          height: number
        }
        is_gif: boolean
        has_raw: boolean
      }
      width: number
      height: number
      video_time: string
      video_url: {
        spec: number
        url: {
          url: string
          width: number
          height: number
        }
      }[]
    } | null
    desc: string
    lbs: {
      gps: {
        lat: string
        lon: string
        e_type: string
        alt: string
      }
      location: string
      lbsId: string
      address: string
    }
    uploader: string
    batch_id: string
    upload_time: string
    upload_order: number
    like: {
      key: string
      num: number
      liked: boolean
    }
    comment: {
      num: number
    }
    upload_user: {
      uid: string
      nick: string
      yellow_info: unknown
      star_info: unknown
      is_sweet: boolean
      is_special: boolean
      is_super_like: boolean
      custom_id: string
      poly_id: string
      portrait: string
      can_follow: number
      isfollowed: number
      uin: string
      ditto_uin: string
    }
    ext: unknown[]
    shoot_time: string
    link_id: string
    op_mask: unknown[]
    lbs_source: number
  }[]>
  next_attach_info: string
  next_has_more: boolean
}

export class GetGroupAlbumMediaList extends BaseAction<Payload, Response> {
  actionName = ActionName.GetGroupAlbumMediaList
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    album_id: Schema.string().required(),
    attach_info: Schema.string()
  })

  protected async _handle(payload: Payload) {
    const result = await this.ctx.ntGroupApi.getGroupAlbumMediaList(
      +payload.group_id,
      payload.album_id,
      payload.attach_info ?? undefined  // 过滤 null
    )
    if (result.retCode !== 0) {
      throw new Error(result.retMsg)
    }
    const album = result.body!.album!
    const mediaList = result.body!.mediaList!
    const { nextAttachInfo, nextHasMore } = result.body!
    return {
      album: {
        ...objectToSnake(album),
        create_time: album.createTime.toString(),
        modify_time: album.modifyTime.toString(),
        last_upload_time: album.lastUploadTime.toString(),
        upload_number: album.uploadNumber.toString()
      },
      media_list: mediaList.map(media => ({
        ...objectToSnake(media),
        video: media.video ? {
          ...objectToSnake(media.video),
          video_time: media.video.videoTime.toString()
        } : undefined,
        batch_id: media.batchId.toString(),
        upload_time: media.uploadTime.toString()
      })),
      next_attach_info: nextAttachInfo,
      next_has_more: nextHasMore
    }
  }
}
