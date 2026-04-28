import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { unlink } from 'fs/promises'
import { uri2local, parseBool } from '@/common/utils'
import { noop } from 'cosmokit'

interface Payload {
  group_id: number | string
  content: string
  image?: string
  pinned: boolean
  confirm_required: boolean
  is_show_edit_card: boolean
  tip_window: boolean
  send_new_member: boolean
}

export class SendGroupNotice extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_SendGroupNotice
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    content: Schema.string().required(),
    image: Schema.string(),
    pinned: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false),
    confirm_required: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(true),
    is_show_edit_card: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false),
    tip_window: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false),
    send_new_member: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false)
  })

  async _handle(payload: Payload) {
    const groupCode = payload.group_id.toString()

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
        unlink(path).catch(noop)
      }
      picInfo = result.picInfo
    }

    const res = await this.ctx.ntWebApi.publishGroupBulletin(
      groupCode,
      payload.content,
      +payload.pinned,
      payload.send_new_member ? 20 : 1,
      +payload.is_show_edit_card,
      +!payload.tip_window,
      +payload.confirm_required,
      picInfo?.id,
      picInfo?.width,
      picInfo?.height
    )
    if (res.ec !== 0) {
      throw new Error(`设置群公告失败, 错误信息: ${res.em}`)
    }
    return null
  }
}
