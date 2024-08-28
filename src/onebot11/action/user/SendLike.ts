import BaseAction from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  user_id: number | string
  times: number | string
}

export default class SendLike extends BaseAction<Payload, null> {
  actionName = ActionName.SendLike

  protected async _handle(payload: Payload): Promise<null> {
    try {
      const qq = payload.user_id.toString()
      const uid: string = await this.ctx.ntUserApi.getUidByUin(qq) || ''
      const result = await this.ctx.ntUserApi.like(uid, +payload.times || 1)
      if (result?.result !== 0) {
        throw Error(result?.errMsg)
      }
    } catch (e) {
      throw `点赞失败 ${e}`
    }
    return null
  }
}
