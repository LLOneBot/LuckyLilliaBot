import { defineApi, Failed, Ok } from '@/milky/common/api'
import { resolveMilkyUri } from '@/milky/common/download'
import { transformGroupNotification } from '@/milky/transform/notification'
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
} from '@saltify/milky-types'
import z from 'zod'

export const SetGroupName = defineApi(
  'set_group_name',
  SetGroupNameInput,
  z.object({}),
  async (ctx, payload) => {
    await ctx.ntGroupApi.setGroupName(payload.group_id.toString(), payload.new_group_name)
    return Ok({})
  }
)

export const SetGroupAvatar = defineApi(
  'set_group_avatar',
  SetGroupAvatarInput,
  z.object({}),
  async (ctx, payload) => {
    const imageBuffer = await resolveMilkyUri(payload.image_uri)
    const { TEMP_DIR } = await import('@/common/globalVars')
    const { writeFile } = await import('node:fs/promises')
    const { randomUUID } = await import('node:crypto')
    const path = await import('node:path')
    const tempPath = path.join(TEMP_DIR, `group-avatar-${randomUUID()}`)
    await writeFile(tempPath, imageBuffer)
    await ctx.ntGroupApi.setGroupAvatar(payload.group_id.toString(), tempPath)
    return Ok({})
  }
)

export const SetGroupMemberCard = defineApi(
  'set_group_member_card',
  SetGroupMemberCardInput,
  z.object({}),
  async (ctx, payload) => {
    await ctx.ntGroupApi.setMemberCard(
      payload.group_id.toString(),
      payload.user_id.toString(),
      payload.card
    )
    return Ok({})
  }
)

export const SetGroupMemberSpecialTitle = defineApi(
  'set_group_member_special_title',
  SetGroupMemberSpecialTitleInput,
  z.object({}),
  async (ctx, payload) => {
    // Use PMHQ to set special title
    try {
      const memberUid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString())
      if (!memberUid) {
        return Failed(-404, 'Member not found')
      }
      await ctx.app.pmhq.setSpecialTitle(
        payload.group_id,
        memberUid,
        payload.special_title
      )
      return Ok({})
    } catch (error) {
      ctx.logger.error('Failed to set special title:', error)
      return Failed(-500, 'Failed to set special title')
    }
  }
)

export const SetGroupMemberAdmin = defineApi(
  'set_group_member_admin',
  SetGroupMemberAdminInput,
  z.object({}),
  async (ctx, payload) => {
    await ctx.ntGroupApi.setMemberRole(
      payload.group_id.toString(),
      payload.user_id.toString(),
      payload.is_set ? 3 : 2
    )
    return Ok({})
  }
)

export const SetGroupMemberMute = defineApi(
  'set_group_member_mute',
  SetGroupMemberMuteInput,
  z.object({}),
  async (ctx, payload) => {
    await ctx.ntGroupApi.banMember(
      payload.group_id.toString(),
      [{ uid: payload.user_id.toString(), timeStamp: payload.duration }]
    )
    return Ok({})
  }
)

export const SetGroupWholeMute = defineApi(
  'set_group_whole_mute',
  SetGroupWholeMuteInput,
  z.object({}),
  async (ctx, payload) => {
    await ctx.ntGroupApi.banGroup(payload.group_id.toString(), payload.is_mute)
    return Ok({})
  }
)

export const KickGroupMember = defineApi(
  'kick_group_member',
  KickGroupMemberInput,
  z.object({}),
  async (ctx, payload) => {
    await ctx.ntGroupApi.kickMember(
      payload.group_id.toString(),
      [payload.user_id.toString()],
      payload.reject_add_request
    )
    return Ok({})
  }
)

export const QuitGroup = defineApi(
  'quit_group',
  QuitGroupInput,
  z.object({}),
  async (ctx, payload) => {
    await ctx.ntGroupApi.quitGroup(payload.group_id.toString())
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
    await ctx.ntMsgApi.setEmojiLike(
      peer,
      payload.message_seq.toString(),
      payload.reaction,
      payload.is_add
    )
    return Ok({})
  }
)

export const SendGroupNudge = defineApi(
  'send_group_nudge',
  SendGroupNudgeInput,
  z.object({}),
  async (ctx, payload) => {
    // Use PMHQ to send group poke
    try {
      await ctx.app.pmhq.sendGroupPoke(payload.group_id, payload.user_id)
      return Ok({})
    } catch (error) {
      ctx.logger.error('Failed to send group nudge:', error)
      return Failed(-500, 'Failed to send group nudge')
    }
  }
)

export const GetGroupNotifications = defineApi(
  'get_group_notifications',
  GetGroupNotificationsInput,
  GetGroupNotificationsOutput,
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.getGroupRequest()
    const transformedNotifications = result.notifies.map(transformGroupNotification)

    const limited = payload.limit ? transformedNotifications.slice(0, payload.limit) : transformedNotifications
    return Ok({
      notifications: limited,
      next_notification_seq: undefined,
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
  QuitGroup,
  SendGroupMessageReaction,
  SendGroupNudge,
  GetGroupNotifications,
  AcceptGroupRequest,
  RejectGroupRequest,
  AcceptGroupInvitation,
  RejectGroupInvitation,
]
