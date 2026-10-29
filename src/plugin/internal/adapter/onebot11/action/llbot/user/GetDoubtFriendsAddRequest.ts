import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

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
    const res = await this.ctx.ntFriendApi.getDoubtFriendRequests(+payload.count)
    return await Promise.all(res.map(async e => {
      return {
        flag: e.sourceUid,
        uin: String(await this.ctx.ntUserApi.getUinByUid(e.sourceUid)),
        nick: e.sourceNickname,
        source: e.source,
        reason: e.warningInfo,
        msg: e.comment,
        group_code: e.groupCode.toString(),
        time: e.timestamp.toString(),
        type: 'doubt'
      }
    }))
  }
}
