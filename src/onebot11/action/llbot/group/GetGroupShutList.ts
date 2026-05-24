import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  group_id: number | string
}

export interface GroupMember {
  uid: string
  uin: string
  nick: string
  cardName: string
  role: number
  shutUpTime: number
  memberRealLevel: number
  memberSpecialTitle: string
  joinTime: number
  lastSpeakTime: number
}

export class GetGroupShutList extends BaseAction<Payload, GroupMember[]> {
  actionName = ActionName.GetGroupShutList
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  async _handle(payload: Payload) {
    const members = await this.ctx.ntGroupApi.getGroupMembers(+payload.group_id, true)
    const now = Math.floor(Date.now() / 1000)
    return members
      .values()
      .filter(member => member.shutupExpireTime > now)
      .map(member => ({
        uid: member.uid,
        uin: member.uin.toString(),
        nick: member.nick,
        cardName: member.cardName,
        role: member.role === 1 ? 4
          : member.role === 2 ? 3
            : 2,
        shutUpTime: member.shutupExpireTime,
        memberRealLevel: member.level,
        memberSpecialTitle: member.specialTitle,
        joinTime: member.joinedAt,
        lastSpeakTime: member.lastSpokeAt
      }))
      .toArray()
  }
}
