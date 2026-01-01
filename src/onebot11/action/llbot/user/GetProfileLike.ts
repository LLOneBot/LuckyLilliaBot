import { BaseAction } from '../../BaseAction'
import { ActionName } from '../../types'
import { selfInfo } from '@/common/globalVars'
import { Dict } from 'cosmokit'
import { Schema } from '@/onebot11/action/BaseAction'

interface Payload {
  start: number | string
  count: number | string
}

interface Response {
  users: Dict[]
  nextStart: number
}

export class GetProfileLike extends BaseAction<Payload, Response> {
  actionName = ActionName.GetProfileLike
  payloadSchema = Schema.object({
    start: Schema.union([Number, String]).default(0), // 从0开始，-1表示获取全部
    count: Schema.union([Number, String]).default(20)  // 最多30一页
  })

  async _handle(payload: Payload) {
    const ret = await this.ctx.ntUserApi.getProfileLike(selfInfo.uid, +payload.start, +payload.count)
    if (ret.result !== 0) {
      throw new Error(ret.errMsg)
    }
    const users = ret.info.userLikeInfos[0].favoriteInfo.userInfos
    for (const item of users) {
      try {
        item.uin = Number(await this.ctx.ntUserApi.getUinByUid(item.uid)) || 0
      } catch (e) {
        item.uin = 0
      }
    }
    return { users, nextStart: ret.info.start }
  }
}
