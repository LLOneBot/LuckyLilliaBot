import { DeepPartial } from '@/common/utils'
import { BaseAction, Schema } from '../../../BaseAction'
import { ActionName } from '../../../types'
import { objectToSnake } from 'ts-case-convert'

interface Payload {
  group_id: number | string
}

type AlbumInfo = DeepPartial<{
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

export class GetGroupAlbumList extends BaseAction<Payload, AlbumInfo[]> {
  actionName = ActionName.GetGroupAlbumList
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const result = await this.ctx.ntGroupApi.getGroupAlbumList(+payload.group_id)
    if (result.retCode !== 0) {
      throw new Error(result.retMsg)
    }
    return result.albumList.map(a => ({
      ...objectToSnake(a),
      create_time: a.createTime.toString(),
      modify_time: a.modifyTime.toString(),
      last_upload_time: a.lastUploadTime.toString(),
      upload_number: a.uploadNumber.toString()
    }))
  }
}
