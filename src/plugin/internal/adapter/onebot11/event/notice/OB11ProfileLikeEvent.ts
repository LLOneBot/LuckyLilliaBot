import { OB11BaseNoticeEvent } from './OB11BaseNoticeEvent'

export class OB11ProfileLikeEvent extends OB11BaseNoticeEvent {
  notice_type = 'notify'
  sub_type = 'profile_like'
  operator_id: number
  operator_nick: string
  times: number

  constructor(operatorId: number, operatorNick: string, times: number) {
    super()
    this.operator_id = operatorId
    this.operator_nick = operatorNick
    this.times = times
  }
}