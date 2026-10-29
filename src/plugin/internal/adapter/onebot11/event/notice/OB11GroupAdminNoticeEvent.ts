import { OB11GroupNoticeEvent } from './OB11GroupNoticeEvent'

export class OB11GroupAdminNoticeEvent extends OB11GroupNoticeEvent {
  notice_type = 'group_admin'
  sub_type: 'set' | 'unset'
  group_id: number
  user_id: number

  constructor(subType: 'set' | 'unset', groupId: number, userId: number) {
    super()
    this.sub_type = subType
    this.group_id = groupId
    this.user_id = userId
  }
}
