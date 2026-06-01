import { GetFlashFileInfoBase, GetFlashFilePayload } from './GetFlashFileInfo'
import { ActionName } from '@/onebot11/action/types'

interface Response {
  file_set_id: string
  share_link: string
  expire_time: number
}

/**
 * 闪传：用老 share_link / file_set_id 重新分享，拿到全新 share_link + 14 天有效期。
 *
 * 实现链路（跟 Windows QQ "重新分享" 按钮一致，但**不需要本地有原文件**）：
 *   share_link → 0x93eb_1 → 老 fileSetId
 *   → 0x93d4_1 (field3=2) 拿每文件的 sha1
 *   → 走完整 upload 链路 (createFlashFileSet/register/prep/preflight/commit)
 *   → preflight 拿 list 给的 sha1，server 端秒传命中，瞬间完成
 *   → 全新 share_link + 14 天有效期
 *
 * 限制：老 fileSet 必须没过期（过期后 list 调不通拿不到 sha1）。
 *
 * Payload: { share_link } 或 { file_set_id }
 */
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
