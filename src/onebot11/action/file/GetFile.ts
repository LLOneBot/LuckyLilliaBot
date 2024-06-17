import BaseAction from '../BaseAction'
import fs from 'fs/promises'
import { dbUtil } from '@/common/db'
import { getConfigUtil } from '@/common/config'
import { checkFileReceived, log, sleep, uri2local } from '@/common/utils'
import { NTQQFileApi } from '@/ntqqapi/api'
import { ActionName } from '../types'
import { FileElement, RawMessage, VideoElement } from '@/ntqqapi/types'
import { FileCache } from '@/common/types'

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

export class GetFileBase extends BaseAction<GetFilePayload, GetFileResponse> {
  private getElement(msg: RawMessage, elementId: string): VideoElement | FileElement {
    let element = msg.elements.find((e) => e.elementId === elementId)
    if (!element) {
      throw new Error('element not found')
    }
    return element.fileElement
  }
  private async download(cache: FileCache, file: string) {
    log('需要调用 NTQQ 下载文件api')
    if (cache.msgId) {
      let msg = await dbUtil.getMsgByLongId(cache.msgId)
      if (msg) {
        log('找到了文件 msg', msg)
        let element = this.getElement(msg, cache.elementId)
        log('找到了文件 element', element)
        // 构建下载函数
        await NTQQFileApi.downloadMedia(msg.msgId, msg.chatType, msg.peerUid, cache.elementId, '', '', true)
        // 等待文件下载完成
        msg = await dbUtil.getMsgByLongId(cache.msgId)
        log('下载完成后的msg', msg)
        cache.filePath = this.getElement(msg, cache.elementId).filePath
        await checkFileReceived(cache.filePath, 10 * 1000)
        dbUtil.addFileCache(file, cache).then()
      }
    }
  }
  protected async _handle(payload: GetFilePayload): Promise<GetFileResponse> {
    let cache = await dbUtil.getFileCache(payload.file)
    if (!cache) {
      throw new Error('file not found')
    }
    const { autoDeleteFile, enableLocalFile2Url, autoDeleteFileSecond } = getConfigUtil().getConfig()
    if (cache.downloadFunc) {
      await cache.downloadFunc()
    }
    try {
      await fs.access(cache.filePath, fs.constants.F_OK)
    } catch (e) {
      // log("file not found", e)
      if (cache.url) {
        const downloadResult = await uri2local(cache.url)
        if (downloadResult.success) {
          cache.filePath = downloadResult.path
          dbUtil.addFileCache(payload.file, cache).then()
        } else {
          await this.download(cache, payload.file)
        }
      } else {
        // 没有url的可能是私聊文件或者群文件，需要自己下载
        await this.download(cache, payload.file)
      }
    }
    let res: GetFileResponse = {
      file: cache.filePath,
      url: cache.url,
      file_size: cache.fileSize,
      file_name: cache.fileName,
    }
    if (enableLocalFile2Url) {
      if (!cache.url) {
        try {
          res.base64 = await fs.readFile(cache.filePath, 'base64')
        } catch (e) {
          throw new Error('文件下载失败. ' + e)
        }
      }
    }
    // if (autoDeleteFile) {
    //     setTimeout(() => {
    //         fs.unlink(cache.filePath)
    //     }, autoDeleteFileSecond * 1000)
    // }
    return res
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
