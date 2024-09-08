import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { unlink } from 'fs/promises'
import { checkFileReceived, uri2local } from '@/common/utils/file'

interface Payload {
  group_id: number | string
  content: string
  image?: string
  pinned?: number | string //扩展
  confirm_required?: number | string //扩展
}

export class SendGroupNotice extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_SendGroupNotice

  async _handle(payload: Payload) {
    if(!payload.content){
      throw new Error('参数 content 不能为空')
    }
    const groupCode = payload.group_id.toString()
    const pinned = Number(payload.pinned ?? 0)
    const confirmRequired = Number(payload.confirm_required ?? 1)

    let picInfo: { id: string, width: number, height: number } | undefined
    if (payload.image) {
      const { path, isLocal, success, errMsg } = await uri2local(payload.image, undefined, true)
      if (!success) {
        throw new Error(`设置群公告失败, 错误信息: uri2local: ${errMsg}`)
      }
      await checkFileReceived(path, 5000) // 文件不存在QQ会崩溃，需要提前判断
      const result = await this.ctx.ntGroupApi.uploadGroupBulletinPic(groupCode, path)
      if (result.errCode !== 0) {
        throw new Error(`设置群公告失败, 错误信息: uploadGroupBulletinPic: ${result.errMsg}`)
      }
      if (!isLocal) {
        unlink(path)
      }
      picInfo = result.picInfo
    }

    const res = await this.ctx.ntGroupApi.publishGroupBulletin(groupCode, {
      text: encodeURIComponent(payload.content),
      oldFeedsId: '',
      pinned,
      confirmRequired,
      picInfo
    })
    if (res.result !== 0) {
      throw new Error(`设置群公告失败, 错误信息: ${res.errMsg}`)
    }
    return null
  }
}