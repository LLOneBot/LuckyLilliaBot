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
  share_link: string
  files: FileUrl[]
}

/**
 * 获取闪传文件集里所有文件的下载入口（默认全选）。
 *
 * 关键：list req body 里 `field3 = 2`（Windows QQ 客户端的发法）才能让 server 返
 * `f14.historyToken`——0x12a9_200 download preflight 真正识别的 fileId。Linux QQ
 * 客户端默认 `field3 = 1`，server 主动剥光 historyToken / sha1 / md5 字段，URL
 * 拿到也是 fileid= 空。
 *
 * 流程：
 *   share_link → 0x93eb_1 → fileSetId
 *   fileSetId → 0x93d4_1 (f3=2) → 每个 entry 含 historyToken
 *   (fileSetId, fileUuid, historyToken) → 0x12a9_200 → 完整 download URL
 *
 * Payload: { share_link } 或 { file_set_id }
 */
export class GetFlashFileDownloadUrls extends GetFlashFileInfoBase<Response> {
  actionName = ActionName.GetFlashFileDownloadUrls

  async _handle(payload: GetFlashFilePayload) {
    const file_set_id = await this.get_file_set_id(payload)
    const info = await this.ctx.ntFileApi.getFlashFileInfo(file_set_id)
    const fileList = await this.ctx.ntFileApi.getFlashFileList(file_set_id)
    const urls: FileUrl[] = []
    for (const group of fileList) {
      for (const f of group.fileList) {
        const url = await this.ctx.ntFileApi.getFlashFileDownloadUrl({
          fileSetId: file_set_id,
          fileUuid: f.cliFileId,
          fileName: f.name,
          fileSize: +f.fileSize,
          // f.fileId 是从 list resp f14.token (102 char base64 commit token) 取的；
          // 直接当 0x12a9_200 download.info.fileId 入参，server 拼 URL 时回填到 fileid= 参数
          fileId: (f as any).fileId,
          // 不传 sha1Hex/md5Hex：proto 里这俩是 bytes，传 hex string 转 Buffer 后某些 server 实现
          // 用 string 解析报 invalid UTF-8。fileId 已经够 server 定位文件
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
      share_link: info.shareInfo?.shareLink ?? '',
      files: urls,
    }
  }
}
