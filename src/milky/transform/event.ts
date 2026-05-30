import { MilkyEventTypes } from '@/milky/common/event'
import { RawMessage, FriendRequest, GroupJoinRequestEvent, GroupInvitedJoinRequestEvent, GroupInvitationEvent, MessageDeleteEvent, GroupMemberAddedEvent } from '@/ntqqapi/types'
import { transformIncomingPrivateMessage, transformIncomingGroupMessage, transformIncomingTempMessage } from './message/incoming'
import { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { Msg, Notify } from '@/ntqqapi/proto'
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

/**
 * Transform NTQQ message-deleted event to Milky message_recall event (temp)
 */
export async function transformTempMessageDeleted(
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

/**
 * Transform NTQQ message-deleted event to Milky message_recall event (private)
 */
export async function transformPrivateMessageDeleted(
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

/**
 * Transform NTQQ message-deleted event to Milky message_recall event (group)
 */
export async function transformGroupMessageDeleted(
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
  request: FriendRequest
): Promise<MilkyEventTypes['friend_request'] | null> {
  try {
    const initiatorId = Number(await ctx.ntUserApi.getUinByUid(request.friendUid))
    return {
      initiator_id: initiatorId,
      initiator_uid: request.friendUid,
      comment: request.extWords,
      via: request.addSource ?? ''
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

export async function transformPrivateMessageEvent(
  ctx: Context,
  message: RawMessage
): Promise<{ eventType: keyof MilkyEventTypes, data: Event['data'] } | null> {
  try {
    for (const element of message.elements) {
      if (element.grayTipElement?.jsonGrayTipElement?.busiId === '1061') {
        const { templParam } = element.grayTipElement.jsonGrayTipElement.xmlToJsonParam
        const userId = +message.peerUin || +(await ctx.ntUserApi.getUinByUid(message.peerUid))
        return {
          eventType: 'friend_nudge',
          data: {
            user_id: userId,
            is_self_send: templParam.get('uin_str1') === selfInfo.uin,
            is_self_receive: templParam.get('uin_str2') === selfInfo.uin,
            display_action: templParam.get('action_str') ?? '',
            display_suffix: templParam.get('suffix_str') ?? '',
            display_action_img_url: templParam.get('action_img_url') ?? ''
          } satisfies MilkyEventTypes['friend_nudge']
        }
      } else if (element.fileElement) {
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
      if (element.grayTipElement?.groupElement?.type === 8) {
        if (element.grayTipElement.groupElement.shutUp?.member.uid) {
          return {
            eventType: 'group_mute',
            data: {
              group_id: Number(message.peerUid),
              user_id: Number(await ctx.ntUserApi.getUinByUid(element.grayTipElement.groupElement.shutUp!.member.uid)),
              operator_id: Number(await ctx.ntUserApi.getUinByUid(element.grayTipElement.groupElement.shutUp!.admin.uid)),
              duration: Number(element.grayTipElement.groupElement.shutUp!.duration)
            } satisfies MilkyEventTypes['group_mute']
          }
        } else {
          return {
            eventType: 'group_whole_mute',
            data: {
              group_id: Number(message.peerUid),
              operator_id: Number(await ctx.ntUserApi.getUinByUid(element.grayTipElement.groupElement.shutUp!.admin.uid)),
              is_mute: Number(element.grayTipElement.groupElement.shutUp!.duration) > 0
            } satisfies MilkyEventTypes['group_whole_mute']
          }
        }
      } else if (element.grayTipElement?.jsonGrayTipElement?.busiId === '1061') {
        const { templParam } = element.grayTipElement.jsonGrayTipElement.xmlToJsonParam
        return {
          eventType: 'group_nudge',
          data: {
            group_id: +message.peerUid,
            sender_id: +templParam.get('uin_str1')!,
            receiver_id: +templParam.get('uin_str2')!,
            display_action: templParam.get('action_str') ?? '',
            display_suffix: templParam.get('suffix_str') ?? '',
            display_action_img_url: templParam.get('action_img_url') ?? ''
          } satisfies MilkyEventTypes['group_nudge']
        }
      } else if (element.fileElement) {
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
      } else if (element.grayTipElement?.groupElement?.type === 5) {
        return {
          eventType: 'group_name_change',
          data: {
            group_id: Number(message.peerUid),
            new_group_name: element.grayTipElement.groupElement.groupName,
            operator_id: Number(await ctx.ntUserApi.getUinByUid(element.grayTipElement.groupElement.memberUid))
          } satisfies MilkyEventTypes['group_name_change']
        }
      }
    }
    return null
  } catch (error) {
    ctx.logger.error('Failed to transform group message event:', error)
    return null
  }
}

export async function transformSystemMessageEvent(
  ctx: Context,
  data: Buffer
): Promise<{ eventType: keyof MilkyEventTypes, data: Event['data'] } | null> {
  try {
    const sysMsg = Msg.Message.decode(data)
    if (!sysMsg.body) {
      return null
    }
    const { msgType, subType } = sysMsg.contentHead
    if (msgType === 34) {
      const tip = Notify.GroupMemberChange.decode(sysMsg.body.msgContent)
      if (tip.type === 130) {
        return {
          eventType: 'group_member_decrease',
          data: {
            group_id: tip.groupCode,
            user_id: Number(await ctx.ntUserApi.getUinByUid(tip.memberUid))
          } satisfies MilkyEventTypes['group_member_decrease']
        }
      } else if (tip.type === 131) {
        if (tip.memberUid === selfInfo.uid) return null
        const memberUin = await ctx.ntUserApi.getUinByUid(tip.memberUid)
        let adminUin = 0
        let adminUid = tip.adminUid
        if (adminUid) {
          const adminUidMatch = tip.adminUid.match(/\x18([^\x18\x10]+)\x10/)
          if (adminUidMatch) {
            adminUid = adminUidMatch[1]
          }
          adminUin = await ctx.ntUserApi.getUinByUid(adminUid)
        }
        return {
          eventType: 'group_member_decrease',
          data: {
            group_id: tip.groupCode,
            user_id: +memberUin,
            operator_id: adminUin
          } satisfies MilkyEventTypes['group_member_decrease']
        }
      }
    } else if (msgType === 44) {
      const tip = Notify.GroupAdminChange.decode(sysMsg.body.msgContent)
      const adminUid = tip.isPromote ? tip.body.extraEnable?.adminUid : tip.body.extraDisable?.adminUid
      if (!adminUid) return null
      const group = await ctx.ntGroupApi.getGroup(tip.groupCode, false)
      return {
        eventType: 'group_admin_change',
        data: {
          group_id: tip.groupCode,
          user_id: Number(await ctx.ntUserApi.getUinByUid(adminUid)),
          operator_id: Number(await ctx.ntUserApi.getUinByUid(group.ownerUid)),
          is_set: tip.isPromote
        } satisfies MilkyEventTypes['group_admin_change']
      }
    } else if (msgType === 528 && subType === 39) {
      const tip = Notify.FriendDeleteOrPinChange.decode(sysMsg.body.msgContent)
      if (tip.body.type !== 7) return null
      const messageScene = tip.body.pinChanged?.body.groupCode ? 'group' : 'friend'
      const peerId = messageScene === 'group' ? tip.body.pinChanged!.body.groupCode! : Number(await ctx.ntUserApi.getUinByUid(tip.body.pinChanged!.body.uid))
      const isPinned = tip.body.pinChanged?.body.info.timestamp.length !== 0
      return {
        eventType: 'peer_pin_change',
        data: {
          message_scene: messageScene,
          peer_id: peerId,
          is_pinned: isPinned
        } satisfies MilkyEventTypes['peer_pin_change']
      }
    }
    return null
  } catch (error) {
    ctx.logger.error('Failed to transform system message event:', error)
    return null
  }
}

export async function transformOlpushEvent(
  ctx: Context,
  data: Buffer
): Promise<{ eventType: keyof MilkyEventTypes, data: Event['data'] } | null> {
  try {
    const pushMsg = Msg.PushMsg.decode(data)
    if (!pushMsg.message.body) {
      return null
    }
    const { msgType, subType } = pushMsg.message.contentHead
    if (msgType === 732 && subType === 16) {
      const notify = Msg.NotifyMessageBody.decode(pushMsg.message.body.msgContent.subarray(7))
      if (notify.field13 === 35) {
        const info = notify.reaction.data.body.info
        const target = notify.reaction.data.body.target
        const userId = Number(await ctx.ntUserApi.getUinByUid(info.operatorUid))
        return {
          eventType: 'group_message_reaction',
          data: {
            group_id: notify.groupCode,
            user_id: userId,
            message_seq: target.sequence,
            face_id: info.code,
            reaction_type: {
              1: 'face',
              2: 'emoji'
            }[info.reactionType] as 'face' | 'emoji',
            is_add: info.actionType === 1
          } satisfies MilkyEventTypes['group_message_reaction']
        }
      }
    } else if (msgType === 732 && subType === 21) {
      const notify = Msg.NotifyMessageBody.decode(pushMsg.message.body.msgContent.subarray(7))
      if (notify.type === 27) {
        return {
          eventType: 'group_essence_message_change',
          data: {
            group_id: notify.groupCode,
            message_seq: notify.essenceMessage.msgSequence,
            operator_id: notify.essenceMessage.operatorUin,
            is_set: notify.essenceMessage.setFlag === 1
          } satisfies MilkyEventTypes['group_essence_message_change']
        }
      }
    }
    return null
  } catch (error) {
    ctx.logger.error('Failed to transform olpush event:', error)
    return null
  }
}
