import { OB11BaseNoticeEvent } from '../notice/OB11BaseNoticeEvent'
import { EventType } from '../OB11BaseEvent'

export class OB11FriendRequestEvent extends OB11BaseNoticeEvent {
  post_type = EventType.REQUEST
  user_id: number
  request_type: 'friend' = 'friend'
  comment: string
  flag: string
}
