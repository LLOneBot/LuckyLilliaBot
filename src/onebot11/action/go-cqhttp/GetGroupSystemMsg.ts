import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'
import { GroupNotify, GroupNotifyStatus, GroupNotifyType } from '@/ntqqapi/types'

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

export class GetGroupSystemMsg extends BaseAction<void, Response> {
  actionName = ActionName.GoCQHTTP_GetGroupSystemMsg

  private async parse(notifies: GroupNotify[]) {
    const data: Response = { invited_requests: [], join_requests: [] }
    for (const notify of notifies) {
      if (notify.type === GroupNotifyType.InvitedByMember) {
        data.invited_requests.push({
          request_id: +notify.seq,
          invitor_uin: Number(await this.ctx.ntUserApi.getUinByUid(notify.user1.uid)),
          invitor_nick: notify.user1.nickName,
          group_id: +notify.group.groupCode,
          group_name: notify.group.groupName,
          checked: notify.status !== GroupNotifyStatus.Unhandle,
          actor: notify.user2?.uid ? Number(await this.ctx.ntUserApi.getUinByUid(notify.user2.uid)) : 0
        })
      } else if (notify.type === GroupNotifyType.RequestJoinNeedAdminiStratorPass) {
        data.join_requests.push({
          request_id: +notify.seq,
          requester_uin: Number(await this.ctx.ntUserApi.getUinByUid(notify.user1.uid)),
          requester_nick: notify.user1.nickName,
          message: notify.postscript,
          group_id: +notify.group.groupCode,
          group_name: notify.group.groupName,
          checked: notify.status !== GroupNotifyStatus.Unhandle,
          actor: notify.user2?.uid ? Number(await this.ctx.ntUserApi.getUinByUid(notify.user2.uid)) : 0
        })
      }
    }
    return data
  }

  async _handle() {
    const res = await this.ctx.ntGroupApi.getGroupRequest()
    return await this.parse(res.notifies)
  }
}
