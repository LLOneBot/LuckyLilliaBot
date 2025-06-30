import { BaseAction } from '@/onebot11/action/BaseAction'
import { ActionName } from '@/onebot11/action/types'
import { uri2local } from '@/common/utils'

interface Payload {
  name: string
  paths: string[]
}

interface Response {
  share_link: string,
  expire_time: string,
}

export class FlashUpload extends BaseAction<Payload, Response> {
  actionName = ActionName.FlashUpload

  async _handle(payload: Payload) {
    const { name, paths } = payload
    const localPaths: string[] = []
    for (const path of paths) {
      const { fileName, path: localPath, isLocal, errMsg } = await uri2local(this.ctx, path)
      if (errMsg) {
        throw new Error(errMsg)
      }
      if (localPath) {
        localPaths.push(localPath)
      } else {
        throw new Error(`无法获取文件${path}的本地路径`)
      }
    }
    const res = await this.ctx.ntFileApi.createFlashTransferUploadTask(name, localPaths)
    return {
      share_link: res.shareLink,
      expire_time: res.expireTime
    }
  }
}
