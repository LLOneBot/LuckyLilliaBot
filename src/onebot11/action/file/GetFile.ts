import { BaseAction, Schema } from '../BaseAction'
import { readFile } from 'node:fs/promises'
import { ActionName } from '../types'
import { ElementType, ChatType } from '@/ntqqapi/types'
import { parseBool, uri2local } from '@/common/utils'

export interface GetFilePayload {
  file: string // 文件名或者fileUuid
  download: boolean
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
    file: Schema.string().required(),
    download: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(true)
  })

  protected async _handle(payload: GetFilePayload): Promise<GetFileResponse> {
    const { enableLocalFile2Url } = this.adapter.config

    let fileCache = await this.ctx.store.getFileCacheById(payload.file)
    if (!fileCache?.length) {
      fileCache = await this.ctx.store.getFileCacheByName(payload.file)
    }

    if (fileCache?.length) {
      let downloadPath = ''
      if (payload.download) {
        const file = await uri2local(this.ctx, fileCache[0].fileUuid, true)
        if (file.errMsg) {
          throw new Error(file.errMsg)
        }
        downloadPath = file.path
      }
      const res: GetFileResponse = {
        file: downloadPath,
        url: '',
        file_size: fileCache[0].fileSize,
        file_name: fileCache[0].fileName,
      }
      const isGroup = fileCache[0].chatType === ChatType.Group
      if (fileCache[0].elementType === ElementType.Pic) {
        const originImageUrl = `/download?appid=${isGroup ? 1407 : 1406}&fileid=${fileCache[0].fileUuid}&spec=0`
        res.url = await this.ctx.ntFileApi.getImageUrl(originImageUrl, fileCache[0].md5HexStr)
      } else if (fileCache[0].elementType === ElementType.Video) {
        res.url = await this.ctx.ntFileApi.getVideoUrl(fileCache[0].fileUuid, isGroup)
      } else if (fileCache[0].elementType === ElementType.Ptt) {
        res.url = await this.ctx.ntFileApi.getPttUrl(fileCache[0].fileUuid, isGroup)
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
    file_id: Schema.string(),
    download: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(true)
  })

  protected async _handle(payload: { file_id: string, file: string, download: boolean }): Promise<GetFileResponse> {
    payload.file = payload.file || payload.file_id
    return super._handle(payload)
  }
}
