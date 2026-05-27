import { BaseAction, Schema } from '../BaseAction'
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
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  async _handle(payload: Payload) {
    const data = await this.ctx.ntGroupApi.getGroupRemainAtTimes(+payload.group_id)
    return {
      can_at_all: data.canAtAll,
      remain_at_all_count_for_group: data.remainAtAllCountForGroup,
      remain_at_all_count_for_uin: data.remainAtAllCountForUin
    }
  }
}
