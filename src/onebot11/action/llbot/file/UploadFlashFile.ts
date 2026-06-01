import { BaseAction, Schema } from '@/onebot11/action/BaseAction'
import { ActionName } from '@/onebot11/action/types'
import { uri2local } from '@/common/utils'

interface Payload {
  title: string
  paths: string[]
}

interface FileDownload {
  name: string
  size: number
  url: string
  expire: number
}

interface Response {
  file_set_id: string
  share_link: string
  expire_time: number
  /** 每个文件上传后立刻拿到的 multimedia.qfile.qq.com 短期签名 URL（约 1h 过期）。
   *  上传一步到位：preflight 给的 fileId token 当场用了换 download URL，过期后 client
   *  没法基于 share_link 重建（Linux QQ list 不返 sha1，重 preflight 命中不了秒传）。 */
  downloads?: FileDownload[]
}

export class UploadFlashFile extends BaseAction<Payload, Response> {
  actionName = ActionName.UploadFlashFile
  payloadSchema = Schema.object({
    title: Schema.string(),
    paths: Schema.array(String).required()
  })

  async _handle(payload: Payload) {
    const { title, paths } = payload
    const localPaths: string[] = await Promise.all(
      paths.map(async (path) => {
        const { fileName, path: localPath, isLocal, errMsg } = await uri2local(this.ctx, path)
        if (errMsg) {
          throw new Error(errMsg)
        }
        if (localPath) {
          return localPath
        }
        else {
          throw new Error(`无法获取文件${path}的本地路径`)
        }
      }),
    )
    const res = await this.ctx.ntFileApi.uploadFlashFile(title, localPaths)
    if (res.result !== 0) {
      throw new Error(res.result)
    }

    // 旧版本 QQ 可能没有该字段，尝试通过 fileSetId 获取
    if (!res.createFlashTransferResult) {
      const oldFlashFileInfo = await this.ctx.ntFileApi.getFlashFileInfo(res.fileSetId)
      return {
        file_set_id: oldFlashFileInfo.fileSetId,
        share_link: oldFlashFileInfo.shareInfo.shareLink,
        expire_time: +oldFlashFileInfo.expireTime,
      }
    }
    return {
      file_set_id: res.createFlashTransferResult.fileSetId,
      share_link: res.createFlashTransferResult.shareLink,
      expire_time: +res.createFlashTransferResult.expireTime,
      downloads: res.downloads,
    }
  }
}
