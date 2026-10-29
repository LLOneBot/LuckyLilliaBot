import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  user_id?: number | string
  group_id?: number | string
}

interface Response {
  url: string
}

export class GetQQAvatar extends BaseAction<Payload, Response> {
  actionName = ActionName.GetQQAvatar
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]),
    group_id: Schema.union([Number, String]),
  })

  protected async _handle(payload: Payload) {
    if (payload.user_id) {
      return { url: `https://thirdqq.qlogo.cn/g?b=qq&nk=${payload.user_id}&s=640` }
    }
    else if (payload.group_id) {
      return { url: `https://p.qlogo.cn/gh/${payload.group_id}/${payload.group_id}/0` }
    }
    else {
      throw new Error('未指定 user_id 或 group_id')
    }
  }
}
