import { BaseAction, Schema } from '@/onebot11/action/BaseAction'
import { ActionName } from '@/onebot11/action/types'

export interface GetFlashFilePayload {
  share_link?: string
  file_set_id?: string
}

interface Response {
  file_set_id: string
  title: string
  share_link: string
  total_file_size: number
  files: Array<{
    name: string
    size: number
  }>
}

export class GetFlashFileInfoBase<R> extends BaseAction<GetFlashFilePayload, R> {
  actionName = ActionName.GetFlashFileInfo
  payloadSchema = Schema.object({
    share_link: Schema.string(),
    file_set_id: Schema.string()
  })

  protected async get_file_set_id(payload: GetFlashFilePayload): Promise<string> {
    let { share_link, file_set_id } = payload
    if (share_link) {
      // 正则提取 code
      const match = share_link.match(/qfile.qq.com\/q\/([\w\d]+)/)
      if (!match) {
        throw new Error('分享链接格式不正确')
      }
      const code = match[1]
      const res = await this.ctx.ntFileApi.getFlashFileSetIdByCode(code)
      if (res.result !== 0) {
        throw new Error(`获取闪传文件 fileSetId 失败: ${res.errMsg}`)
      }
      file_set_id = res.fileSetId
    }
    if (!file_set_id) {
      throw new Error('请提供有效的 share_link 或 file_set_id')
    }
    return file_set_id
  }

  async _handle(payload: GetFlashFilePayload): Promise<R> {
    throw new Error('Method not implemented.')
  }

}


export class GetFlashFileInfo extends GetFlashFileInfoBase<Response> {
  actionName = ActionName.GetFlashFileInfo

  async _handle(payload: GetFlashFilePayload) {
    const file_set_id = await this.get_file_set_id(payload)
    const fileInfo = await this.ctx.ntFileApi.getFlashFileInfo(file_set_id)
    const fileList = await this.ctx.ntFileApi.getFlashFileList(file_set_id)
    // return {
    //   message: '闪传文件下载任务已创建，使用 get_flash_file_list 查看状态，或等待上报 notice_type:flash_file',
    // }
    const files = []
    for (const file of fileList) {
      for (const file2 of file.fileList) {
        files.push({
          name: file2.name,
          size: +file2.fileSize,
        })
      }
    }
    return {
      file_set_id,
      title: fileInfo.name,
      share_link: fileInfo.shareInfo.shareLink,
      total_file_size: +fileInfo.totalFileSize,
      files,
    }
  }
}
