import { BaseAction, Schema } from '../BaseAction'
import { readFile } from 'node:fs/promises'
import { ActionName } from '../types'
import { Peer, ElementType } from '@/ntqqapi/types'
import { MessageUnique } from '@/common/utils/messageUnique'

export interface GetFilePayload {
  file: string // 文件名或者fileUuid
}

export interface GetFileResponse {
  file?: string // path
  url?: string
  file_size?: string
  file_name?: string
  base64?: string
}

export abstract class GetFileBase extends BaseAction<GetFilePayload, GetFileResponse> {
  payloadSchema = Schema.object({
    file: Schema.string().required()
  })

  protected async _handle(payload: GetFilePayload): Promise<GetFileResponse> {
    const { enableLocalFile2Url } = this.adapter.config

    let fileCache = await MessageUnique.getFileCacheById(payload.file)
    if (!fileCache?.length) {
      fileCache = await MessageUnique.getFileCacheByName(payload.file)
    }

    if (fileCache?.length) {
      const downloadPath = await this.ctx.ntFileApi.downloadMedia(
        fileCache[0].msgId,
        fileCache[0].chatType,
        fileCache[0].peerUid,
        fileCache[0].elementId,
        '',
        ''
      )
      const res: GetFileResponse = {
        file: downloadPath,
        url: downloadPath,
        file_size: fileCache[0].fileSize,
        file_name: fileCache[0].fileName,
      }
      const peer: Peer = {
        chatType: fileCache[0].chatType,
        peerUid: fileCache[0].peerUid,
        guildId: ''
      }
      if (fileCache[0].elementType === ElementType.PIC) {
        const msgList = await this.ctx.ntMsgApi.getMsgsByMsgId(peer, [fileCache[0].msgId])
        if (msgList.msgList.length === 0) {
          throw new Error('msg not found')
        }
        const msg = msgList.msgList[0]
        const findEle = msg.elements.find(e => e.elementId === fileCache[0].elementId)
        if (!findEle) {
          throw new Error('element not found')
        }
        res.url = await this.ctx.ntFileApi.getImageUrl(findEle.picElement)
      } else if (fileCache[0].elementType === ElementType.VIDEO) {
        res.url = await this.ctx.ntFileApi.getVideoUrl(peer, fileCache[0].msgId, fileCache[0].elementId)
      }
      if (enableLocalFile2Url && downloadPath && (res.file === res.url || res.url === undefined)) {
        try {
          res.base64 = await readFile(downloadPath, 'base64')
        } catch (e) {
          throw new Error('文件下载失败. ' + e)
        }
      }
      //不手动删除？文件持久化了
      return res
    }
    throw new Error('file not found')
  }
}

export default class GetFile extends GetFileBase {
  actionName = ActionName.GetFile
  payloadSchema = Schema.object({
    file: Schema.string(),
    file_id: Schema.string().required()
  })

  protected async _handle(payload: { file_id: string, file: string }): Promise<GetFileResponse> {
    payload.file = payload.file_id
    return super._handle(payload)
  }
}
