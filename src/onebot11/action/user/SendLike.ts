import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  user_id: number | string
  times: number | string
}

export default class SendLike extends BaseAction<Payload, null> {
  actionName = ActionName.SendLike

  protected async _handle(payload: Payload): Promise<null> {
    const uin = payload.user_id.toString()
    const uid = await this.ctx.ntUserApi.getUidByUin(uin)
    if (!uid) throw new Error('无法获取用户信息')
    const result = await this.ctx.ntUserApi.like(uid, +payload.times || 1)
    if (result.result !== 0) {
      throw new Error(result.errMsg)
    }
    return null
  }
}
