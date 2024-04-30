import BaseAction from '../BaseAction'
import { getFriend, getUidByUin, uidMaps } from '../../../common/data'
import { ActionName } from '../types'
import { NTQQFriendApi } from '../../../ntqqapi/api/friend'
import { log } from '../../../common/utils/log'

interface Payload {
  user_id: number
  times: number
}

export default class SendLike extends BaseAction<Payload, null> {
  actionName = ActionName.SendLike

  protected async _handle(payload: Payload): Promise<null> {
    log('点赞参数', payload)
    try {
      const qq = payload.user_id.toString()
      const friend = await getFriend(qq)
      let uid: string
      if (!friend) {
        uid = getUidByUin(qq)
      } else {
        uid = friend.uid
      }
      let result = await NTQQFriendApi.likeFriend(uid, parseInt(payload.times?.toString()) || 1)
      if (result.result !== 0) {
        throw result.errMsg
      }
    } catch (e) {
      throw `点赞失败 ${e}`
    }
    return null
  }
}
