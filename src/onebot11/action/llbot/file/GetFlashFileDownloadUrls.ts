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
 * 闪传一个文件集 (fileSet) 通常装多个文件。这里默认全选 fileSet 里每个文件，
 * 返回：
 *   - share_link: 整个 fileSet 的 https://qfile.qq.com/q/<code> 浏览器入口
 *     (HTML 页面，含 JS 拉真下载链接，用户/外层 webview 直接打开即可)
 *   - files[].url: 每个文件经 0x12a9_200 拿到的 multimedia 短期签名 URL
 *
 * Caveat: server 拼的签名 URL 含 appid，跟 client SSO 层身份(Linux QQ vs
 * Windows QQ)绑定。Linux QQ bot 拿到的签名 URL 用 https.get 直接下时
 * server 会 'appid is not match' 拒收 — 因为 server 不知道 Linux QQ 的闪传
 * appid (Linux QQ 客户端没有闪传 UI)。临时变通：用 share_link 在浏览器
 * /webview 打开，QQ 用户态 token 验证后能下载。长期：bot 协议层伪装为
 * Windows QQ 让 server 拼 Windows 端 URL。
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
          fileSha1Hex: (f as any).sha1Hex,
          fileMd5Hex: (f as any).md5Hex,
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
