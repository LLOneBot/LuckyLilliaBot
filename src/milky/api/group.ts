import { defineApi, Failed, Ok } from '@/milky/common/api'
import { resolveMilkyUri } from '@/milky/common/download'
import {
  SetGroupNameInput,
  SetGroupAvatarInput,
  SetGroupMemberCardInput,
  SetGroupMemberSpecialTitleInput,
  SetGroupMemberAdminInput,
  SetGroupMemberMuteInput,
  SetGroupWholeMuteInput,
  KickGroupMemberInput,
  QuitGroupInput,
  SendGroupMessageReactionInput,
  SendGroupNudgeInput,
  GetGroupNotificationsInput,
  GetGroupNotificationsOutput,
  AcceptGroupRequestInput,
  RejectGroupRequestInput,
  AcceptGroupInvitationInput,
  RejectGroupInvitationInput,
  GetGroupAnnouncementsInput,
  GetGroupAnnouncementsOutput,
} from '@saltify/milky-types'
import z from 'zod'
import { TEMP_DIR } from '@/common/globalVars'
import { unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { GroupNotifyStatus, GroupNotifyType } from '@/ntqqapi/types'

export const SetGroupName = defineApi(
  'set_group_name',
  SetGroupNameInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.setGroupName(payload.group_id.toString(), payload.new_group_name)
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

export const SetGroupAvatar = defineApi(
  'set_group_avatar',
  SetGroupAvatarInput,
  z.object({}),
  async (ctx, payload) => {
    const imageBuffer = await resolveMilkyUri(payload.image_uri)
    const tempPath = path.join(TEMP_DIR, `group-avatar-${randomUUID()}`)
    await writeFile(tempPath, imageBuffer)
    const result = await ctx.ntGroupApi.setGroupAvatar(payload.group_id.toString(), tempPath)
    unlink(tempPath).catch(e => { })
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

export const SetGroupMemberCard = defineApi(
  'set_group_member_card',
  SetGroupMemberCardInput,
  z.object({}),
  async (ctx, payload) => {
    const groupCode = payload.group_id.toString()
    const memberUid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString(), groupCode)
    const result = await ctx.ntGroupApi.setMemberCard(
      groupCode,
      memberUid,
      payload.card
    )
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

export const SetGroupMemberSpecialTitle = defineApi(
  'set_group_member_special_title',
  SetGroupMemberSpecialTitleInput,
  z.object({}),
  async (ctx, payload) => {
    // Use PMHQ to set special title
    const memberUid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString(), payload.group_id.toString())
    await ctx.app.pmhq.setSpecialTitle(
      payload.group_id,
      memberUid,
      payload.special_title
    )
    return Ok({})
  }
)

export const SetGroupMemberAdmin = defineApi(
  'set_group_member_admin',
  SetGroupMemberAdminInput,
  z.object({}),
  async (ctx, payload) => {
    const groupCode = payload.group_id.toString()
    const memberUid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString(), groupCode)
    const result = await ctx.ntGroupApi.setMemberRole(
      groupCode,
      memberUid,
      payload.is_set ? 3 : 2
    )
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

export const SetGroupMemberMute = defineApi(
  'set_group_member_mute',
  SetGroupMemberMuteInput,
  z.object({}),
  async (ctx, payload) => {
    const groupCode = payload.group_id.toString()
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString(), groupCode)
    const result = await ctx.ntGroupApi.banMember(
      groupCode,
      [{ uid, timeStamp: payload.duration }]
    )
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

export const SetGroupWholeMute = defineApi(
  'set_group_whole_mute',
  SetGroupWholeMuteInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.banGroup(payload.group_id.toString(), payload.is_mute)
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

export const KickGroupMember = defineApi(
  'kick_group_member',
  KickGroupMemberInput,
  z.object({}),
  async (ctx, payload) => {
    const groupCode = payload.group_id.toString()
    const memberUid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString(), groupCode)
    const result = await ctx.ntGroupApi.kickMember(
      groupCode,
      [memberUid],
      payload.reject_add_request
    )
    if (result.errCode !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

export const GetGroupAnnouncements = defineApi(
  'get_group_announcements',
  GetGroupAnnouncementsInput,
  GetGroupAnnouncementsOutput,
  async (ctx, payload) => {
    const data = await ctx.ntGroupApi.getGroupBulletinList(payload.group_id.toString())
    return Ok({
      announcements: data.feeds.map(e => {
        return {
          group_id: payload.group_id,
          announcement_id: e.feedId,
          user_id: +e.uin,
          time: +e.publishTime,
          content: e.msg.text
        }
      })
    })
  }
)

export const QuitGroup = defineApi(
  'quit_group',
  QuitGroupInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.quitGroup(payload.group_id.toString())
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

export const SendGroupMessageReaction = defineApi(
  'send_group_message_reaction',
  SendGroupMessageReactionInput,
  z.object({}),
  async (ctx, payload) => {
    const peer = {
      chatType: 2, // ChatType.Group = 2
      peerUid: payload.group_id.toString(),
      guildId: ''
    }
    const result = await ctx.ntMsgApi.setEmojiLike(
      peer,
      payload.message_seq.toString(),
      payload.reaction,
      payload.is_add
    )
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

export const SendGroupNudge = defineApi(
  'send_group_nudge',
  SendGroupNudgeInput,
  z.object({}),
  async (ctx, payload) => {
    // Use PMHQ to send group poke
    await ctx.app.pmhq.sendGroupPoke(payload.group_id, payload.user_id)
    return Ok({})
  }
)

export const GetGroupNotifications = defineApi(
  'get_group_notifications',
  GetGroupNotificationsInput,
  GetGroupNotificationsOutput,
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.getSingleScreenNotifies(
      payload.is_filtered,
      payload.limit,
      payload.start_notification_seq ? payload.start_notification_seq.toString() : ''
    )
    let notifies = result.notifies
    if (notifies.length > payload.limit) {
      notifies = notifies.slice(0, payload.limit)
    }
    const notifications: GetGroupNotificationsOutput['notifications'] = []
    for (const notify of notifies) {
      if (notify.type === GroupNotifyType.RequestJoinNeedAdminiStratorPass) {
        notifications.push({
          type: 'join_request',
          group_id: Number(notify.group.groupCode),
          notification_seq: Number(notify.seq),
          is_filtered: result.doubt,
          initiator_id: Number(await ctx.ntUserApi.getUinByUid(notify.user1.uid)),
          state: ({
            [GroupNotifyStatus.Init]: 'pending',
            [GroupNotifyStatus.Unhandle]: 'pending',
            [GroupNotifyStatus.Agreed]: 'accepted',
            [GroupNotifyStatus.Refused]: 'rejected',
            [GroupNotifyStatus.Ignored]: 'ignored'
          } as const)[notify.status],
          operator_id: notify.actionUser.uid ? Number(await ctx.ntUserApi.getUinByUid(notify.actionUser.uid)) : undefined,
          comment: notify.postscript
        })
      } else if ([
        GroupNotifyType.SetAdmin,
        GroupNotifyType.CancelAdminNotifyCanceled,
        GroupNotifyType.CancelAdminNotifyAdmin,
      ].includes(notify.type)) {
        notifications.push({
          type: 'admin_change',
          group_id: Number(notify.group.groupCode),
          notification_seq: Number(notify.seq),
          target_user_id: Number(await ctx.ntUserApi.getUinByUid(notify.user1.uid)),
          is_set: notify.type === GroupNotifyType.SetAdmin,
          operator_id: Number(await ctx.ntUserApi.getUinByUid(notify.user2.uid))
        })
      } else if (notify.type === GroupNotifyType.KickMemberNotifyAdmin) {
        notifications.push({
          type: 'kick',
          group_id: Number(notify.group.groupCode),
          notification_seq: Number(notify.seq),
          target_user_id: Number(await ctx.ntUserApi.getUinByUid(notify.user1.uid)),
          operator_id: Number(await ctx.ntUserApi.getUinByUid(notify.user2.uid))
        })
      } else if (notify.type === GroupNotifyType.MemberLeaveNotifyAdmin) {
        notifications.push({
          type: 'quit',
          group_id: Number(notify.group.groupCode),
          notification_seq: Number(notify.seq),
          target_user_id: Number(await ctx.ntUserApi.getUinByUid(notify.user1.uid))
        })
      } else if (notify.type === GroupNotifyType.InvitedNeedAdminiStratorPass) {
        notifications.push({
          type: 'invited_join_request',
          group_id: Number(notify.group.groupCode),
          notification_seq: Number(notify.seq),
          initiator_id: Number(await ctx.ntUserApi.getUinByUid(notify.user2.uid)),
          target_user_id: Number(await ctx.ntUserApi.getUinByUid(notify.user1.uid)),
          state: ({
            [GroupNotifyStatus.Init]: 'pending',
            [GroupNotifyStatus.Unhandle]: 'pending',
            [GroupNotifyStatus.Agreed]: 'accepted',
            [GroupNotifyStatus.Refused]: 'rejected',
            [GroupNotifyStatus.Ignored]: 'ignored'
          } as const)[notify.status],
          operator_id: notify.actionUser.uid ? Number(await ctx.ntUserApi.getUinByUid(notify.actionUser.uid)) : undefined
        })
      }
    }
    return Ok({
      notifications,
      next_notification_seq: result.nextStartSeq !== '0' ? Number(result.nextStartSeq) : undefined,
    })
  }
)

export const AcceptGroupRequest = defineApi(
  'accept_group_request',
  AcceptGroupRequestInput,
  z.object({}),
  async (ctx, payload) => {
    // handleGroupRequest needs flag format: "groupCode|seq|type|doubt"
    // TODO: Store notification metadata to reconstruct proper flag
    // For now, use basic format (type: 1=join request, 7=invitation)
    const flag = `${payload.group_id}|${payload.notification_seq}|${payload.is_filtered ? 1 : 7}|${payload.is_filtered ? 1 : 0}`
    await ctx.ntGroupApi.handleGroupRequest(flag, 1) // 1 = accept
    return Ok({})
  }
)

export const RejectGroupRequest = defineApi(
  'reject_group_request',
  RejectGroupRequestInput,
  z.object({}),
  async (ctx, payload) => {
    // handleGroupRequest needs flag format: "groupCode|seq|type|doubt"
    // TODO: Store notification metadata to reconstruct proper flag
    const flag = `${payload.group_id}|${payload.notification_seq}|${payload.is_filtered ? 1 : 7}|${payload.is_filtered ? 1 : 0}`
    await ctx.ntGroupApi.handleGroupRequest(flag, 2, payload.reason || undefined) // 2 = reject
    return Ok({})
  }
)

export const AcceptGroupInvitation = defineApi(
  'accept_group_invitation',
  AcceptGroupInvitationInput,
  z.object({}),
  async (ctx, payload) => {
    // TODO: Group invitations may have different type value
    // Need to determine proper type for group invitation vs join request
    const flag = `${payload.group_id}|${payload.invitation_seq}|1|0`
    await ctx.ntGroupApi.handleGroupRequest(flag, 1) // 1 = accept
    return Ok({})
  }
)

export const RejectGroupInvitation = defineApi(
  'reject_group_invitation',
  RejectGroupInvitationInput,
  z.object({}),
  async (ctx, payload) => {
    // TODO: Group invitations may have different type value
    const flag = `${payload.group_id}|${payload.invitation_seq}|1|0`
    await ctx.ntGroupApi.handleGroupRequest(flag, 2) // 2 = reject
    return Ok({})
  }
)

export const GroupApi = [
  SetGroupName,
  SetGroupAvatar,
  SetGroupMemberCard,
  SetGroupMemberSpecialTitle,
  SetGroupMemberAdmin,
  SetGroupMemberMute,
  SetGroupWholeMute,
  KickGroupMember,
  GetGroupAnnouncements,
  QuitGroup,
  SendGroupMessageReaction,
  SendGroupNudge,
  GetGroupNotifications,
  AcceptGroupRequest,
  RejectGroupRequest,
  AcceptGroupInvitation,
  RejectGroupInvitation,
]
