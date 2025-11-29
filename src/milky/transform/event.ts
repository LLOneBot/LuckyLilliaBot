import { MilkyEventTypes } from '@/milky/common/event'
import { RawMessage, GroupNotify, FriendRequest, GroupMember, GroupSimpleInfo } from '@/ntqqapi/types'
import { transformIncomingPrivateMessage, transformIncomingGroupMessage } from './message/incoming'
import { transformFriend, transformGroup, transformGroupMember } from './entity'
import { Context } from 'cordis'

/**
 * Transform NTQQ message-created event to Milky message_receive event (private)
 */
export async function transformPrivateMessageCreated(
  ctx: Context,
  message: RawMessage
): Promise<MilkyEventTypes['message_receive'] | null> {
  try {
    const friends = await ctx.ntFriendApi.getBuddyList()
    const friend = friends.find(f => f.uin === message.peerUin)

    if (!friend) {
      return null
    }

    const defaultCategory = {
      categoryId: 0,
      categorySortId: 0,
      categroyName: '我的好友',
      categroyMbCount: friends.length,
      onlineCount: 0,
      buddyList: friends,
      buddyUids: [],
    }

    return transformIncomingPrivateMessage(friend, defaultCategory, message)
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
    const groups = await ctx.ntGroupApi.getGroups()
    const group = groups.find((g: GroupSimpleInfo) => g.groupCode === message.peerUin)
    if (!group) {
      return null
    }

    const member = await ctx.ntGroupApi.getGroupMember(message.peerUin, message.senderUin)
    if (!member) {
      return null
    }

    return transformIncomingGroupMessage(group, member, message)
  } catch (error) {
    ctx.logger.error('Failed to transform group message created event:', error)
    return null
  }
}

/**
 * Transform NTQQ message-deleted event to Milky message_recall event (private)
 */
export async function transformPrivateMessageDeleted(
  ctx: Context,
  message: RawMessage
): Promise<MilkyEventTypes['message_recall'] | null> {
  try {
    return {
      message_scene: 'friend',
      peer_id: parseInt(message.peerUin),
      message_seq: parseInt(message.msgSeq),
      sender_id: parseInt(message.senderUin || '0'),
      operator_id: parseInt(message.senderUin || '0'),
      display_suffix: '',
    }
  } catch (error) {
    ctx.logger.error('Failed to transform private message deleted event:', error)
    return null
  }
}

/**
 * Transform NTQQ message-deleted event to Milky message_recall event (group)
 */
export async function transformGroupMessageDeleted(
  ctx: Context,
  message: RawMessage
): Promise<MilkyEventTypes['message_recall'] | null> {
  try {
    return {
      message_scene: 'group',
      peer_id: parseInt(message.peerUin),
      message_seq: parseInt(message.msgSeq),
      sender_id: parseInt(message.senderUin || '0'),
      operator_id: parseInt(message.senderUin || '0'),
      display_suffix: '',
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group message deleted event:', error)
    return null
  }
}

/**
 * Transform NTQQ group-notify event to Milky group notification events
 */
export async function transformGroupNotify(
  ctx: Context,
  notify: GroupNotify,
): Promise<{ eventType: keyof MilkyEventTypes, data: any } | null> {
  try {
    // TODO: Map GroupNotifyType enum values to appropriate events
    // Current GroupNotifyType values:
    // - InvitedByMember (1)
    // - RefuseInvited
    // - RefusedByAdminiStrator
    // - AgreedTojoinDirect
    // - InvitedNeedAdminiStratorPass
    // - AgreedToJoinByAdminiStrator
    // - RequestJoinNeedAdminiStratorPass (7)
    // - SetAdmin (8)
    // - KickMemberNotifyAdmin
    // - KickMemberNotifyKicked
    // - MemberLeaveNotifyAdmin
    // - CancelAdminNotifyCanceled
    // - CancelAdminNotifyAdmin
    // - TransferGroupNotifyOldowner
    // - TransferGroupNotifyAdmin

    // TODO: Implement specific transformations for each notify type
    ctx.logger.warn('Group notify event transformation not yet implemented:', notify.type)
    return null
  } catch (error) {
    ctx.logger.error('Failed to transform group notify event:', error)
    return null
  }
}

/**
 * Transform NTQQ friend-request event to Milky friend_request event
 */
export async function transformFriendRequestEvent(
  ctx: Context,
  request: FriendRequest
): Promise<MilkyEventTypes['friend_request'] | null> {
  try {
    // TODO: Implement friend request transformation
    // Need to extract request details from FriendRequest structure
    // Should map to: { initiator_id, request_message, time }
    return null
  } catch (error) {
    ctx.logger.error('Failed to transform friend request event:', error)
    return null
  }
}

/**
 * Transform NTQQ group-member-info-updated event
 */
export async function transformGroupMemberInfoUpdated(
  ctx: Context,
  data: { groupCode: string, members: GroupMember[] }
): Promise<any | null> {
  try {
    // TODO: Implement group member info updated transformation
    // This event may need to be mapped to different Milky events based on what changed
    // (e.g., nickname change, card change, role change, etc.)
    return null
  } catch (error) {
    ctx.logger.error('Failed to transform group member info updated event:', error)
    return null
  }
}
