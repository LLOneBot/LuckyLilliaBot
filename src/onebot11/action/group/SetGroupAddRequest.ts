import { BaseAction, Schema } from '../BaseAction'
import { GroupRequestOperateTypes } from '@/ntqqapi/types'
import { ActionName } from '../types'
import { isNumeric, parseBool } from '@/common/utils/misc'

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

  protected async _handle(payload: Payload): Promise<null> {
    let flag = payload.flag
    if (isNumeric(flag)) {
      const res = await this.ctx.ntGroupApi.getGroupRequest()
      const normalEnd = res.normalCount - 1
      for (const [i, v] of res.notifies.entries()) {
        if (flag === v.seq) {
          flag = `${v.group.groupCode}|${v.seq}|${v.type}|${i > normalEnd ? '1' : '0'}`
          break
        }
      }
      if (flag === payload.flag) {
        throw new Error('flag 不存在')
      }
    }
    const res = await this.ctx.ntGroupApi.handleGroupRequest(
      flag,
      payload.approve ? GroupRequestOperateTypes.Approve : GroupRequestOperateTypes.Reject,
      payload.reason
    )
    if (res.result !== 0) {
      throw new Error(res.errMsg)
    }
    return null
  }
}
