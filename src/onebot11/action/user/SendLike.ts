import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { NTQQUserApi } from '@/ntqqapi/api'

interface Payload {
  user_id: number
  times: number
}

export default class SendLike extends BaseAction<Payload, null> {
  actionName = ActionName.SendLike

  protected async _handle(payload: Payload): Promise<null> {
    try {
      const qq = payload.user_id.toString()
      const uid: string = await NTQQUserApi.getUidByUin(qq) || ''
      const result = await NTQQUserApi.like(uid, parseInt(payload.times?.toString()) || 1)
      if (result.result !== 0) {
        throw Error(result.errMsg)
      }
    } catch (e) {
      throw `点赞失败 ${e}`
    }
    return null
  }
}
