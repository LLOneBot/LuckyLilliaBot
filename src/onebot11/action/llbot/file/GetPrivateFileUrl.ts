import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { selfInfo } from '@/common/globalVars'

export interface Payload {
  file_id: string
  user_id?: number | string
}

export interface Response {
  url: string
}

export class GetPrivateFileUrl extends BaseAction<Payload, Response> {
  actionName = ActionName.GetPrivateFileUrl
  payloadSchema = Schema.object({
    file_id: Schema.string().required(),
    user_id: Schema.union([Number, String]),
  })

  protected async _handle(payload: Payload) {
    // PMHQ 抓包验过：OIDB 0xe37_1200 的 field 10 是 query 发起者**自己**的 uid（不管 self 是 sender 还是 receiver），
    // field 60 是 NotOnlineFile.fileIdCrcMedia（fileHash）。
    const cached = (await this.ctx.store.getFileCacheById(payload.file_id))?.[0]
    const receiverUid = payload.user_id
      ? await this.ctx.ntUserApi.getUidByUin(String(payload.user_id))
      : selfInfo.uid
    const fileHash = cached?.fileHash || ''

    const { state, url } = await this.ctx.qqProtocol.getPrivateFileUrl(receiverUid, payload.file_id, fileHash)
    if (state !== 'ok') {
      throw new Error(state || '获取私聊文件 URL 失败')
    }
    return { url }
  }
}


