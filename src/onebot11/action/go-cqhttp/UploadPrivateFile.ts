import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { uri2local } from '@/common/utils'
import { unlink } from 'node:fs/promises'
import { noop } from 'cosmokit'
import { ChatType } from '@/ntqqapi/types'

interface Payload {
  user_id: number | string
  file: string
  name: string
}

interface Response {
  file_id: string
}

export class UploadPrivateFile extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_UploadPrivateFile
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required(),
    file: Schema.string().required(),
    name: Schema.string()
  })

  protected async _handle(payload: Payload) {
    const { success, errMsg, path, fileName, isLocal } = await uri2local(this.ctx, payload.file)
    if (!success) {
      throw new Error(errMsg)
    }
    const name = payload.name || fileName
    if (name.includes('/') || name.includes('\\')) {
      throw new Error(`文件名 ${name} 不合法`)
    }
    const uid = await this.ctx.ntUserApi.getUidByUin(+payload.user_id)
    if (!uid) {
      throw new Error('无法获取用户信息')
    }
    const info = await this.ctx.ntFileApi.uploadPrivateFile(ChatType.C2C, uid, path, name)
    if (!isLocal) {
      unlink(path).catch(noop)
    }
    const result = await this.ctx.ntMsgApi.sendPrivateFileMessage({
      toUin: +payload.user_id,
      toUid: uid,
      fileUuid: info.fileId,
      fileName: name,
      fileSize: info.fileSize,
      file10MMd5: info.file10MMd5,
      crcMedia: info.crcMedia,
    })
    if (result.resultCode !== 0) {
      throw new Error(result.errMsg ?? '')
    }
    return {
      file_id: info.fileId
    }
  }
}
