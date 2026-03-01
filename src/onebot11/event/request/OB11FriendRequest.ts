import { OB11BaseNoticeEvent } from '../notice/OB11BaseNoticeEvent'
import { EventType } from '../OB11BaseEvent'

export class OB11FriendRequestEvent extends OB11BaseNoticeEvent {
  post_type = EventType.REQUEST
  request_type = 'friend'
  user_id: number
  comment: string
  flag: string
  via: string

  constructor(userId: number, comment: string, flag: string, via: string) {
    super()
    this.user_id = userId
    this.comment = comment
    this.flag = flag
    this.via = via
  }
}
