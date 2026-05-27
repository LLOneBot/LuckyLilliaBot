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
      if (n.type === GroupNotificationType.Invitation) {
        data.invited_requests.push({
          request_id: Number(n.sequence),
          invitor_uin: await this.ctx.ntUserApi.getUinByUid(n.user2!.uid),
          invitor_nick: n.user2!.nickName,
          group_id: n.group.groupCode,
          group_name: n.group.groupName,
          checked: n.requestState !== RequestState.Unhandle,
          actor: n.user3?.uid ? await this.ctx.ntUserApi.getUinByUid(n.user3.uid) : 0
        })
      } else if (n.type === GroupNotificationType.JoinRequest) {
        data.join_requests.push({
          request_id: Number(n.sequence),
          requester_uin: await this.ctx.ntUserApi.getUinByUid(n.user1.uid),
          requester_nick: n.user1.nickName,
          message: n.comment ?? '',
          group_id: n.group.groupCode,
          group_name: n.group.groupName,
          checked: n.requestState !== RequestState.Unhandle,
          actor: n.user2?.uid ? await this.ctx.ntUserApi.getUinByUid(n.user2.uid) : 0
        })
      }
    }
    return data
  }
}
