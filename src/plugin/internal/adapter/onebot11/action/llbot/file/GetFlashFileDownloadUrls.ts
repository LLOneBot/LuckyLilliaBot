import { GetFlashFileInfoBase, GetFlashFilePayload } from './GetFlashFileInfo'
import { ActionName } from '@/plugin/internal/adapter/onebot11/action/types'

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
 * 列表请求要 field3=2 (Windows QQ 的发法), server 才返回 historyToken, 即 0x12a9_200 认的 fileId;
 * Linux QQ 默认的 1 拿不到。Payload: { share_link } 或 { file_set_id }
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
          // list 返回的 commit token, 当 fileId 用
          fileId: (f as any).fileId,
          // 不传 sha1 / md5: 有的 server 会当 string 解析, 报 invalid UTF-8; 有 fileId 就够了
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
