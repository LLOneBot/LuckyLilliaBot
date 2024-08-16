import BaseAction from '../BaseAction'
import fsPromise from 'node:fs/promises'
import { getConfigUtil } from '@/common/config'
import { NTQQFileApi, NTQQGroupApi, NTQQUserApi, NTQQFriendApi, NTQQMsgApi } from '@/ntqqapi/api'
import { ActionName } from '../types'
import { UUIDConverter } from '@/common/utils/helper'
import { Peer, ChatType, ElementType } from '@/ntqqapi/types'
import { MessageUnique } from '@/common/utils/MessageUnique'

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
  // forked from https://github.com/NapNeko/NapCatQQ/blob/6f6b258f22d7563f15d84e7172c4d4cbb547f47e/src/onebot11/action/file/GetFile.ts#L44
  protected async _handle(payload: GetFilePayload): Promise<GetFileResponse> {
    const { enableLocalFile2Url } = getConfigUtil().getConfig()

    let fileCache = await MessageUnique.getFileCacheById(String(payload.file))
    if (!fileCache?.length) {
      fileCache = await MessageUnique.getFileCacheByName(String(payload.file))
    }

    if (fileCache?.length) {
      const downloadPath = await NTQQFileApi.downloadMedia(
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
        const msgList = await NTQQMsgApi.getMsgsByMsgId(peer, [fileCache[0].msgId])
        if (msgList.msgList.length === 0) {
          throw new Error('msg not found')
        }
        const msg = msgList.msgList[0]
        const findEle = msg.elements.find(e => e.elementId === fileCache[0].elementId)
        if (!findEle) {
          throw new Error('element not found')
        }
        res.url = await NTQQFileApi.getImageUrl(findEle.picElement)
      } else if (fileCache[0].elementType === ElementType.VIDEO) {
        res.url = await NTQQFileApi.getVideoUrl(peer, fileCache[0].msgId, fileCache[0].elementId)
      }
      if (enableLocalFile2Url && downloadPath && res.file === res.url) {
        try {
          res.base64 = await fsPromise.readFile(downloadPath, 'base64')
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

  protected async _handle(payload: { file_id: string; file: string }): Promise<GetFileResponse> {
    if (!payload.file_id) {
      throw new Error('file_id 不能为空')
    }
    payload.file = payload.file_id
    return super._handle(payload)
  }
}
