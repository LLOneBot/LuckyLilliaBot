import { OB11GroupNoticeEvent } from './OB11GroupNoticeEvent'
import { ChatType, TipXmlElement } from '@/ntqqapi/types'
import { Context } from 'cordis'

interface MsgEmojiLike {
  emoji_id: string
  count: number
}

export class GroupMsgEmojiLikeEvent extends OB11GroupNoticeEvent {
  notice_type = 'group_msg_emoji_like'
  message_id: number
  likes: MsgEmojiLike[]
  group_id: number
  user_id: number

  constructor(groupId: number, userId: number, messageId: number, likes: MsgEmojiLike[]) {
    super()
    this.group_id = groupId
    this.user_id = userId // 可为空，表示是对别人的消息操作，如果是对bot自己的消息则不为空
    this.message_id = messageId
    this.likes = likes
  }

  static async parse(ctx: Context, xmlElement: TipXmlElement, groupCode: string) {
    const senderUin = xmlElement.templParam.get('jp_uin')
    const msgSeq = xmlElement.templParam.get('msg_seq')
    const emojiId = xmlElement.templParam.get('face_id')
    const peer = {
      chatType: ChatType.Group,
      guildId: '',
      peerUid: groupCode,
    }
    const replyMsgList = (await ctx.ntMsgApi.queryFirstMsgBySeq(peer, msgSeq!)).msgList
    if (!replyMsgList?.length) {
      return
    }
    const shortId = ctx.store.createMsgShortId(peer, replyMsgList[0].msgId)
    return new GroupMsgEmojiLikeEvent(
      parseInt(groupCode),
      parseInt(senderUin!),
      shortId,
      [{
        emoji_id: emojiId!,
        count: 1,
      }]
    )
  }
}
