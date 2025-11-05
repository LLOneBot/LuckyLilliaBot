interface AlbumInfo {
  album_id: string;
  owner: string;
  name: string;
  desc: string;
  create_time: string;
  modify_time: string;
  last_upload_time: string;
  upload_number: string;
  cover: null | string;
  creator: null | string;
  top_flag: string;
  busi_type: number;
  status: number;
  permission: null | string;
  allow_share: boolean;
  is_subscribe: boolean;
  bitmap: string;
  is_share_album: boolean;
  share_album: null | string;
  qz_album_type: number;
  family_album: null | string;
  lover_album: null | string;
  cover_type: number;
  travel_album: null | string;
  visitor_info: null | string;
  default_desc: string;
  op_info: null | string;
  active_album: null | string;
  memory_info: null | string;
  sort_type: number;
}

export interface NodeIKernelAlbumService {
  addAlbum(seq: number, albumInfo: {
    owner: string, // groupId
    name: string,
    desc: string,
    createTime: '0'
  }): Promise<{
    seq: number;
    result: number;
    errMs: string;
    album_info: AlbumInfo;
  }>

  getAlbumList(queryInfo: {
    qun_id: string,
    seq: number,
    attach_info: '',
    request_time_line: {
      request_invoke_time: '0'
    }
  }): Promise<{
    response: {
      seq: number;
      result: number;
      errMs: string;
      album_list: AlbumInfo[];
    }
  }>
}
