import { OB11GroupNoticeEvent } from './OB11GroupNoticeEvent'

export type GroupDecreaseSubType = 'leave' | 'kick' | 'kick_me'

export class OB11GroupDecreaseEvent extends OB11GroupNoticeEvent {
  notice_type = 'group_decrease'
  sub_type: GroupDecreaseSubType = 'leave'
  operator_id: number
  group_id: number
  user_id: number

  constructor(groupId: number, userId: number, operatorId: number, subType: GroupDecreaseSubType = 'leave') {
    super()
    this.group_id = groupId
    this.operator_id = operatorId
    this.user_id = userId
    this.sub_type = subType
  }
}
