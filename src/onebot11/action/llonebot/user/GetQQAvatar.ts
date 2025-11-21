import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  user_id: number | string
}

interface Response {
  url: string
}

export class GetQQAvatar extends BaseAction<Payload, Response> {
  actionName = ActionName.GetQQAvatar
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    return { url: `https://thirdqq.qlogo.cn/g?b=qq&nk=${payload.user_id}&s=640` }
  }
}
