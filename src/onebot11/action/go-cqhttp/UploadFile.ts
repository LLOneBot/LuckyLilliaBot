import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'
import { SendElementEntities } from '@/ntqqapi/entities'
import { uri2local } from '@/common/utils'
import { sendMsg, createPeer, CreatePeerMode } from '../../helper/createMessage'

interface UploadGroupFilePayload {
  group_id: number | string
  file: string
  name: string
  folder?: string
  folder_id?: string
}

export class UploadGroupFile extends BaseAction<UploadGroupFilePayload, null> {
  actionName = ActionName.GoCQHTTP_UploadGroupFile

  protected async _handle(payload: UploadGroupFilePayload): Promise<null> {
    const { success, errMsg, path, fileName } = await uri2local(payload.file)
    if (!success) {
      throw new Error(errMsg)
    }
    const file = await SendElementEntities.file(this.ctx, path, payload.name || fileName, payload.folder ?? payload.folder_id)
    const peer = await createPeer(this.ctx, payload, CreatePeerMode.Group)
    await sendMsg(this.ctx, peer, [file], [])
    return null
  }
}

interface UploadPrivateFilePayload {
  user_id: number | string
  file: string
  name: string
}

export class UploadPrivateFile extends BaseAction<UploadPrivateFilePayload, null> {
  actionName = ActionName.GoCQHTTP_UploadPrivateFile

  protected async _handle(payload: UploadPrivateFilePayload): Promise<null> {
    const { success, errMsg, path, fileName } = await uri2local(payload.file)
    if (!success) {
      throw new Error(errMsg)
    }
    const sendFileEle = await SendElementEntities.file(this.ctx, path, payload.name || fileName)
    const peer = await createPeer(this.ctx, payload, CreatePeerMode.Private)
    await sendMsg(this.ctx, peer, [sendFileEle], [])
    return null
  }
}
