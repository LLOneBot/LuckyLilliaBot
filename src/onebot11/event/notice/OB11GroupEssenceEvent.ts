import { OB11GroupNoticeEvent } from './OB11GroupNoticeEvent'
import { ChatType } from '@/ntqqapi/types'
import { Context } from 'cordis'

export class GroupEssenceEvent extends OB11GroupNoticeEvent {
  notice_type = 'essence'
  message_id: number
  sender_id: number
  sub_type: 'add' | 'delete' = 'add'
  group_id: number
  user_id: number
  operator_id: number

  constructor(groupId: number, messageId: number, senderId: number, operatorId: number) {
    super()
    this.group_id = groupId
    this.user_id = senderId
    this.message_id = messageId
    this.sender_id = senderId
    this.operator_id = operatorId
  }

  static async parse(ctx: Context, url: URL) {
    const searchParams = url.searchParams
    const msgSeq = searchParams.get('seq')
    const groupCode = searchParams.get('gc')
    const msgRandom = searchParams.get('random')
    if (!groupCode || !msgSeq || !msgRandom) return
    const peer = {
      guildId: '',
      chatType: ChatType.Group,
      peerUid: groupCode
    }
    const essence = await ctx.ntGroupApi.queryCachedEssenceMsg(groupCode, msgSeq, msgRandom)
    const { msgList } = await ctx.ntMsgApi.queryMsgsWithFilterExBySeq(peer, msgSeq, '0')
    const sourceMsg = msgList.find(e => e.msgRandom === msgRandom)
    if (!sourceMsg) return
    return new GroupEssenceEvent(
      parseInt(groupCode),
      ctx.store.getShortIdByMsgInfo(peer, sourceMsg.msgId)!,
      parseInt(essence.items[0]?.msgSenderUin ?? sourceMsg.senderUin),
      parseInt(essence.items[0]?.opUin ?? '0'),
    )
  }
}
