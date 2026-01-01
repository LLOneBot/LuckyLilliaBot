import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  group_id: number | string
  user_ids: Array<number | string>
}

export class BatchDeleteGroupMember extends BaseAction<Payload, null> {
  actionName = ActionName.BatchDeleteGroupMember
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    user_ids: Schema.array(Schema.union([Number, String])).required(),
  })

  protected async _handle(payload: Payload) {
    const groupCode = payload.group_id.toString()
    const memberUinList = payload.user_ids.map(id => id.toString())
    const memberUids = await Promise.all(memberUinList.map(async uin => {
      return await this.ctx.ntUserApi.getUidByUin(uin, groupCode)
    }))
    const res = await this.ctx.ntGroupApi.kickMember(groupCode, memberUids)
    if (res.errCode !== 0) {
      throw new Error(res.errMsg)
    }
    return null
  }
}
