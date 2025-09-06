import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  user_id: number | string
  times: number | string
}

export default class SendLike extends BaseAction<Payload, null> {
  actionName = ActionName.SendLike
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required(),
    times: Schema.union([Number, String]).default(1)
  })

  protected async _handle(payload: Payload): Promise<null> {
    const uin = payload.user_id.toString()
    const uid = await this.ctx.ntUserApi.getUidByUin(uin)
    if (!uid) throw new Error('无法获取用户信息')
    const result = await this.ctx.ntUserApi.like(uid, +payload.times)
    if (result.result !== 0) {
      throw new Error(result.errMsg)
    }
    return null
  }
}
