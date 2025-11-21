import { unlink } from 'node:fs/promises'
import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { checkFileReceived, uri2local } from '@/common/utils/file'

interface Payload {
  file: string
}

export default class SetQQAvatar extends BaseAction<Payload, null> {
  actionName = ActionName.SetQQAvatar
  payloadSchema = Schema.object({
    file: Schema.string().required()
  })

  protected async _handle(payload: Payload) {
    const { path, isLocal, errMsg } = await uri2local(this.ctx, payload.file)
    if (errMsg) {
      throw new Error(errMsg)
    }
    if (path) {
      await checkFileReceived(path, 5000) // 文件不存在QQ会崩溃，需要提前判断
      const ret = await this.ctx.ntUserApi.setSelfAvatar(path)
      if (!isLocal) {
        unlink(path).then().catch(err => { })
      }
      if (!ret) {
        throw new Error(`头像${payload.file}设置失败，API无返回`)
      }
      if ((ret.result as number) === 1004022) {
        throw new Error(`头像${payload.file}设置失败，文件可能不是图片格式`)
      } else if (ret.result !== 0) {
        throw new Error(`头像${payload.file}设置失败，未知的错误，${ret.result}:${ret.errMsg}`)
      }
    } else {
      throw new Error(`头像${payload.file}设置失败，无法获取头像，文件可能不存在`)
    }
    return null
  }
}
