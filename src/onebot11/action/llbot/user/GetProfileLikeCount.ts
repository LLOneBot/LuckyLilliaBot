import { BaseAction, Schema } from '@/onebot11/action/BaseAction'
import { ActionName } from '@/onebot11/action/types'

interface Payload {
  user_id: number | string
}

interface Response {
  count: number
}

export class GetProfileLikeCount extends BaseAction<Payload, Response> {
  actionName = ActionName.GetProfileLikeCount
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required()
  })

  async _handle(payload: Payload): Promise<Response> {
    const uid = await this.ctx.ntUserApi.getUidByUin(+payload.user_id)
    if (!uid) throw new Error('无法获取用户信息')
    const result = await this.ctx.ntUserApi.getProfileLikeCount(uid)
    return {
      count: result.body.voteInfo.totalCount
    }
  }
}
