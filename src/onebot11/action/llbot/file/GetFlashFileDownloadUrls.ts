import { GetFlashFileInfoBase, GetFlashFilePayload } from './GetFlashFileInfo'
import { ActionName } from '@/onebot11/action/types'

interface FileUrl {
  name: string
  size: number
  url: string
  expire: number
}

interface Response {
  file_set_id: string
  files: FileUrl[]
}

/**
 * 获取闪传文件集里所有文件的 HTTPS 下载 URL（全选）。
 *
 * 闪传一个文件集 (fileSet) 通常装多个文件。这里默认全选拿到每个文件的 multimedia.qfile.qq.com
 * 短期签名 URL（约 1 小时过期），调用方按 files[].url 用 https.get 直接下载即可。
 *
 * 不需要 0x93d1_1 (registerDownload) / 0x93e1_0 (progress polling) — 那两步是 Windows
 * QQ 客户端 UI 用的；bot 走 URL 直接下就行。
 *
 * Payload: { share_link } 或 { file_set_id }
 */
export class GetFlashFileDownloadUrls extends GetFlashFileInfoBase<Response> {
  actionName = ActionName.GetFlashFileDownloadUrls

  async _handle(payload: GetFlashFilePayload) {
    const file_set_id = await this.get_file_set_id(payload)
    const fileList = await this.ctx.ntFileApi.getFlashFileList(file_set_id)
    const urls: FileUrl[] = []
    for (const group of fileList) {
      for (const f of group.fileList) {
        const url = await this.ctx.ntFileApi.getFlashFileDownloadUrl({
          fileSetId: file_set_id,
          fileUuid: f.cliFileId,
          fileName: f.name,
          fileSize: +f.fileSize,
        })
        urls.push({
          name: f.name,
          size: +f.fileSize,
          url: url.fullUrl,
          expire: url.ttl,
        })
      }
    }
    return {
      file_set_id,
      files: urls,
    }
  }
}
