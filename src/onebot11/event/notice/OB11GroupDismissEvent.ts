import { OB11GroupNoticeEvent } from './OB11GroupNoticeEvent'

export class OB11GroupDismissEvent extends OB11GroupNoticeEvent {
  notice_type = 'group_dismiss'
  user_id: number
  group_id: number

  constructor(groupId: number, user_id: number) {
    super()
    this.group_id = groupId
    this.user_id = user_id
  }
}
