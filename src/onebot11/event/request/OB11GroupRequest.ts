import { OB11BaseNoticeEvent } from '../notice/OB11BaseNoticeEvent'
import { EventType } from '../OB11BaseEvent'

export class OB11GroupRequestAddEvent extends OB11BaseNoticeEvent {
  post_type = EventType.REQUEST
  request_type = 'group'
  sub_type: 'add'
  group_id: number
  user_id: number
  comment: string
  flag: string
  // 当有 invitor_id 时表示有邀请人
  invitor_id: number // https://github.com/Mrs4s/go-cqhttp/blob/master/coolq/event.go#L566

  constructor(groupId: number, userId: number, flag: string, comment: string, invitorId: number = 0) {
    super()
    this.group_id = groupId
    this.user_id = userId
    this.comment = comment
    this.flag = flag
    this.sub_type = 'add'
    this.invitor_id = invitorId
  }
}

export class OB11GroupRequestInviteBotEvent extends OB11BaseNoticeEvent {
  post_type = EventType.REQUEST
  request_type = 'group'
  sub_type: 'invite'  // invite 为邀请 bot 进群
  group_id: number
  user_id: number  // 当 sub_type 为 invite 的时候， user_id 为邀请人的 QQ 号
  comment: string
  flag: string
  source_group_id?: number

  constructor(groupId: number, userId: number, flag: string, comment: string, sourceGroupId?: number) {
    super()
    this.group_id = groupId
    this.user_id = userId
    this.comment = comment
    this.flag = flag
    this.sub_type = 'invite'
    this.source_group_id = sourceGroupId
  }
}

export type OB11GroupRequestEvent = OB11GroupRequestAddEvent | OB11GroupRequestInviteBotEvent
