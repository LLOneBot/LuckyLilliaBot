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
    this.operator_id = operatorId // 实际上不应该这么实现，但是现在还没有办法识别用户是被踢出的，还是自己主动退出的
    this.user_id = userId
    this.sub_type = subType
  }
}
