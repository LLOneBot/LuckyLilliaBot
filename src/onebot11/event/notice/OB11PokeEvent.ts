import { OB11BaseNoticeEvent } from './OB11BaseNoticeEvent'

abstract class OB11PokeEvent extends OB11BaseNoticeEvent {
  notice_type = 'notify'
  sub_type: 'poke' | 'poke_recall' = 'poke'
  target_id = 0
  abstract user_id: number
}

export class OB11FriendPokeEvent extends OB11PokeEvent {
  user_id: number
  raw_info: unknown

  constructor(user_id: number, target_id: number, raw_message: unknown) {
    super()
    this.target_id = target_id
    this.user_id = user_id
    // 有的框架要求它是 string
    this.raw_info = raw_message
  }
}

export class OB11GroupPokeEvent extends OB11PokeEvent {
  user_id: number
  group_id: number
  raw_info: unknown

  constructor(group_id: number, user_id: number, target_id: number, raw_message: unknown) {
    super()
    this.group_id = group_id
    this.target_id = target_id
    this.user_id = user_id
    this.raw_info = raw_message
  }
}


export class OB11FriendPokeRecallEvent extends OB11FriendPokeEvent{
  sub_type: 'poke' | 'poke_recall' = 'poke_recall'
}

export class OB11GroupPokeRecallEvent extends OB11GroupPokeEvent{
  sub_type: 'poke' | 'poke_recall' = 'poke_recall'
}
