import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { parseBool } from '@/common/utils/misc'

interface Payload {
  flag: string
  approve: boolean
  remark?: string
}

export default class SetFriendAddRequest extends BaseAction<Payload, null> {
  actionName = ActionName.SetFriendAddRequest
  payloadSchema = Schema.object({
    flag: Schema.string().required(),
    approve: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(true),
    remark: Schema.string()
  })

  protected async _handle(payload: Payload) {
    const result = await this.ctx.ntFriendApi.approvalFriendRequest(payload.flag, payload.approve)
    if (result.errorCode !== 0) {
      throw new Error(result.errorMsg)
    }
    if (payload.remark) {
      const result = await this.ctx.ntFriendApi.setFriendRemark(payload.flag, payload.remark)
      if (result.errorCode !== 0) {
        throw new Error(result.errorMsg)
      }
    }
    return null
  }
}
