import { BaseAction, Schema } from '../BaseAction'
import { GroupNotificationType, GroupRequestOperateTypes } from '@/ntqqapi/types'
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

  private getRequestType(notificationType: GroupNotificationType) {
    if (notificationType === GroupNotificationType.JoinRequest) {
      return 1
    } else if (notificationType === GroupNotificationType.Invitation) {
      return 2
    } else if (notificationType === GroupNotificationType.InvitedJoinRequest) {
      return 22
    }
  }

  protected async _handle(payload: Payload) {
    let flag = payload.flag
    if (isNumeric(flag)) {
      const seq = +flag
      const res = await this.ctx.ntGroupApi.getGroupNotifications(false, 50)
      for (const v of res.notifications) {
        if (seq === v.notificationSeq) {
          flag = `${v.groupCode}|${v.notificationSeq}|${this.getRequestType(v.notificationType)}|0`
          break
        }
      }
      if (flag === payload.flag) {
        const res = await this.ctx.ntGroupApi.getGroupNotifications(true, 50)
        for (const v of res.notifications) {
          if (seq === v.notificationSeq) {
            flag = `${v.groupCode}|${v.notificationSeq}|${this.getRequestType(v.notificationType)}|1`
            break
          }
        }
        if (flag === payload.flag) {
          throw new Error('flag 不存在')
        }
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
