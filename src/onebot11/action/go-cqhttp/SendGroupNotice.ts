import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { unlink } from 'fs/promises'
import { uri2local, parseBool } from '@/common/utils'

interface Payload {
  group_id: number | string
  content: string
  image?: string
  pinned: boolean //扩展
  confirm_required: boolean //扩展
}

export class SendGroupNotice extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_SendGroupNotice
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    content: Schema.string().required(),
    image: Schema.string(),
    pinned: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false),
    confirm_required: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(true)
  })

  async _handle(payload: Payload) {
    const groupCode = payload.group_id.toString()
    const pinned = +payload.pinned
    const confirmRequired = +payload.confirm_required

    let picInfo: { id: string, width: number, height: number } | undefined
    if (payload.image) {
      const { path, isLocal, success, errMsg } = await uri2local(this.ctx, payload.image, true)
      if (!success) {
        throw new Error(`获取图片文件失败, 错误信息: ${errMsg}`)
      }
      const result = await this.ctx.ntGroupApi.uploadGroupBulletinPic(groupCode, path)
      if (result.errCode !== 0) {
        throw new Error(`上传群公告图片失败, 错误信息: ${result.errMsg}`)
      }
      if (!isLocal) {
        unlink(path).catch(e => { })
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
