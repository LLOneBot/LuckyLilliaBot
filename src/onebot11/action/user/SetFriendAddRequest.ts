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
    const data = payload.flag.split('|')
    if (data.length < 2) {
      throw new Error('无效的flag')
    }
    const uid = data[0]
    const reqTime = data[1]
    const res = await this.ctx.ntFriendApi.handleFriendRequest(uid, reqTime, payload.approve)
    if (res.result !== 0) {
      throw new Error(res.errMsg)
    }
    if (payload.remark) {
      const res = await this.ctx.ntFriendApi.setBuddyRemark(uid, payload.remark)
      if (res.result !== 0) {
        throw new Error(res.errMsg)
      }
    }
    return null
  }
}
