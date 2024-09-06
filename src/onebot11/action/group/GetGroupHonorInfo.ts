import { WebHonorType } from '@/ntqqapi/api'
import { ActionName } from '../types'
import BaseAction from '../BaseAction'

interface Payload {
  group_id: number
  type?: WebHonorType
}

export class GetGroupHonorInfo extends BaseAction<Payload, unknown> {
  actionName = ActionName.GetGroupHonorInfo

  protected async _handle(payload: Payload) {
    if (!payload.group_id) {
      throw '缺少参数group_id'
    }
    if (!payload.type) {
      payload.type = WebHonorType.ALL
    }
    return await this.ctx.ntWebApi.getGroupHonorInfo(payload.group_id.toString(), payload.type)
  }
}
