import { OB11BaseNoticeEvent } from './OB11BaseNoticeEvent'

export abstract class OB11GroupNoticeEvent extends OB11BaseNoticeEvent {
  abstract group_id: number
  abstract user_id: number
  abstract notice_type: string
}
