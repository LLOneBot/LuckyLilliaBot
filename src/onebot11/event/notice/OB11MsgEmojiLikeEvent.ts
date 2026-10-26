import { OB11GroupNoticeEvent } from './OB11GroupNoticeEvent'

interface MsgEmojiLike {
  emoji_id: string
  count: number
}

export class OB11GroupMsgEmojiLikeEvent extends OB11GroupNoticeEvent {
  notice_type = 'group_msg_emoji_like'
  message_id: number
  likes: MsgEmojiLike[]
  group_id: number
  user_id: number
  is_add: boolean

  constructor(groupId: number, userId: number, messageId: number, likes: MsgEmojiLike[], isAdd: boolean) {
    super()
    this.group_id = groupId
    this.user_id = userId // 只有对 bot 自己的消息操作时才有
    this.message_id = messageId
    this.likes = likes
    this.is_add = isAdd
  }
}
