import fs from 'node:fs'
import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { SendElementEntities } from '@/ntqqapi/entities'
import { SendFileElement } from '@/ntqqapi/types'
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
    let file = payload.file
    if (fs.existsSync(file)) {
      file = `file://${file}`
    }
    const downloadResult = await uri2local(file)
    if (!downloadResult.success) {
      throw new Error(downloadResult.errMsg)
    }
    const sendFileEle = await SendElementEntities.file(this.ctx, downloadResult.path, payload.name, payload.folder_id)
    const peer = await createPeer(this.ctx, payload, CreatePeerMode.Group)
    await sendMsg(this.ctx, peer, [sendFileEle], [])
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
    const peer = await createPeer(this.ctx, payload, CreatePeerMode.Private)
    let file = payload.file
    if (fs.existsSync(file)) {
      file = `file://${file}`
    }
    const downloadResult = await uri2local(file)
    if (!downloadResult.success) {
      throw new Error(downloadResult.errMsg)
    }
    const sendFileEle: SendFileElement = await SendElementEntities.file(this.ctx, downloadResult.path, payload.name)
    await sendMsg(this.ctx, peer, [sendFileEle], [])
    return null
  }
}
