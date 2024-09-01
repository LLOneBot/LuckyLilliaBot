import BaseAction from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
}

interface Response {
  can_at_all: boolean
  remain_at_all_count_for_group: number
  remain_at_all_count_for_uin: number
}

export class GetGroupAtAllRemain extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetGroupAtAllRemain

  async _handle(payload: Payload) {
    const data = await this.ctx.ntGroupApi.getGroupRemainAtTimes(payload.group_id.toString())
    return {
      can_at_all: data.atInfo.canAtAll,
      remain_at_all_count_for_group: data.atInfo.RemainAtAllCountForGroup,
      remain_at_all_count_for_uin: data.atInfo.RemainAtAllCountForUin
    }
  }
}