import { unlink } from 'node:fs/promises'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { uri2local } from '@/common/utils'
import { noop } from 'cosmokit'

interface Payload {
  group_id: number | string
  file: string
  name: string
  folder?: string
  folder_id?: string
}

interface Response {
  file_id: string
}

export class UploadGroupFile extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_UploadGroupFile
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    file: Schema.string().required(),
    name: Schema.string(),
    folder: Schema.string(),
    folder_id: Schema.string()
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
    const info = await this.ctx.ntFileApi.uploadGroupFile(+payload.group_id, path, name, payload.folder ?? payload.folder_id)
    if (!isLocal) {
      unlink(path).catch(noop)
    }
    const result = await this.ctx.ntMsgApi.sendGroupFileMessage(+payload.group_id, info.fileId)
    if (result.retCode !== 0) {
      throw new Error(result.retMsg)
    }
    return {
      file_id: info.fileId
    }
  }
}
