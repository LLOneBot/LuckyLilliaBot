import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { isNumeric, parseBool } from '@/common/utils/misc'
import { decodeGroupRequestFlag } from '@/onebot11/utils'

interface Payload {
  flag: string
  approve: boolean
  reason?: string
}

export default class SetGroupAddRequest extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupAddRequest
  payloadSchema = Schema.object({
    flag: Schema.string().required(),
    approve: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(true),
    reason: Schema.string()
  })

  protected async _handle(payload: Payload) {
    let flag = payload.flag
    if (isNumeric(flag)) {
      const seq = BigInt(flag)
      const res = await this.ctx.ntGroupApi.getGroupNotifications(false, 50)
      for (const v of res.notifications) {
        if (seq === v.sequence) {
          flag = `${v.group.groupCode}|${v.sequence}|${v.type}|0`
          break
        }
      }
      if (flag === payload.flag) {
        const res = await this.ctx.ntGroupApi.getGroupNotifications(true, 50)
        for (const v of res.notifications) {
          if (seq === v.sequence) {
            flag = `${v.group.groupCode}|${v.sequence}|${v.type}|1`
            break
          }
        }
        if (flag === payload.flag) {
          throw new Error('flag 不存在')
        }
      }
    }
    const decoded = decodeGroupRequestFlag(flag)
    const res = await this.ctx.ntGroupApi.setGroupRequest(
      decoded.doubt,
      decoded.groupCode,
      Number(decoded.seq),
      decoded.type,
      payload.approve,
      payload.reason
    )
    if (res.errorCode !== 0) {
      throw new Error(res.errorMsg)
    }
    return null
  }
}
