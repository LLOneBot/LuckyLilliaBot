import { OB11Message, OB11MessageAt, OB11MessageData, OB11MessageDataType } from '../types'
import { OB11FriendRequestEvent } from '../event/request/OB11FriendRequest'
import { OB11GroupRequestEvent } from '../event/request/OB11GroupRequest'
import { ChatType, GroupRequestOperateTypes, Peer } from '@/ntqqapi/types'
import { convertMessage2List, createSendElements, sendMsg } from '../helper/createMessage'
import { getConfigUtil } from '@/common/config'
import { MessageUnique } from '@/common/utils/messageUnique'
import { isNullable } from 'cosmokit'
import { Context } from 'cordis'

interface QuickOperationPrivateMessage {
  reply?: string
  auto_escape?: boolean
}

interface QuickOperationGroupMessage extends QuickOperationPrivateMessage {
  // 回复群消息
  at_sender?: boolean
  delete?: boolean
  kick?: boolean
  ban?: boolean
  ban_duration?: number
}

interface QuickOperationFriendRequest {
  approve?: boolean
  remark?: string
}

interface QuickOperationGroupRequest {
  approve?: boolean
  reason?: string
}

export type QuickOperation = QuickOperationPrivateMessage &
  QuickOperationGroupMessage &
  QuickOperationFriendRequest &
  QuickOperationGroupRequest

export type QuickOperationEvent = OB11Message | OB11FriendRequestEvent | OB11GroupRequestEvent;

export async function handleQuickOperation(ctx: Context, event: QuickOperationEvent, quickAction: QuickOperation) {
  if (event.post_type === 'message') {
    handleMsg(ctx, event as OB11Message, quickAction).then().catch(e => ctx.logger.error(e))
  }
  if (event.post_type === 'request') {
    const friendRequest = event as OB11FriendRequestEvent
    const groupRequest = event as OB11GroupRequestEvent
    if ((friendRequest).request_type === 'friend') {
      handleFriendRequest(ctx, friendRequest, quickAction).then().catch(e => ctx.logger.error(e))
    }
    else if (groupRequest.request_type === 'group') {
      handleGroupRequest(ctx, groupRequest, quickAction).then().catch(e => ctx.logger.error(e))
    }
  }
}

async function handleMsg(ctx: Context, msg: OB11Message, quickAction: QuickOperationPrivateMessage | QuickOperationGroupMessage) {
  const reply = quickAction.reply
  const ob11Config = getConfigUtil().getConfig().ob11
  const peer: Peer = {
    chatType: ChatType.friend,
    peerUid: msg.user_id.toString(),
  }
  if (msg.message_type == 'private') {
    peer.peerUid = (await ctx.ntUserApi.getUidByUin(msg.user_id.toString()))!
    if (msg.sub_type === 'group') {
      peer.chatType = ChatType.temp
    }
  }
  else {
    peer.chatType = ChatType.group
    peer.peerUid = msg.group_id?.toString()!
  }
  if (reply) {
    let replyMessage: OB11MessageData[] = []
    if (ob11Config.enableQOAutoQuote) {
      replyMessage.push({
        type: OB11MessageDataType.reply,
        data: {
          id: msg.message_id.toString(),
        },
      })
    }

    if (msg.message_type == 'group') {
      if ((quickAction as QuickOperationGroupMessage).at_sender) {
        replyMessage.push({
          type: 'at',
          data: {
            qq: msg.user_id.toString(),
          },
        } as OB11MessageAt)
      }
    }
    replyMessage = replyMessage.concat(convertMessage2List(reply, quickAction.auto_escape))
    const { sendElements, deleteAfterSentFiles } = await createSendElements(ctx, replyMessage, peer)
    sendMsg(ctx, peer, sendElements, deleteAfterSentFiles, false).catch(e => ctx.logger.error(e))
  }
  if (msg.message_type === 'group') {
    const groupMsgQuickAction = quickAction as QuickOperationGroupMessage
    const rawMessage = await MessageUnique.getMsgIdAndPeerByShortId(+(msg.message_id ?? 0))
    if (!rawMessage) return
    // handle group msg
    if (groupMsgQuickAction.delete) {
      ctx.ntMsgApi.recallMsg(peer, [rawMessage.MsgId]).catch(e => ctx.logger.error(e))
    }
    if (groupMsgQuickAction.kick) {
      const { msgList } = await ctx.ntMsgApi.getMsgsByMsgId(peer, [rawMessage.MsgId])
      ctx.ntGroupApi.kickMember(peer.peerUid, [msgList[0].senderUid]).catch(e => ctx.logger.error(e))
    }
    if (groupMsgQuickAction.ban) {
      const { msgList } = await ctx.ntMsgApi.getMsgsByMsgId(peer, [rawMessage.MsgId])
      ctx.ntGroupApi.banMember(peer.peerUid, [
        {
          uid: msgList[0].senderUid,
          timeStamp: groupMsgQuickAction.ban_duration || 60 * 30,
        },
      ]).catch(e => ctx.logger.error(e))
    }
  }
}

async function handleFriendRequest(ctx: Context, request: OB11FriendRequestEvent, quickAction: QuickOperationFriendRequest) {
  if (!isNullable(quickAction.approve)) {
    // todo: set remark
    ctx.ntFriendApi.handleFriendRequest(request.flag, quickAction.approve).catch(e => ctx.logger.error(e))
  }
}


async function handleGroupRequest(ctx: Context, request: OB11GroupRequestEvent, quickAction: QuickOperationGroupRequest) {
  if (!isNullable(quickAction.approve)) {
    ctx.ntGroupApi.handleGroupRequest(
      request.flag,
      quickAction.approve ? GroupRequestOperateTypes.approve : GroupRequestOperateTypes.reject,
      quickAction.reason,
    ).catch(e => ctx.logger.error(e))
  }
}