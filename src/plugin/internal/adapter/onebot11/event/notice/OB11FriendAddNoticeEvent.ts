import { OB11BaseNoticeEvent } from './OB11BaseNoticeEvent'

export class OB11FriendAddNoticeEvent extends OB11BaseNoticeEvent {
  notice_type = 'friend_add'
  user_id: number

  public constructor(userId: number) {
    super()
    this.user_id = userId
  }
}
