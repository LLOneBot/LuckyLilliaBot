import { MilkyEventTypes } from '@/milky/common/event'
import { RawMessage, GroupJoinRequestEvent, GroupInvitedJoinRequestEvent, GroupInvitationEvent, MessageDeleteEvent, GroupMemberAddedEvent, GroupMemberRemovedEvent, FriendRequestEvent, FriendNudgeEvent, GroupNudgeEvent, GroupNameChangedEvent, GroupMuteEvent, GroupWholeMuteEvent, GroupAdminChangedEvent, PinChangedEvent, ChatType, GroupMessageReactionEvent, GroupEssenceMessageChangedEvent } from '@/ntqqapi/types'
import { transformIncomingPrivateMessage, transformIncomingGroupMessage, transformIncomingTempMessage } from './message/incoming'
import { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { Event } from '@saltify/milky-types'

/**
 * Transform NTQQ message-created event to Milky message_receive event (private)
 */
export async function transformPrivateMessageCreated(
  ctx: Context,
  message: RawMessage
): Promise<MilkyEventTypes['message_receive'] | null> {
  try {
    if (!message.senderUid) return null
    const friend = await ctx.ntFriendApi.getFriendByUid(message.senderUid, false)

    const transformedMessage = await transformIncomingPrivateMessage(ctx, friend!, message)
    if (transformedMessage.segments.length === 0) {
      return null
    }
    return transformedMessage
  } catch (error) {
    ctx.logger.error('Failed to transform private message created event:', error)
    return null
  }
}

/**
 * Transform NTQQ message-created event to Milky message_receive event (group)
 */
export async function transformGroupMessageCreated(
  ctx: Context,
  message: RawMessage
): Promise<MilkyEventTypes['message_receive'] | null> {
  try {
    if (!message.senderUid) return null
    const group = await ctx.ntGroupApi.getGroup(+message.peerUid, false)
    const member = await ctx.ntGroupApi.getGroupMemberByUid(+message.peerUin, message.senderUid, false)

    const transformedMessage = await transformIncomingGroupMessage(ctx, group, member!, message)
    if (transformedMessage.segments.length === 0) {
      return null
    }
    return transformedMessage
  } catch (error) {
    ctx.logger.error('Failed to transform group message created event:', error)
    return null
  }
}

/**
 * Transform NTQQ message-created event to Milky message_receive event (temp)
 */
export async function transformTempMessageCreated(
  ctx: Context,
  message: RawMessage
): Promise<MilkyEventTypes['message_receive'] | null> {
  try {
    if (!message.senderUid) return null
    const group = await ctx.ntGroupApi.getGroup(message.tempFromGroupCode, false)

    const transformedMessage = await transformIncomingTempMessage(ctx, group, message)
    if (transformedMessage.segments.length === 0) {
      return null
    }
    return transformedMessage
  } catch (error) {
    ctx.logger.error('Failed to transform temp message created event:', error)
    return null
  }
}

export async function transformTempMessageRecall(
  ctx: Context,
  data: MessageDeleteEvent
): Promise<MilkyEventTypes['message_recall'] | null> {
  try {
    return {
      message_scene: 'temp',
      peer_id: data.peerUin,
      message_seq: data.msgSeq,
      sender_id: data.senderUin,
      operator_id: data.senderUin,
      display_suffix: data.displaySuffix,
    }
  } catch (error) {
    ctx.logger.error('Failed to transform temp message deleted event:', error)
    return null
  }
}

export async function transformFriendMessageRecall(
  ctx: Context,
  data: MessageDeleteEvent
): Promise<MilkyEventTypes['message_recall'] | null> {
  try {
    return {
      message_scene: 'friend',
      peer_id: data.peerUin,
      message_seq: data.msgSeq,
      sender_id: data.senderUin,
      operator_id: data.senderUin,
      display_suffix: data.displaySuffix,
    }
  } catch (error) {
    ctx.logger.error('Failed to transform private message deleted event:', error)
    return null
  }
}

export async function transformGroupMessageRecall(
  ctx: Context,
  data: MessageDeleteEvent
): Promise<MilkyEventTypes['message_recall'] | null> {
  try {
    return {
      message_scene: 'group',
      peer_id: data.peerUin,
      message_seq: data.msgSeq,
      sender_id: data.senderUin,
      operator_id: data.operatorUin,
      display_suffix: data.displaySuffix,
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group message deleted event:', error)
    return null
  }
}

/**
 * Transform NTQQ friend-request event to Milky friend_request event
 */
export async function transformFriendRequestEvent(
  ctx: Context,
  data: FriendRequestEvent
): Promise<MilkyEventTypes['friend_request'] | null> {
  try {
    return {
      initiator_id: data.initiatorUin,
      initiator_uid: data.initiatorUid,
      comment: data.comment,
      via: data.via
    }
  } catch (error) {
    ctx.logger.error('Failed to transform friend request event:', error)
    return null
  }
}

export async function transformGroupJoinRequestEvent(
  ctx: Context,
  data: GroupJoinRequestEvent
): Promise<MilkyEventTypes['group_join_request'] | null> {
  try {
    return {
      group_id: data.groupCode,
      notification_seq: Number(data.notificationSeq),
      is_filtered: data.isDoubt,
      initiator_id: data.initiatorUin,
      comment: data.comment
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group join request event:', error)
    return null
  }
}

export async function transformGroupInvitedJoinRequestEvent(
  ctx: Context,
  data: GroupInvitedJoinRequestEvent
): Promise<MilkyEventTypes['group_invited_join_request'] | null> {
  try {
    return {
      group_id: data.groupCode,
      notification_seq: Number(data.notificationSeq),
      initiator_id: data.initiatorUin,
      target_user_id: data.targetUserUin
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group invited join request event:', error)
    return null
  }
}

export async function transformGroupInvitationEvent(
  ctx: Context,
  data: GroupInvitationEvent
): Promise<MilkyEventTypes['group_invitation'] | null> {
  try {
    return {
      group_id: data.groupCode,
      invitation_seq: Number(data.invitationSeq),
      initiator_id: data.initiatorUin
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group invitation event:', error)
    return null
  }
}

export async function transformGroupMemberIncreaseEvent(
  ctx: Context,
  data: GroupMemberAddedEvent
): Promise<MilkyEventTypes['group_member_increase'] | null> {
  try {
    return {
      group_id: data.groupCode,
      user_id: data.memberUin,
      operator_id: data.operatorUin,
      invitor_id: data.invitorUin
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group member increase event:', error)
    return null
  }
}

export async function transformGroupMemberDecreaseEvent(
  ctx: Context,
  data: GroupMemberRemovedEvent
): Promise<MilkyEventTypes['group_member_decrease'] | null> {
  try {
    return {
      group_id: data.groupCode,
      user_id: data.memberUin,
      operator_id: data.operatorUin
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group member decrease event:', error)
    return null
  }
}

export async function transformFriendNudgeEvent(
  ctx: Context,
  data: FriendNudgeEvent
): Promise<MilkyEventTypes['friend_nudge'] | null> {
  try {
    return {
      user_id: data.uin,
      is_self_send: data.isSelfSend,
      is_self_receive: data.isSelfReceive,
      display_action: data.displayAction,
      display_suffix: data.displaySuffix,
      display_action_img_url: data.displayActionImgUrl,
    }
  } catch (error) {
    ctx.logger.error('Failed to transform friend nudge event:', error)
    return null
  }
}

export async function transformGroupNudgeEvent(
  ctx: Context,
  data: GroupNudgeEvent
): Promise<MilkyEventTypes['group_nudge'] | null> {
  try {
    return {
      group_id: data.groupCode,
      sender_id: data.senderUin,
      receiver_id: data.receiverUin,
      display_action: data.displayAction,
      display_suffix: data.displaySuffix,
      display_action_img_url: data.displayActionImgUrl,
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group nudge event:', error)
    return null
  }
}

export async function transformGroupNameChangeEvent(
  ctx: Context,
  data: GroupNameChangedEvent
): Promise<MilkyEventTypes['group_name_change'] | null> {
  try {
    return {
      group_id: data.groupCode,
      new_group_name: data.newGroupName,
      operator_id: data.operatorUin
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group name change event:', error)
    return null
  }
}

export async function transformGroupMuteEvent(
  ctx: Context,
  data: GroupMuteEvent
): Promise<MilkyEventTypes['group_mute'] | null> {
  try {
    return {
      group_id: data.groupCode,
      user_id: data.memberUin,
      operator_id: data.operatorUin,
      duration: data.duration
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group mute event:', error)
    return null
  }
}

export async function transformGroupWholeMuteEvent(
  ctx: Context,
  data: GroupWholeMuteEvent
): Promise<MilkyEventTypes['group_whole_mute'] | null> {
  try {
    return {
      group_id: data.groupCode,
      operator_id: data.operatorUin,
      is_mute: data.isMute
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group mute event:', error)
    return null
  }
}

export async function transformGroupAdminChangeEvent(
  ctx: Context,
  data: GroupAdminChangedEvent
): Promise<MilkyEventTypes['group_admin_change'] | null> {
  try {
    return {
      group_id: data.groupCode,
      user_id: data.targetUin,
      operator_id: data.operatorUin,
      is_set: data.isSet
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group admin change event:', error)
    return null
  }
}

export async function transformPeerPinChangeEvent(
  ctx: Context,
  data: PinChangedEvent
): Promise<MilkyEventTypes['peer_pin_change'] | null> {
  try {
    return {
      message_scene: data.chatType === ChatType.Group ? 'group' : 'friend',
      peer_id: data.peerUin,
      is_pinned: data.isPinned
    }
  } catch (error) {
    ctx.logger.error('Failed to transform peer pin change event:', error)
    return null
  }
}

export async function transformGroupMessageReactionEvent(
  ctx: Context,
  data: GroupMessageReactionEvent
): Promise<MilkyEventTypes['group_message_reaction'] | null> {
  try {
    return {
      group_id: data.groupCode,
      user_id: data.operatorUin,
      message_seq: data.msgSeq,
      face_id: data.faceId,
      reaction_type: data.type === 2 ? 'emoji' : 'face',
      is_add: data.isAdd
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group message reaction event:', error)
    return null
  }
}

export async function transformGroupEssenceMessageChangeEvent(
  ctx: Context,
  data: GroupEssenceMessageChangedEvent
): Promise<MilkyEventTypes['group_essence_message_change'] | null> {
  try {
    return {
      group_id: data.groupCode,
      message_seq: data.msgSeq,
      operator_id: data.operatorUin,
      is_set: data.isSet
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group essence message change event:', error)
    return null
  }
}

export async function transformPrivateMessageEvent(
  ctx: Context,
  message: RawMessage
): Promise<{ eventType: keyof MilkyEventTypes, data: Event['data'] } | null> {
  try {
    for (const element of message.elements) {
      if (element.fileElement) {
        return {
          eventType: 'friend_file_upload',
          data: {
            user_id: +message.peerUin,
            file_id: element.fileElement.fileUuid,
            file_name: element.fileElement.fileName,
            file_size: +element.fileElement.fileSize,
            // FileElement.fileMd5 即文件 md5（hex），milky 协议 file_hash 字段就是它。
            file_hash: element.fileElement.fileMd5 ?? '',
            is_self: message.senderUin === +selfInfo.uin
          } satisfies MilkyEventTypes['friend_file_upload']
        }
      }
    }
    return null
  } catch (error) {
    ctx.logger.error('Failed to transform private message event:', error)
    return null
  }
}

export async function transformGroupMessageEvent(
  ctx: Context,
  message: RawMessage
): Promise<{ eventType: keyof MilkyEventTypes, data: Event['data'] } | { eventType: keyof MilkyEventTypes, data: Event['data'] }[] | null> {
  try {
    for (const element of message.elements) {
      if (element.fileElement) {
        return {
          eventType: 'group_file_upload',
          data: {
            group_id: +message.peerUid,
            user_id: +message.senderUin,
            file_id: element.fileElement.fileUuid,
            file_name: element.fileElement.fileName,
            file_size: +element.fileElement.fileSize
          } satisfies MilkyEventTypes['group_file_upload']
        }
      }
    }
    return null
  } catch (error) {
    ctx.logger.error('Failed to transform group message event:', error)
    return null
  }
}
