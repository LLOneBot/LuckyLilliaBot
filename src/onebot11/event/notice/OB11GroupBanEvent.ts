import { OB11GroupNoticeEvent } from './OB11GroupNoticeEvent'
import { TipGroupElement } from '@/ntqqapi/types'
import { Context } from 'cordis'

export class GroupBanEvent extends OB11GroupNoticeEvent {
  notice_type = 'group_ban'
  operator_id: number
  duration: number
  sub_type: 'ban' | 'lift_ban'
  group_id: number
  user_id: number

  constructor(groupId: number, userId: number, operatorId: number, duration: number, sub_type: 'ban' | 'lift_ban') {
    super()
    this.group_id = groupId
    this.operator_id = operatorId
    this.user_id = userId
    this.duration = duration
    this.sub_type = sub_type
  }

  static async parse(ctx: Context, groupElement: TipGroupElement, groupCode: string) {
    const memberUid = groupElement.shutUp?.member.uid
    const adminUid = groupElement.shutUp?.admin.uid
    let memberUin = ''
    let duration = Number(groupElement.shutUp?.duration)
    if (memberUid) {
      memberUin = await ctx.ntUserApi.getUinByUid(memberUid)
    } else {
      memberUin = '0' // 0表示全员禁言
      if (duration > 0) {
        duration = -1
      }
    }
    const adminUin = await ctx.ntUserApi.getUinByUid(adminUid!)
    const subType = duration > 0 ? 'ban' : 'lift_ban'
    return new GroupBanEvent(+groupCode, +memberUin, +adminUin, duration, subType)
  }
}
