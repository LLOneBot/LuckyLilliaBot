import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  group_id: number | string
}

interface Info {
  user_id: number
  nick: string
  time: number
  rank: number
}

export class GetGroupSignedList extends BaseAction<Payload, Info[]> {
  actionName = ActionName.GetGroupSignedList
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  async _handle(payload: Payload) {
    const data = await this.ctx.ntWebApi.getDaySignedList(payload.group_id.toString())
    if (!data.response.page) throw new Error('无法获取该群组打卡列表')
    return data.response.page[0]?.infos?.map(info => ({
      user_id: +info.uid,
      nick: info.uidGroupNick,
      time: +info.signedTimeStamp,
      rank: (info.signInRank - 1) / 2 + 1
    })) ?? []
  }
}
