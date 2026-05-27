import { GroupNotificationType, RequestState } from '@/ntqqapi/types'
import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'

interface Response {
  invited_requests: {
    request_id: number
    invitor_uin: number
    invitor_nick: string
    group_id: number
    group_name: string
    checked: boolean
    actor: number
  }[]
  join_requests: {
    request_id: number
    requester_uin: number
    requester_nick: string
    message: string
    group_id: number
    group_name: string
    checked: boolean
    actor: number
  }[]
}

export class GetGroupSystemMsg extends BaseAction<{}, Response> {
  actionName = ActionName.GoCQHTTP_GetGroupSystemMsg

  async _handle() {
    let notifications
    const normal = await this.ctx.ntGroupApi.getGroupNotifications(false, 50)
    notifications = normal.notifications
    const doubt = await this.ctx.ntGroupApi.getGroupNotifications(true, 50)
    notifications.push(...doubt.notifications)

    const data: Response = { invited_requests: [], join_requests: [] }
    for (const n of notifications) {
      if (n.notificationType === GroupNotificationType.Invitation) {
        data.invited_requests.push({
          request_id: n.notificationSeq,
          invitor_uin: await this.ctx.ntUserApi.getUinByUid(n.initiatorUid),
          invitor_nick: n.initiatorNick,
          group_id: n.groupCode,
          group_name: n.groupName,
          checked: n.state !== RequestState.Unhandle,
          actor: n.operatorUid ? await this.ctx.ntUserApi.getUinByUid(n.operatorUid) : 0
        })
      } else if (n.notificationType === GroupNotificationType.JoinRequest) {
        data.join_requests.push({
          request_id: n.notificationSeq,
          requester_uin: await this.ctx.ntUserApi.getUinByUid(n.initiatorUid),
          requester_nick: n.initiatorNick,
          message: n.comment,
          group_id: n.groupCode,
          group_name: n.groupName,
          checked: n.state !== RequestState.Unhandle,
          actor: n.operatorUid ? await this.ctx.ntUserApi.getUinByUid(n.operatorUid) : 0
        })
      }
    }
    return data
  }
}
