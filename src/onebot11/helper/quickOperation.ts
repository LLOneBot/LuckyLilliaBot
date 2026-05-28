import { OB11Message, OB11MessageData, OB11MessageDataType } from '../types'
import { OB11FriendRequestEvent } from '../event/request/OB11FriendRequest'
import {
  OB11GroupRequestAddEvent,
  OB11GroupRequestEvent,
  OB11GroupRequestInviteBotEvent,
} from '../event/request/OB11GroupRequest'
import { transformOutgoingSegments } from '../transform/message/outgoing'
import { message2List, createPeer, CreatePeerMode, decodeGroupRequestFlag } from '../utils'
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

export type QuickOperationEvent = OB11Message | OB11FriendRequestEvent | OB11GroupRequestAddEvent | OB11GroupRequestInviteBotEvent;

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
  let contextMode = CreatePeerMode.Normal
  if (msg.message_type === 'group') {
    contextMode = CreatePeerMode.Group
  } else if (msg.message_type === 'private') {
    contextMode = CreatePeerMode.Private
  }
  const peer = await createPeer(ctx, msg, contextMode)
  if (reply) {
    let replyMessage: OB11MessageData[] = []
    replyMessage.push({
      type: OB11MessageDataType.Reply,
      data: {
        id: msg.message_id.toString(),
      },
    })

    if (msg.message_type == 'group') {
      if ((quickAction as QuickOperationGroupMessage).at_sender) {
        replyMessage.push({
          type: OB11MessageDataType.At,
          data: {
            qq: msg.user_id.toString(),
          },
        })
      }
    }
    replyMessage = replyMessage.concat(message2List(reply, quickAction.auto_escape))
    const { sendElements, deleteAfterSentFiles } = await transformOutgoingSegments(ctx, replyMessage, peer)
    ctx.app.sendMessage(ctx, peer, sendElements, deleteAfterSentFiles).catch(e => ctx.logger.error(e))
  }
  if (msg.message_type === 'group') {
    const groupMsgQuickAction = quickAction as QuickOperationGroupMessage
    const info = await ctx.store.getMsgInfoByShortId(msg.message_id)
    if (!info) return
    // handle group msg
    if (groupMsgQuickAction.delete) {
      ctx.ntMsgApi.recallMsg(peer, [info.msgId]).catch(e => ctx.logger.error(e))
    }
    if (groupMsgQuickAction.kick) {
      let msg = ctx.store.getMsgByMsgId(info.msgId)
      if (!msg) {
        msg = (await ctx.ntMsgApi.getSingleMsg(info.peer, info.msgSeq)).msgList[0]
      }
      ctx.ntGroupApi.kickGroupMember(+peer.peerUid, [msg.senderUid]).catch(e => ctx.logger.error(e))
    }
    if (groupMsgQuickAction.ban) {
      let msg = ctx.store.getMsgByMsgId(info.msgId)
      if (!msg) {
        msg = (await ctx.ntMsgApi.getSingleMsg(info.peer, info.msgSeq)).msgList[0]
      }
      ctx.ntGroupApi.muteGroupMember(+peer.peerUid, [
        {
          uid: msg.senderUid,
          duration: groupMsgQuickAction.ban_duration || 60 * 30,
        },
      ]).catch(e => ctx.logger.error(e))
    }
  }
}

async function handleFriendRequest(ctx: Context, request: OB11FriendRequestEvent, quickAction: QuickOperationFriendRequest) {
  if (!isNullable(quickAction.approve)) {
    await ctx.ntFriendApi.approvalFriendRequest(request.flag, quickAction.approve).catch(e => ctx.logger.error(e))
    if (!isNullable(quickAction.remark)) {
      await ctx.ntFriendApi.setFriendRemark(request.flag, quickAction.remark).catch(e => ctx.logger.error(e))
    }
  }
}


async function handleGroupRequest(ctx: Context, request: OB11GroupRequestEvent, quickAction: QuickOperationGroupRequest) {
  if (!isNullable(quickAction.approve)) {
    const decoded = decodeGroupRequestFlag(request.flag)
    ctx.ntGroupApi.setGroupRequest(
      decoded.doubt,
      decoded.groupCode,
      Number(decoded.seq),
      decoded.type,
      quickAction.approve,
      quickAction.reason,
    ).catch(e => ctx.logger.error(e))
  }
}
