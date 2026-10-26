import { GetFlashFileInfoBase, GetFlashFilePayload } from './GetFlashFileInfo'
import { ActionName } from '@/onebot11/action/types'

interface Response {
  file_set_id: string
  share_link: string
  expire_time: number
}

/** 靠秒传完成, 不需要本地有原文件; 老 fileSet 必须还没过期。Payload: { share_link } 或 { file_set_id } */
export class ReShareFlashFile extends GetFlashFileInfoBase<Response> {
  actionName = ActionName.ReShareFlashFile

  async _handle(payload: GetFlashFilePayload) {
    const file_set_id = await this.get_file_set_id(payload)
    const res = await this.ctx.ntFileApi.reshareFlashFile(file_set_id)
    if (res.result !== 0) {
      throw new Error(res.errMsg || String(res.result))
    }
    return {
      file_set_id: res.createFlashTransferResult.fileSetId,
      share_link: res.createFlashTransferResult.shareLink,
      expire_time: +res.createFlashTransferResult.expireTime,
    }
  }
}
