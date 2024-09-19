import { OB11GroupNoticeEvent } from './OB11GroupNoticeEvent'

export class OB11GroupEssenceEvent extends OB11GroupNoticeEvent {
  notice_type = 'essence'
  message_id: number
  sender_id: number
  sub_type: 'add' | 'delete' = 'add'
  group_id: number
  user_id: number
  operator_id: number

  constructor(groupId: number, messageId: number, senderId: number, operatorId: number) {
    super()
    this.group_id = groupId
    this.user_id = senderId
    this.message_id = messageId
    this.sender_id = senderId
    this.operator_id = operatorId
  }
}
