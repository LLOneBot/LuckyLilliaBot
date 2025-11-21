import { BaseAction, Schema } from '@/onebot11/action/BaseAction'
import { ActionName } from '@/onebot11/action/types'
import { uri2local } from '@/common/utils'

interface Payload {
  title: string
  paths: string[]
}

interface Response {
  file_set_id: string
  share_link: string
  expire_time: number
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
    return {
      file_set_id: res.fileSetId,
      share_link: res.shareLink,
      expire_time: parseInt(res.expireTime),
    }
  }
}
