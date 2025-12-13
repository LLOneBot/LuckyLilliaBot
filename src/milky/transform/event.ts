import { MilkyEventTypes } from '@/milky/common/event'
import { RawMessage, GroupNotify, FriendRequest, GroupNotifyType, GroupNotifyStatus } from '@/ntqqapi/types'
import { transformIncomingPrivateMessage, transformIncomingGroupMessage } from './message/incoming'
import { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { Msg, Notify } from '@/ntqqapi/proto'

/**
 * Transform NTQQ message-created event to Milky message_receive event (private)
 */
export async function transformPrivateMessageCreated(
  ctx: Context,
  message: RawMessage
): Promise<MilkyEventTypes['message_receive'] | null> {
  try {
    if (!message.senderUid) return null
    const friend = await ctx.ntUserApi.getUserSimpleInfo(message.senderUid)
    const category = await ctx.ntFriendApi.getCategoryById(friend.baseInfo.categoryId)

    return await transformIncomingPrivateMessage(ctx, friend, category, message)
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
    const group = await ctx.ntGroupApi.getGroupAllInfo(message.peerUid)
    const member = await ctx.ntGroupApi.getGroupMember(message.peerUin, message.senderUid)

    return await transformIncomingGroupMessage(ctx, group, member, message)
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
    const revokeElement = message.elements[0].grayTipElement!.revokeElement!
    return {
      message_scene: 'friend',
      peer_id: Number(message.peerUin),
      message_seq: Number(message.msgSeq),
      sender_id: Number(message.senderUin),
      operator_id: Number(await ctx.ntUserApi.getUinByUid(revokeElement.operatorUid)),
      display_suffix: revokeElement.wording,
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
    const revokeElement = message.elements[0].grayTipElement!.revokeElement!
    return {
      message_scene: 'group',
      peer_id: Number(message.peerUin),
      message_seq: Number(message.msgSeq),
      sender_id: Number(message.senderUin),
      operator_id: Number(await ctx.ntUserApi.getUinByUid(revokeElement.operatorUid)),
      display_suffix: revokeElement.wording,
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
    let via = ''
    if (request.sourceId === 3020) {
      via = 'QQ号查找'
    } else if (request.sourceId === 3004) {
      const groupAll = await ctx.ntGroupApi.getGroupAllInfo(request.groupCode)
      via = `QQ群-${groupAll.groupName}`
    } else if (request.sourceId === 3014) {
      via = '手机号码查找'
    } else if (request.sourceId === 3999) {
      via = '搜索好友'
    } else if (request.sourceId === 3022) {
      via = '推荐联系人'
    } else if (request.sourceId > 10) {
      ctx.logger.info(`via 获取失败, 请反馈, friendId: ${initiatorId}, sourceId: ${request.sourceId}`)
    }
    return {
      initiator_id: initiatorId,
      initiator_uid: request.friendUid,
      comment: request.extWords,
      via
    }
  } catch (error) {
    ctx.logger.error('Failed to transform friend request event:', error)
    return null
  }
}

/**
 * Transform NTQQ group-notify event to Milky group notification events
 */
export async function transformGroupNotify(
  ctx: Context,
  notify: GroupNotify,
  doubt: boolean
): Promise<{ eventType: keyof MilkyEventTypes, data: any } | null> {
  try {
    if (notify.type === GroupNotifyType.RequestJoinNeedAdminiStratorPass && notify.status === GroupNotifyStatus.Unhandle) {
      return {
        eventType: 'group_join_request',
        data: {
          group_id: Number(notify.group.groupCode),
          notification_seq: Number(notify.seq),
          is_filtered: doubt,
          initiator_id: Number(await ctx.ntUserApi.getUinByUid(notify.user1.uid)),
          comment: notify.postscript
        }
      }
    }
    else if (notify.type === GroupNotifyType.InvitedNeedAdminiStratorPass && notify.status === GroupNotifyStatus.Unhandle) {
      return {
        eventType: 'group_invited_join_request',
        data: {
          group_id: Number(notify.group.groupCode),
          notification_seq: Number(notify.seq),
          initiator_id: Number(await ctx.ntUserApi.getUinByUid(notify.user2.uid)),
          target_user_id: Number(await ctx.ntUserApi.getUinByUid(notify.user1.uid))
        }
      }
    }
    else if (notify.type === GroupNotifyType.InvitedByMember && notify.status === GroupNotifyStatus.Unhandle) {
      return {
        eventType: 'group_invitation',
        data: {
          group_id: Number(notify.group.groupCode),
          invitation_seq: Number(notify.seq),
          initiator_id: Number(await ctx.ntUserApi.getUinByUid(notify.user2.uid))
        }
      }
    }
    else if ([
      GroupNotifyType.SetAdmin,
      GroupNotifyType.CancelAdminNotifyCanceled,
      GroupNotifyType.CancelAdminNotifyAdmin,
    ].includes(notify.type)) {
      return {
        eventType: 'group_admin_change',
        data: {
          group_id: Number(notify.group.groupCode),
          user_id: Number(await ctx.ntUserApi.getUinByUid(notify.user1.uid)),
          is_set: notify.type === GroupNotifyType.SetAdmin
        }
      }
    }
    else {
      return null
    }
  } catch (error) {
    ctx.logger.error('Failed to transform group notify event:', error)
    return null
  }
}

export async function transformPrivateMessageEvent(
  ctx: Context,
  message: RawMessage
): Promise<{ eventType: keyof MilkyEventTypes, data: any } | null> {
  try {
    for (const element of message.elements) {
      if (element.grayTipElement?.jsonGrayTipElement?.busiId === '1061') {
        const { templParam } = element.grayTipElement.jsonGrayTipElement.xmlToJsonParam
        return {
          eventType: 'friend_nudge',
          data: {
            user_id: +message.peerUin,
            is_self_send: templParam.get('uin_str1') === selfInfo.uin,
            is_self_receive: templParam.get('uin_str2') === selfInfo.uin,
            display_action: templParam.get('action_str'),
            display_suffix: templParam.get('suffix_str'),
            display_action_img_url: templParam.get('action_img_url')
          }
        }
      } else if (element.fileElement) {
        return {
          eventType: 'friend_file_upload',
          data: {
            user_id: +message.peerUin,
            file_id: element.fileElement.fileUuid,
            file_name: element.fileElement.fileName,
            file_size: +element.fileElement.fileSize,
            file_hash: '', // 拿不到
            is_self: message.senderUin === selfInfo.uin
          }
        }
      } else if (element.arkElement) {
        const data = JSON.parse(element.arkElement.bytesData)
        if (data.app === 'com.tencent.qun.invite' || (data.app === 'com.tencent.tuwen.lua' && data.bizsrc === 'qun.invite')) {
          const params = new URLSearchParams(data.meta.news.jumpUrl)
          const receiverUin = params.get('receiveruin')
          const senderUin = params.get('senderuin')
          if (receiverUin !== selfInfo.uin || senderUin !== message.senderUin) {
            return null
          }
          const groupCode = params.get('groupcode')!
          const seq = params.get('msgseq')!
          return {
            eventType: 'group_invitation',
            data: {
              group_id: +groupCode,
              invitation_seq: +seq,
              initiator_id: +senderUin
            }
          }
        }
      }
    }
    return null
  } catch (error) {
    ctx.logger.error('Failed to transform message event:', error)
    return null
  }
}

export async function transformGroupMessageEvent(
  ctx: Context,
  message: RawMessage
): Promise<{ eventType: keyof MilkyEventTypes, data: any } | null> {
  try {
    for (const element of message.elements) {
      if (
        element.grayTipElement?.xmlElement?.busiId === '10145' ||
        element.grayTipElement?.xmlElement?.busiId === '10146'
      ) {
        const invitor = element.grayTipElement.xmlElement.templParam.get('invitor')!
        const invitee = element.grayTipElement.xmlElement.templParam.get('invitee')!
        return {
          eventType: 'group_member_increase',
          data: {
            group_id: +message.peerUid,
            user_id: +invitee,
            invitor_id: +invitor
          }
        }
      } else if (element.grayTipElement?.groupElement?.type === 8) {
        if (element.grayTipElement.groupElement.shutUp?.member.uid) {
          return {
            eventType: 'group_mute',
            data: {
              group_id: Number(message.peerUid),
              user_id: Number(await ctx.ntUserApi.getUinByUid(element.grayTipElement.groupElement.shutUp!.member.uid)),
              operator_id: Number(await ctx.ntUserApi.getUinByUid(element.grayTipElement.groupElement.shutUp!.admin.uid)),
              duration: Number(element.grayTipElement.groupElement.shutUp!.duration)
            }
          }
        } else {
          return {
            eventType: 'group_whole_mute',
            data: {
              group_id: Number(message.peerUid),
              operator_id: Number(await ctx.ntUserApi.getUinByUid(element.grayTipElement.groupElement.shutUp!.admin.uid)),
              is_mute: Number(element.grayTipElement.groupElement.shutUp!.duration) > 0
            }
          }
        }
      } else if (element.grayTipElement?.jsonGrayTipElement?.busiId === '1061') {
        const { templParam } = element.grayTipElement.jsonGrayTipElement.xmlToJsonParam
        return {
          eventType: 'group_nudge',
          data: {
            user_id: +message.peerUin,
            sender_id: templParam.get('uin_str1'),
            receiver_id: templParam.get('uin_str2'),
            display_action: templParam.get('action_str'),
            display_suffix: templParam.get('suffix_str'),
            display_action_img_url: templParam.get('action_img_url')
          }
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
          }
        }
      } else if (element.grayTipElement?.groupElement?.type === 5) {
        return {
          eventType: 'group_name_change',
          data: {
            group_id: Number(message.peerUid),
            new_group_name: element.grayTipElement.groupElement.groupName,
            operator_id: Number(await ctx.ntUserApi.getUinByUid(element.grayTipElement.groupElement.memberUid))
          }
        }
      }
    }
    return null
  } catch (error) {
    ctx.logger.error('Failed to transform message event:', error)
    return null
  }
}

export async function transformSystemMessageEvent(
  ctx: Context,
  data: Buffer
): Promise<{ eventType: keyof MilkyEventTypes, data: any } | null> {
  try {
    const sysMsg = Msg.Message.decode(data)
    const { msgType, subType } = sysMsg.contentHead ?? {}
    if (msgType === 33) {
      const tip = Notify.GroupMemberChange.decode(sysMsg.body.msgContent)
      if (tip.type !== 130) return null
      return {
        eventType: 'group_member_increase',
        data: {
          group_id: tip.groupCode,
          user_id: Number(await ctx.ntUserApi.getUinByUid(tip.memberUid)),
          operator_id: Number(await ctx.ntUserApi.getUinByUid(tip.adminUid))
        }
      }
    }
    else if (msgType === 34) {
      const tip = Notify.GroupMemberChange.decode(sysMsg.body.msgContent)
      if (tip.type === 130) {
        return {
          eventType: 'group_member_decrease',
          data: {
            group_id: tip.groupCode,
            user_id: Number(await ctx.ntUserApi.getUinByUid(tip.memberUid))
          }
        }
      } else if (tip.type === 131) {
        if (tip.memberUid === selfInfo.uid) return null
        const memberUin = await ctx.ntUserApi.getUinByUid(tip.memberUid)
        let adminUin = '0'
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
            operator_id: +adminUin
          }
        }
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
): Promise<{ eventType: keyof MilkyEventTypes, data: any } | null> {
  try {
    const pushMsg = Msg.PushMsg.decode(data)
    if (!pushMsg.message.body) {
      return null
    }
    const { msgType, subType } = pushMsg.message?.contentHead ?? {}
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
            is_add: info.type === 1
          }
        }
      }
    }
    return null
  } catch (error) {
    ctx.logger.error('Failed to transform system message event:', error)
    return null
  }
}
