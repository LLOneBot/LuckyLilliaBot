import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  count: number | string
}

interface Item {
  flag: string
  uin: string
  nick: string
  source: string
  reason: string
  msg: string
  group_code: string
  time: string
  type: string
}

export class GetDoubtFriendsAddRequest extends BaseAction<Payload, Item[]> {
  actionName = ActionName.GetDoubtFriendsAddRequest
  payloadSchema = Schema.object({
    count: Schema.union([Number, String]).default(50)
  })

  async _handle(payload: Payload) {
    const res = await this.ctx.ntFriendApi.getDoubtBuddyReq(+payload.count)
    return await Promise.all(res.doubtList.map(async e => {
      return {
        flag: e.uid,
        uin: await this.ctx.ntUserApi.getUinByUid(e.uid),
        nick: e.nick,
        source: e.source,
        reason: e.reason,
        msg: e.msg,
        group_code: e.groupCode,
        time: e.reqTime,
        type: 'doubt'
      }
    }))
  }
}
