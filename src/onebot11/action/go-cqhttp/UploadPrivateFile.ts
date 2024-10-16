import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { SendElement } from '@/ntqqapi/entities'
import { uri2local } from '@/common/utils'
import { sendMsg, createPeer, CreatePeerMode } from '../../helper/createMessage'

interface UploadPrivateFilePayload {
  user_id: number | string
  file: string
  name: string
}

export class UploadPrivateFile extends BaseAction<UploadPrivateFilePayload, null> {
  actionName = ActionName.GoCQHTTP_UploadPrivateFile
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required(),
    file: Schema.string().required(),
    name: Schema.string()
  })

  protected async _handle(payload: UploadPrivateFilePayload): Promise<null> {
    const { success, errMsg, path, fileName } = await uri2local(this.ctx, payload.file)
    if (!success) {
      throw new Error(errMsg)
    }
    const name = payload.name || fileName
    if (name.includes('/') || name.includes('\\')) {
      throw new Error(`文件名 ${name} 不合法`)
    }
    const sendFileEle = await SendElement.file(this.ctx, path, name)
    const peer = await createPeer(this.ctx, payload, CreatePeerMode.Private)
    await sendMsg(this.ctx, peer, [sendFileEle], [])
    return null
  }
}
