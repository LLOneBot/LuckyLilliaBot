interface AlbumInfo {
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
}

export interface NodeIKernelAlbumService {
  addAlbum(seq: number, album_info: {
    owner: string, // groupId
    name: string,
    desc: string,
    createTime: '0'
  }): Promise<{
    seq: number
    result: number
    errMs: string
    album_info: AlbumInfo
  }>

  deleteAlbum(seq: number, group_id: string, album_id: string): Promise<{
    seq: number
    result: number
    errMs: string
  }>

  getAlbumList(request: {
    qun_id: string,
    seq: number,
    attach_info: '',
    request_time_line: {
      request_invoke_time: '0'
    }
  }): Promise<{
    response: {
      seq: number
      result: number
      errMs: string
      trace_id: string
      is_from_cache: boolean
      request_time_line: {
        request_invoke_time: string
        request_send_time: string
        response_recv_time: string
        response_callback_time: string
      }
      album_list: AlbumInfo[]
      attach_info: string
      has_more: boolean
      right: {
        right: number[]
        normal_upload: boolean
      }
      banner: {
        id: string
        img: string
        color: string
        text: string
        action_url: string
        interval_time: string
        action_type: number
      }
    }
  }>

  getMediaList(request: {
    qun_id: string,
    attach_info: string,
    seq: number,
    request_time_line: {
      request_invoke_time: string
    },
    album_id: string,
    lloc: string,
    batch_id: string
  }): Promise<{
    response: {
      seq: number
      result: number
      errMs: string
      trace_id: string
      request_time_line: {
        request_invoke_time: string
        request_send_time: string
        response_recv_time: string
        response_callback_time: string
      }
      album: AlbumInfo
      batch_list: {
        link_id: string
        desc: string
        show_time: string
        user: {
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
        medias: unknown[]
        upload_number: string
        origin_upload_number: string
        ext: {
          key: string
          value: string
          number_key: number
        }[]
        link_type: number
        sub_title: string
        banner: {
          material: number
          content: string
        }
        day_time: string
      }[]
      media_list: {
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
      }[]
      prev_attach_info: string
      next_attach_info: string
      prev_has_more: boolean
      next_has_more: boolean
      media_index: number
      right: {
        right: number[]
        normal_upload: boolean
      }
    }
  }>
}
