import { selfInfo } from '@/common/globalVars'
import { HttpUtil } from '@/common/utils/request'
import { Context, Service } from 'cordis'
import { Dict } from 'cosmokit'
import fs from 'node:fs/promises'
import { formatYYYYMMDD, getMd5HexFromBuffer, getSha1HexFromBuffer } from '@/common/utils'
import { fileTypeFromBuffer } from 'file-type'
import { createThumb } from '@/common/utils/video'

declare module 'cordis' {
  interface Context {
    ntWebApi: NTWebApi
  }
}

export class NTWebApi extends Service {
  static inject = ['ntUserApi']

  constructor(protected ctx: Context) {
    super(ctx, 'ntWebApi')
  }

  genBkn(key: string) {
    key = key || ''
    let hash = 5381
    for (let i = 0; i < key.length; i++) {
      const code = key.charCodeAt(i)
      hash = hash + (hash << 5) + code
    }
    return (hash & 0x7FFFFFFF).toString()
  }

  private cookieToString(cookieObject: Dict) {
    return Object.entries(cookieObject).map(([key, value]) => `${key}=${value}`).join('; ')
  }

  async getGroupHonorTalkative(groupCode: number, pSkey: string) {
    const cookie = `p_uin=o${selfInfo.uin}; p_skey=${pSkey}; uin=o${selfInfo.uin}`
    const bkn = this.genBkn(pSkey.substring(0, 10))
    const resp = await fetch(`https://qun.qq.com/cgi-bin/qunapp/honor_talkative?gc=${groupCode}&num=3000&bkn=${bkn}`, {
      headers: {
        'Cookie': cookie
      }
    })
    return await resp.json() as {
      cgicode: number
      retcode: number
      msg: string
      data: {
        current_talkative: {
          uin: number
          day_count: number
          avatar: string
          avatar_size: number
          nick: string
        } | null
        talkative_list: {
          uin: number
          update_ymd: number
          day_count: number
          day_count_history: number
          day_count_max: number
          avatar: string
          avatar_size: number
          nick: string
          honor_ids: number[]
          add_friend: number
        }[]
        talkative_amount: number
      }
    }
  }

  async getGroupHonorContinuous(groupCode: number, type: 2 | 3 | 5, pSkey: string) {
    const cookie = `p_uin=o${selfInfo.uin}; p_skey=${pSkey}; uin=o${selfInfo.uin}`
    const bkn = this.genBkn(pSkey.substring(0, 10))
    const resp = await fetch(`https://qun.qq.com/cgi-bin/qunapp/honor_continuous?gc=${groupCode}&num=3000&continuous_type=${type}&bkn=${bkn}`, {
      headers: {
        'Cookie': cookie
      }
    })
    return await resp.json() as {
      cgicode: number
      retcode: number
      msg: string
      data: {
        continuous_list: {
          uin: number
          day_count: number
          honor_ids: unknown[]
          avatar: string
          avatar_size: number
          nick: string
          add_friend: number
        }[]
        total: number
      }
    }
  }

  async getGroupHonorEmotion(groupCode: number, pSkey: string) {
    const cookie = `p_uin=o${selfInfo.uin}; p_skey=${pSkey}; uin=o${selfInfo.uin}`
    const bkn = this.genBkn(pSkey.substring(0, 10))
    const resp = await fetch(`https://qun.qq.com/cgi-bin/qunapp/honor_emotion?gc=${groupCode}&num=3000&bkn=${bkn}`, {
      headers: {
        'Cookie': cookie
      }
    })
    return await resp.json() as {
      cgicode: number
      retcode: number
      msg: string
      data: {
        emotion_list: {
          uin: number
          day_count: number
          avatar: string
          avatar_size: number
          nick: string
          add_friend: number
        }[]
        total: number
      }
    }
  }

  async batchDeleteGroupMember(groupCode: number, memberUinList: string[]) {
    const cookieObject = await this.getCookies('qun.qq.com')
    const bkn = this.genBkn(cookieObject.skey)
    const url = `https://qun.qq.com/cgi-bin/qun_mgr/delete_group_member?bkn=${bkn}&ts=${Date.now()}`
    const cookieStr = this.cookieToString(cookieObject)

    // 创建 FormData 对象
    const formData = new FormData()
    formData.append('gc', groupCode.toString())
    formData.append('ul', memberUinList.join('|'))
    formData.append('flag', '0')
    formData.append('bkn', bkn)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Cookie': cookieStr,
      },
      body: formData,
    })

    const responseText = await response.text()
    return JSON.parse(responseText)
    // if (result.retcode === 0) {
    //   this.ctx.logger.info(`成功删除群成员: ${memberUinList.join(', ')}`)
    //   return { success: true, message: '删除成功' }
    // } else {
    //   this.ctx.logger.error('删除群成员失败', result)
    //   return { success: false, message: result.msg || '删除失败' }
    // }
  }

  async getExpertInfo(uin: number) {
    const pSkey = (await this.ctx.ntUserApi.getPSkey(['vip.qq.com'])).get('vip.qq.com')!
    const bkn = this.genBkn(pSkey)
    const url = `https://cgi.vip.qq.com/card/getExpertInfo?ps_tk=${bkn}&fuin=${uin}&g_tk=${bkn}`
    const cookie = `p_uin=o${selfInfo.uin}; p_skey=${pSkey}; uin=o${selfInfo.uin}`
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Reqable/2.30.1',
        'Referer': 'https://cgi.vip.qq.com/',
        'Cookie': cookie,
      },
    })
    return await response.json() as {
      ret: number
      data: {
        m: number[]
        g: number[]
      }
      delay: number
      domainid: number
    }
  }

  async uploadGroupAlbum(groupCode: number, filePathList: string[], albumID: string) {
    const domain = 'h5.qzone.qq.com'
    const cookiesObject = await this.getCookies(domain)
    const gtk = this.genBkn(cookiesObject.skey)
    const errIndexList: number[] = []
    const fileLen = filePathList.length.toString()
    const iBatchID = Math.floor(Date.now() / 1000)
    for (let i = 0; i < filePathList.length; i++) {
      const filePath = filePathList[i]
      // 读取文件并计算 MD5
      const fileBuffer = await fs.readFile(filePath)
      const fileSize = fileBuffer.length
      const fileType = await fileTypeFromBuffer(fileBuffer)
      const timestamp = Math.floor(Date.now() / 1000)
      const isVideo = fileType?.mime.startsWith('video')

      let res
      if (isVideo) {
        const checksum = getSha1HexFromBuffer(fileBuffer)
        const getSessionUrl = `https://${domain}/webapp/json/sliceUpload/FileBatchControl/${checksum}?g_tk=${gtk}`
        const getSessionPostData = {
          'control_req': [{
            'uin': selfInfo.uin,
            'token': {
              'type': 4,
              'data': cookiesObject.p_skey,
              'appid': 5
            },
            'appid': 'video_qun',
            'checksum': checksum,
            'check_type': 1,
            'file_len': fileSize,
            'env': {
              'refer': 'qzone',
              'deviceInfo': 'h5'
            },
            'model': 0,
            'biz_req': {
              'sPicTitle': '',
              'sPicDesc': '',
              'sAlbumName': '',
              'sAlbumID': '',
              'iAlbumTypeID': 0,
              'iBitmap': 0,
              'iUploadType': 3,
              'iUpPicType': 0,
              'iBatchID': 0,
              'sPicPath': '',
              'iPicWidth': 0,
              'iPicHight': 0,
              'iWaterType': 0,
              'iDistinctUse': 0,
              'sTitle': '',
              'sDesc': '',
              'iFlag': 0,
              'iUploadTime': timestamp,
              'iPlayTime': 0,
              'sCoverUrl': '',
              'iIsNew': 111,
              'iIsOriginalVideo': 0,
              'iIsFormatF20': 0,
              'extend_info': {
                'video_type': '3',
                'domainid': '5',
                'photo_num': '0',
                'video_num': fileLen,
                'batch_num': fileLen,
                'qun_id': groupCode.toString()
              }
            },
            'session': '',
            'asy_upload': 0,
            'cmd': 'FileUploadVideo'
          }]
        }
        res = await HttpUtil.post(getSessionUrl, getSessionPostData, this.cookieToString(cookiesObject))
      } else {
        const checksum = getMd5HexFromBuffer(fileBuffer)
        const getSessionUrl = `https://${domain}/webapp/json/sliceUpload/FileBatchControl/${checksum}?g_tk=${gtk}`
        const getSessionPostData = {
          'control_req': [{
            'uin': selfInfo.uin,
            'token': {
              'type': 4,
              'data': cookiesObject.p_skey,
              'appid': 5,
            },
            'appid': 'qun',
            'checksum': checksum,
            'check_type': 0,
            'file_len': fileSize,
            'env': { 'refer': 'qzone', 'deviceInfo': 'h5' },
            'model': 0,
            'biz_req': {
              'sPicTitle': '',
              'sPicDesc': '',
              // 'sAlbumName': albumName,
              'sAlbumName': '',
              'sAlbumID': albumID,
              'iAlbumTypeID': 0,
              'iBitmap': 0,
              'iUploadType': 0,
              'iUpPicType': 0,
              'iBatchID': iBatchID,
              'sPicPath': '',
              'iPicWidth': 0,
              'iPicHight': 0,
              'iWaterType': 0,
              'iDistinctUse': 0,
              'iNeedFeeds': 1,
              'iUploadTime': timestamp,
              'mapExt': { 'appid': 'qun', 'userid': groupCode.toString() },
              'stExtendInfo': {
                'mapParams': {
                  'photo_num': fileLen,
                  'video_num': '0',
                  'batch_num': fileLen,
                },
              },
              'mutliPicInfo': {
                'iBatUploadNum': fileLen,
                'iCurUpload': i,
                'iSuccNum': 0,
                'iFailNum': 0,
              },
            },
            'session': '',
            'asy_upload': 0,
            'cmd': 'FileUpload',
          }],
        }
        res = await HttpUtil.post(getSessionUrl, getSessionPostData, this.cookieToString(cookiesObject))
      }

      const resJson: {
        ret: number,
        msg: string
        data: {
          session: string,
          slice_size: number
        }
      } = await res.json()

      if (resJson.ret !== 0) {
        this.ctx.logger.error(`获取群相册上传 session 失败: ${resJson.msg}`)
        errIndexList.push(i)
        continue
      }

      const sliceSize = resJson.data.slice_size
      // 分片上传文件 - 并发上传
      let offset = 0
      let seq = 1
      const concurrency = 10
      let sVid

      // 并发上传函数
      const uploadSlice = async (slice: {
        offset: number,
        end: number,
        seq: number,
        chunk: Buffer,
        isVideo: boolean,
        sessionId: string,
        sliceSize: string
      }) => {
        const cmd = slice.isVideo ? 'FileUploadVideo' : 'FileUpload'
        const uploadUrl = `https://${domain}/webapp/json/sliceUpload/${cmd}?seq=${slice.seq}&retry=0&offset=${slice.offset}&end=${slice.end}&total=${fileSize}&type=form&g_tk=${gtk}`

        const formData = new FormData()
        formData.append('uin', selfInfo.uin)
        formData.append('appid', slice.isVideo ? 'video_qun' : 'qun')
        formData.append('data', new Blob([Uint8Array.from(slice.chunk)]))
        formData.append('session', slice.sessionId)
        formData.append('offset', slice.offset.toString())
        formData.append('checksum', '')
        formData.append('check_type', '0')
        formData.append('retry', '0')
        formData.append('seq', slice.seq.toString())
        formData.append('end', slice.end.toString())
        formData.append('cmd', cmd)
        formData.append('slice_size', slice.sliceSize)
        formData.append('biz_req.iUploadType', '0')

        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Cookie': this.cookieToString(cookiesObject),
          },
          body: formData,
        })

        const uploadResJson = await uploadRes.json()
        if (uploadResJson.ret !== 0) {
          if (!errIndexList.includes(i)) {
            errIndexList.push(i)
          }
          throw new Error(`群相册分片上传失败 (seq: ${slice.seq}): ${uploadResJson.msg}, file: ${filePath}`)
        } else if (uploadResJson.data.biz.sVid) {
          sVid = uploadResJson.data.biz.sVid
        }
      }

      // 生成所有分片任务
      const slices: Array<{
        offset: number,
        end: number,
        seq: number,
        chunk: Buffer,
        isVideo: boolean,
        sessionId: string,
        sliceSize: string
      }> = []
      while (offset < fileSize) {
        const end = Math.min(offset + sliceSize, fileSize)
        const chunk = fileBuffer.subarray(offset, end)
        slices.push({
          offset,
          end,
          seq,
          chunk,
          isVideo: !!isVideo,
          sessionId: resJson.data.session,
          sliceSize: sliceSize.toString()
        })
        offset = end
        seq++
      }

      // 使用并发控制上传
      for (let i = 0; i < slices.length; i += concurrency) {
        const batch = slices.slice(i, i + concurrency)
        try {
          await Promise.all(batch.map(slice => uploadSlice(slice)))
        } catch (e) {
          this.ctx.logger.error(e)
        }
      }

      if (sVid) {
        const filePath = await createThumb(this.ctx, filePathList[i])
        // 读取文件并计算 MD5
        const fileBuffer = await fs.readFile(filePath)
        const fileSize = fileBuffer.length
        const timestamp = Math.floor(Date.now() / 1000)

        const checksum = getMd5HexFromBuffer(fileBuffer)
        const getSessionUrl = `https://${domain}/webapp/json/sliceUpload/FileBatchControl/${checksum}?g_tk=${gtk}`
        const getSessionPostData = {
          'control_req': [{
            'uin': selfInfo.uin,
            'token': {
              'type': 4,
              'data': cookiesObject.p_skey,
              'appid': 5
            },
            'appid': 'qun',
            'checksum': checksum,
            'check_type': 0,
            'file_len': fileSize,
            'env': {
              'refer': 'huodong',
              'deviceInfo': 'h5'
            },
            'model': 0,
            'biz_req': {
              'sPicTitle': '',
              'sPicDesc': '',
              'sAlbumName': '',
              'sAlbumID': albumID,
              'iAlbumTypeID': 0,
              'iBitmap': 0,
              'iUploadType': 2,
              'iUpPicType': 0,
              'iBatchID': iBatchID,
              'sPicPath': '',
              'iPicWidth': 0,
              'iPicHight': 0,
              'iWaterType': 0,
              'iDistinctUse': 0,
              'mutliPicInfo': {
                'iBatUploadNum': fileLen,
                'iCurUpload': i,
                'iSuccNum': 0,
                'iFailNum': 0
              },
              'iNeedFeeds': 1,
              'iUploadTime': timestamp,
              'stExtendInfo': {
                'mapParams': {
                  'vid': sVid,
                  'photo_num': '0',
                  'video_num': fileLen,
                  'batch_num': fileLen
                }
              },
              'stExternalMapExt': {
                'is_client_upload_cover': '1',
                'is_pic_video_mix_feeds': '1'
              },
              'mapExt': {
                'appid': 'qun',
                'userid': groupCode.toString()
              },
              'sExif_CameraMaker': '',
              'sExif_CameraModel': '',
              'sExif_Time': '',
              'sExif_LatitudeRef': '',
              'sExif_Latitude': '',
              'sExif_LongitudeRef': '',
              'sExif_Longitude': ''
            },
            'session': '',
            'asy_upload': 0
          }]
        }
        const res = await HttpUtil.post(getSessionUrl, getSessionPostData, this.cookieToString(cookiesObject))

        const resJson: {
          ret: number,
          msg: string
          data: {
            session: string,
            slice_size: number
          }
        } = await res.json()

        if (resJson.ret !== 0) {
          this.ctx.logger.error(`获取群相册上传 session 失败: ${resJson.msg}`)
          errIndexList.push(i)
          continue
        }

        const sliceSize = resJson.data.slice_size
        // 分片上传文件 - 并发上传
        let offset = 0
        let seq = 1
        const concurrency = 10

        // 生成所有分片任务
        const slices: Array<{
          offset: number,
          end: number,
          seq: number,
          chunk: Buffer,
          isVideo: boolean,
          sessionId: string,
          sliceSize: string
        }> = []
        while (offset < fileSize) {
          const end = Math.min(offset + sliceSize, fileSize)
          const chunk = fileBuffer.subarray(offset, end)
          slices.push({
            offset,
            end,
            seq,
            chunk,
            isVideo: false,
            sessionId: resJson.data.session,
            sliceSize: sliceSize.toString()
          })
          offset = end
          seq++
        }

        // 使用并发控制上传
        for (let i = 0; i < slices.length; i += concurrency) {
          const batch = slices.slice(i, i + concurrency)
          try {
            await Promise.all(batch.map(slice => uploadSlice(slice)))
          } catch (e) {
            this.ctx.logger.error(e)
          }
        }
      }
    }
    this.ctx.logger.info('群相册上传完成')
    return {
      success_count: filePathList.length - errIndexList.length,
      fail_count: errIndexList.length,
      fail_indexes: errIndexList,
    }
  }

  async publishGroupBulletin(
    groupCode: number,
    text: string,
    pinned: number,
    type: number,
    isShowEditCard: number,
    tipWindowType: number,
    confirmRequired: number,
    picId?: string,
    imgWidth?: number,
    imgHeight?: number
  ) {
    const cookieObject = await this.getCookies('qun.qq.com')
    const bkn = this.genBkn(cookieObject.skey)

    const picInfo = {
      pic: picId,
      imgWidth: imgWidth?.toString(),
      imgHeight: imgHeight?.toString()
    }

    const url = type === 20 ? 'https://web.qun.qq.com/cgi-bin/announce/add_qun_instruction' : 'https://web.qun.qq.com/cgi-bin/announce/add_qun_notice'
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': this.cookieToString(cookieObject)
      },
      body: new URLSearchParams({
        qid: groupCode.toString(),
        bkn,
        text,
        pinned: pinned.toString(),
        type: type.toString(),
        settings: JSON.stringify({
          is_show_edit_card: isShowEditCard,
          tip_window_type: tipWindowType,
          confirm_required: confirmRequired,
        }),
        ...(picId ? picInfo : {})
      })
    })

    if (!res.ok) {
      throw new Error(`HTTP error! Status: ${res.status}`)
    }

    return await res.json()
  }

  /** 拉群公告列表 — web.qun.qq.com/cgi-bin/announce/list_announce */
  async getGroupBulletinList(groupCode: number) {
    const cookieObject = await this.getCookies('qun.qq.com')
    const bkn = this.genBkn(cookieObject.skey)
    const url = `https://web.qun.qq.com/cgi-bin/announce/list_announce?qid=${groupCode}&bkn=${bkn}&ft=23&s=-1&n=20&ni=1&i=1`
    const res = await fetch(url, { method: 'GET', headers: { 'Cookie': this.cookieToString(cookieObject) } })
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`)
    return await res.json() as {
      ec: number
      em: string
      ltsm: number
      srv_code: number
      read_only: number
      role: number
      // 没有未读公告时 server 不下发该字段，所以是 optional
      inst?: {
        u: number
        fid: string
        pubt: number
        msg: {
          text: string
          text_face: string
          pics?: {
            id: string
            w: string
            h: string
          }[]
          title: string
        }
        type: number
        fn: number
        cn: number
        vn: number
        settings: {
          is_show_edit_card: number
          remind_ts: number
          tip_window_type: number
          confirm_required: number
        }
        pinned: number
        read_num: number
        is_read: number
        is_all_confirm: number
      }[]
      // 群没公告时 server 不下发 feeds 字段，所以是 optional
      feeds?: {
        u: number
        fid: string
        pubt: number
        msg: {
          text: string
          text_face: string
          pics?: {
            id: string
            w: string
            h: string
          }[]
          title: string
        }
        type: number
        fn: number
        cn: number
        vn: number
        settings: {
          is_show_edit_card: number
          remind_ts: number
          tip_window_type: number
          confirm_required: number
        }
        pinned: number
        read_num: number
        is_read: number
        is_all_confirm: number
      }[]
      group: {
        group_id: number
        class_ext: number
      }
      sta: number
      gln: number
      tst: number
      ui: Record<string, {
        n: string
        f: string
      }>
      server_time: number
      svrt: number
      next_index: unknown
      jointime: number
    }
  }

  /** 删群公告 — web.qun.qq.com/cgi-bin/announce/del_feed */
  async deleteGroupBulletin(groupCode: number, feedId: string) {
    const cookieObject = await this.getCookies('qun.qq.com')
    const bkn = this.genBkn(cookieObject.skey)
    const res = await fetch('https://web.qun.qq.com/cgi-bin/announce/del_feed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': this.cookieToString(cookieObject),
      },
      body: new URLSearchParams({ qid: groupCode.toString(), bkn, fid: feedId }),
    })
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`)
    return await res.json()
  }

  async getGroupBulletinUnread(groupCode: number, feedId: string, type: 0 | 1) {
    const cookie = await this.ctx.ntWebApi.getCookies('qun.qq.com')
    const cookieStr = this.cookieToString(cookie)
    const bkn = this.genBkn(cookie.skey)
    const users: {
      uin: number
      avatar: string
      face_flag: number
      display_name: string
    }[] = []
    let start = 0
    while (true) {
      const res = await fetch(`https://qun.qq.com/cgi-bin/qunapp/announce_unread?bkn=${bkn}`, {
        method: 'POST',
        headers: {
          'Cookie': cookieStr,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          start: start.toString(),
          num: '50',
          type: type.toString(),
          bkn,
          feed_id: feedId,
          gc: groupCode.toString()
        })
      })
      const data: {
        cgicode: number
        retcode: number
        msg: string
        data: {
          users: {
            uin: number
            avatar: string
            face_flag: number
            display_name: string
          }[]
          read_total: number
          unread_total: number
        }
      } = await res.json()
      if (data.retcode !== 0) {
        throw new Error(data.msg)
      }
      users.push(...data.data.users)
      const total = type === 1 ? data.data.read_total : data.data.unread_total
      if (users.length >= total) break
      start = users.length
    }
    return users
  }

  /** 拉群精华消息 — qun.qq.com/cgi-bin/group_digest/digest_list */
  async getGroupEssenceList(groupCode: number, pageStart = 0, pageLimit = 20) {
    const cookieObject = await this.getCookies('qun.qq.com')
    const bkn = this.genBkn(cookieObject.skey)
    const url = `https://qun.qq.com/cgi-bin/group_digest/digest_list?bkn=${bkn}&group_code=${groupCode}&page_start=${pageStart}&page_limit=${pageLimit}`
    const res = await fetch(url, { method: 'GET', headers: { 'Cookie': this.cookieToString(cookieObject) } })
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`)
    return await res.json() as {
      retcode: number
      retmsg: string
      data: {
        msg_list: {
          group_code: string
          msg_seq: number
          msg_random: number
          sender_uin: string
          sender_nick: string
          sender_time: number
          add_digest_uin: string
          add_digest_nick: string
          add_digest_time: number
          msg_content: {
            msg_type: number
            text?: string
            image_url?: string
            image_thumbnail_url?: string
          }[]
          can_be_removed: boolean
          disable_forward: boolean
        }[]
        is_end: boolean
        group_role: number
        config_page_url: string
      }
    }
  }

  /** 上传群公告图片 — web.qun.qq.com/cgi-bin/announce/upload_img */
  async uploadGroupBulletinPic(groupCode: number, filePath: string) {
    const cookieObject = await this.getCookies('qun.qq.com')
    const bkn = this.genBkn(cookieObject.skey)
    const buf = await fs.readFile(filePath)
    const ft = await fileTypeFromBuffer(buf)
    const formData = new FormData()
    formData.append('bkn', bkn)
    formData.append('qid', groupCode.toString())
    formData.append('pic_up', new Blob([new Uint8Array(buf)], { type: ft?.mime || 'image/png' }), `pic.${ft?.ext || 'png'}`)
    const res = await fetch('https://web.qun.qq.com/cgi-bin/announce/upload_img', {
      method: 'POST',
      headers: { 'Cookie': this.cookieToString(cookieObject) },
      body: formData,
    })
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`)
    const data = await res.json()
    if (data.ec !== 0) {
      return {
        errCode: data.ec,
        errMsg: data.em,
        picInfo: { id: '', width: 0, height: 0 }
      }
    }
    // data.id is HTML-escaped JSON string: {"h":"147","id":"...","w":"147"}
    const decoded = data.id.replace(/&quot;/g, '"')
    const info = JSON.parse(decoded) as { h: string, id: string, w: string }
    return {
      errCode: 0,
      errMsg: '',
      picInfo: { id: info.id, width: +info.w, height: +info.h },
    }
  }

  async getDaySignedList(groupCode: number) {
    const pSkey = (await this.ctx.ntUserApi.getPSkey(['qun.qq.com'])).get('qun.qq.com')!
    const cookie = `p_uin=o${selfInfo.uin}; p_skey=${pSkey}; uin=o${selfInfo.uin}`
    const res = await fetch(`https://qun.qq.com/v2/signin/trpc/GetDaySignedList?g_tk=${this.genBkn(pSkey)}`, {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dayYmd: formatYYYYMMDD(),
        offset: 0,
        limit: 100,
        uid: selfInfo.uin,
        groupId: groupCode.toString()
      }),
    })
    return await res.json() as {
      retCode: number,
      costTime: number,
      response: {
        ret?: {
          code: string,
          msg: string
        },
        page?: {
          infos?: {
            uid: string,
            uidGroupNick: string,
            signedTimeStamp: string,
            signInRank: number
          }[],
          offset: number,
          total: number
        }[]
      },
      funcCode: number
    }
  }

  async getCookies(domain: string) {
    const clientKeyData = await this.ctx.ntUserApi.getClientKey()
    const uin = selfInfo.uin
    const requestUrl = 'https://ssl.ptlogin2.qq.com/jump?ptlang=1033&clientuin=' + uin + '&clientkey=' + clientKeyData.clientKey + '&u1=https%3A%2F%2F' + domain + '%2F' + uin + '%2Finfocenter&keyindex=19%27'
    const cookies: { [key: string]: string } = await HttpUtil.getCookies(requestUrl)
    return cookies
  }
}
