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
    const data = await this.ctx.ntGroupApi.getGroupRemainAtTimes(payload.group_id.toString())
    if (data.errCode !== 0) {
      throw new Error(data.errMsg)
    }
    return {
      can_at_all: data.atInfo.canAtAll,
      remain_at_all_count_for_group: data.atInfo.RemainAtAllCountForGroup,
      remain_at_all_count_for_uin: data.atInfo.RemainAtAllCountForUin
    }
  }
}
