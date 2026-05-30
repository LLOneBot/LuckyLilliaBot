import { defineApi, Failed, MilkyApiHandler, Ok } from '@/milky/common/api'
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
  SendGroupAnnouncementInput,
  DeleteGroupAnnouncementInput,
  GetGroupEssenceMessagesInput,
  GetGroupEssenceMessagesOutput,
  SetGroupEssenceMessageInput,
} from '@saltify/milky-types'
import z from 'zod'
import { TEMP_DIR } from '@/common/globalVars'
import { unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { ChatType, GroupNotificationType, RequestState } from '@/ntqqapi/types'
import { transformIncomingSegments } from '../transform/message'
import { noop } from 'cosmokit'

const SetGroupName = defineApi(
  'set_group_name',
  SetGroupNameInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.setGroupName(payload.group_id, payload.new_group_name)
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const SetGroupAvatar = defineApi(
  'set_group_avatar',
  SetGroupAvatarInput,
  z.object({}),
  async (ctx, payload) => {
    const imageBuffer = await resolveMilkyUri(payload.image_uri)
    const tempPath = path.join(TEMP_DIR, `group-avatar-${randomUUID()}`)
    await writeFile(tempPath, imageBuffer)
    const result = await ctx.ntGroupApi.setGroupAvatar(payload.group_id.toString(), tempPath)
    unlink(tempPath).catch(noop)
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

const SetGroupMemberCard = defineApi(
  'set_group_member_card',
  SetGroupMemberCardInput,
  z.object({}),
  async (ctx, payload) => {
    const memberUid = await ctx.ntUserApi.getUidByUin(payload.user_id, payload.group_id)
    const result = await ctx.ntGroupApi.setGroupMemberCard(
      payload.group_id,
      memberUid,
      payload.card
    )
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const SetGroupMemberSpecialTitle = defineApi(
  'set_group_member_special_title',
  SetGroupMemberSpecialTitleInput,
  z.object({}),
  async (ctx, payload) => {
    // Use PMHQ to set special title
    const memberUid = await ctx.ntUserApi.getUidByUin(payload.user_id, payload.group_id)
    await ctx.qqProtocol.setSpecialTitle(
      payload.group_id,
      memberUid,
      payload.special_title
    )
    return Ok({})
  }
)

const SetGroupMemberAdmin = defineApi(
  'set_group_member_admin',
  SetGroupMemberAdminInput,
  z.object({}),
  async (ctx, payload) => {
    const memberUid = await ctx.ntUserApi.getUidByUin(
      payload.user_id,
      payload.group_id
    )
    const result = await ctx.ntGroupApi.setGroupMemberAdmin(
      payload.group_id,
      memberUid,
      payload.is_set
    )
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const SetGroupMemberMute = defineApi(
  'set_group_member_mute',
  SetGroupMemberMuteInput,
  z.object({}),
  async (ctx, payload) => {
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id, payload.group_id)
    const result = await ctx.ntGroupApi.muteGroupMember(
      payload.group_id,
      [{ uid, duration: payload.duration }]
    )
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const SetGroupWholeMute = defineApi(
  'set_group_whole_mute',
  SetGroupWholeMuteInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.muteGroup(payload.group_id, payload.is_mute)
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const KickGroupMember = defineApi(
  'kick_group_member',
  KickGroupMemberInput,
  z.object({}),
  async (ctx, payload) => {
    const memberUid = await ctx.ntUserApi.getUidByUin(payload.user_id, payload.group_id)
    const result = await ctx.ntGroupApi.kickGroupMember(
      payload.group_id,
      [memberUid],
      payload.reject_add_request
    )
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const GetGroupAnnouncements = defineApi(
  'get_group_announcements',
  GetGroupAnnouncementsInput,
  GetGroupAnnouncementsOutput,
  async (ctx, payload) => {
    const result = await ctx.ntWebApi.getGroupBulletinList(payload.group_id)
    if (result.ec !== 0) {
      return Failed(-500, result.em)
    }
    // server 在没有未读公告 / 群没公告时分别省略 inst / feeds 字段（实测都会
    // 是 undefined）。spread 这两个字段前必须 `?? []` 兜底，否则群一空就 500
    // "result.inst is not iterable" / "result.feeds is not iterable"。
    const feeds = result.feeds ?? []
    const inst = result.inst ?? []
    const announcements = []
    for (const e of [...feeds, ...inst]) {
      announcements.push({
        group_id: payload.group_id,
        announcement_id: e.fid,
        user_id: e.u,
        time: e.pubt,
        content: e.msg.text,
        image_url: e.msg.pics?.[0] ? `https://gdynamic.qpic.cn/gdynamic/${e.msg.pics[0].id}/0` : undefined
      })
    }
    if (inst.length) {
      announcements.sort((a, b) => b.time - a.time)
    }
    return Ok({
      announcements
    })
  }
)

const SendGroupAnnouncement = defineApi(
  'send_group_announcement',
  SendGroupAnnouncementInput,
  z.object({}),
  async (ctx, payload) => {
    let picInfo: { id: string, width: number, height: number } | undefined
    if (payload.image_uri) {
      const imageBuffer = await resolveMilkyUri(payload.image_uri)
      const tempPath = path.join(TEMP_DIR, `group-announcement-${randomUUID()}`)
      await writeFile(tempPath, imageBuffer)
      const result = await ctx.ntWebApi.uploadGroupBulletinPic(payload.group_id, tempPath)
      unlink(tempPath).catch(noop)
      if (result.errCode !== 0) {
        return Failed(-500, result.errMsg)
      }
      picInfo = result.picInfo
    }
    const result = await ctx.ntWebApi.publishGroupBulletin(
      payload.group_id,
      payload.content,
      0,
      0,
      0,
      0,
      1,
      picInfo?.id,
      picInfo?.width,
      picInfo?.height
    )
    if (result.ec !== 0) {
      return Failed(-500, result.em)
    }
    return Ok({})
  }
)

const DeleteGroupAnnouncement = defineApi(
  'delete_group_announcement',
  DeleteGroupAnnouncementInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntWebApi.deleteGroupBulletin(payload.group_id, payload.announcement_id)
    if (result.ec !== 0) {
      return Failed(-500, result.em)
    }
    return Ok({})
  }
)

const GetGroupEssenceMessages = defineApi(
  'get_group_essence_messages',
  GetGroupEssenceMessagesInput,
  GetGroupEssenceMessagesOutput,
  async (ctx, payload) => {
    const groupCode = payload.group_id.toString()
    const peer = {
      guildId: '',
      chatType: 2,
      peerUid: groupCode
    }
    const result = await ctx.ntWebApi.getGroupEssenceList(
      payload.group_id,
      payload.page_index,
      payload.page_size
    )
    if (result.retcode !== 0) {
      return Failed(-500, result.retmsg)
    }
    const messages: GetGroupEssenceMessagesOutput['messages'] = []
    for (const item of result.data.msg_list) {
      let msg = ctx.store.getMsgBySeq(peer.peerUid, item.msg_seq)
      if (!msg) {
        const { msgList } = await ctx.ntMsgApi.getSingleMsg(peer, item.msg_seq)
        msg = msgList[0]
      }
      if (!msg) continue
      messages.push({
        group_id: +item.group_code,
        message_seq: item.msg_seq,
        message_time: +msg.msgTime,
        sender_id: +item.sender_uin,
        sender_name: item.sender_nick,
        operator_id: +item.add_digest_uin,
        operator_name: item.add_digest_nick,
        operation_time: item.add_digest_time,
        segments: await transformIncomingSegments(ctx, msg)
      })
    }
    return Ok({
      messages,
      is_end: result.data.is_end
    })
  }
)

const SetGroupEssenceMessage = defineApi(
  'set_group_essence_message',
  SetGroupEssenceMessageInput,
  z.object({}),
  async (ctx, payload) => {
    const peer = {
      chatType: ChatType.Group,
      peerUid: payload.group_id.toString(),
      guildId: ''
    }
    let msg = ctx.store.getMsgBySeq(peer.peerUid, payload.message_seq)
    if (!msg) {
      const { msgList } = await ctx.ntMsgApi.getSingleMsg(peer, payload.message_seq)
      msg = msgList[0]
    }
    if (payload.is_set) {
      const result = await ctx.ntGroupApi.addGroupEssence(
        payload.group_id,
        payload.message_seq,
        msg.msgRandom
      )
      if (result.errorCode !== 0) {
        return Failed(-500, result.errorMsg)
      }
    } else {
      const result = await ctx.ntGroupApi.removeGroupEssence(
        payload.group_id,
        payload.message_seq,
        msg.msgRandom
      )
      if (result.errorCode !== 0) {
        return Failed(-500, result.errorMsg)
      }
    }
    return Ok({})
  }
)

const QuitGroup = defineApi(
  'quit_group',
  QuitGroupInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.quitGroup(payload.group_id)
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const SendGroupMessageReaction = defineApi(
  'send_group_message_reaction',
  SendGroupMessageReactionInput,
  z.object({}),
  async (ctx, payload) => {
    const peer = {
      chatType: 2, // ChatType.Group = 2
      peerUid: payload.group_id.toString(),
      guildId: ''
    }
    const result = await ctx.ntMsgApi.setGroupMsgReaction(
      payload.group_id,
      payload.message_seq,
      payload.reaction,
      payload.is_add,
      {
        face: 1,
        emoji: 2
      }[payload.reaction_type]
    )
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const SendGroupNudge = defineApi(
  'send_group_nudge',
  SendGroupNudgeInput,
  z.object({}),
  async (ctx, payload) => {
    // Use PMHQ to send group poke
    await ctx.qqProtocol.sendGroupPoke(payload.group_id, payload.user_id)
    return Ok({})
  }
)

const GetGroupNotifications = defineApi(
  'get_group_notifications',
  GetGroupNotificationsInput,
  GetGroupNotificationsOutput,
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.getGroupNotifications(
      payload.is_filtered,
      payload.limit,
      payload.start_notification_seq ? BigInt(payload.start_notification_seq) : undefined
    )
    const notifications = []
    for (const n of result.notifications) {
      if (n.type === GroupNotificationType.JoinRequest) {
        notifications.push({
          type: 'join_request' as const,
          group_id: n.group.groupCode,
          notification_seq: Number(n.sequence),
          is_filtered: payload.is_filtered,
          initiator_id: await ctx.ntUserApi.getUinByUid(n.user1.uid),
          state: ({
            [RequestState.Init]: 'pending',
            [RequestState.Unhandle]: 'pending',
            [RequestState.Agreed]: 'accepted',
            [RequestState.Refused]: 'rejected',
            [RequestState.Ignored]: 'ignored'
          } as const)[n.requestState] ?? 'pending',
          operator_id: n.user2?.uid ? await ctx.ntUserApi.getUinByUid(n.user2.uid) : undefined,
          comment: n.comment ?? ''
        })
      } else if (n.type === GroupNotificationType.SetAdmin || n.type === GroupNotificationType.UnsetAdmin) {
        notifications.push({
          type: 'admin_change' as const,
          group_id: n.group.groupCode,
          notification_seq: Number(n.sequence),
          target_user_id: await ctx.ntUserApi.getUinByUid(n.user1.uid),
          is_set: n.type === GroupNotificationType.SetAdmin,
          operator_id: await ctx.ntUserApi.getUinByUid(n.user2!.uid)
        })
      } else if (n.type === GroupNotificationType.Kick) {
        notifications.push({
          type: 'kick' as const,
          group_id: n.group.groupCode,
          notification_seq: Number(n.sequence),
          target_user_id: await ctx.ntUserApi.getUinByUid(n.user1.uid),
          operator_id: await ctx.ntUserApi.getUinByUid(n.user2?.uid ?? n.user3!.uid)
        })
      } else if (n.type === GroupNotificationType.Quit) {
        notifications.push({
          type: 'quit' as const,
          group_id: n.group.groupCode,
          notification_seq: Number(n.sequence),
          target_user_id: await ctx.ntUserApi.getUinByUid(n.user1.uid)
        })
      } else if (n.type === GroupNotificationType.InvitedJoinRequest) {
        notifications.push({
          type: 'invited_join_request' as const,
          group_id: n.group.groupCode,
          notification_seq: Number(n.sequence),
          initiator_id: await ctx.ntUserApi.getUinByUid(n.user2!.uid),
          target_user_id: await ctx.ntUserApi.getUinByUid(n.user1.uid),
          state: ({
            [RequestState.Init]: 'pending',
            [RequestState.Unhandle]: 'pending',
            [RequestState.Agreed]: 'accepted',
            [RequestState.Refused]: 'rejected',
            [RequestState.Ignored]: 'ignored'
          } as const)[n.requestState] ?? 'pending',
          operator_id: n.user3?.uid ? await ctx.ntUserApi.getUinByUid(n.user3.uid) : undefined
        })
      }
    }
    return Ok({
      notifications,
      next_notification_seq: Number(result.nextStartSeq),
    })
  }
)

const AcceptGroupRequest = defineApi(
  'accept_group_request',
  AcceptGroupRequestInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.setGroupRequest(
      payload.is_filtered,
      payload.group_id,
      payload.notification_seq,
      payload.notification_type === 'join_request' ? GroupNotificationType.JoinRequest : GroupNotificationType.InvitedJoinRequest,
      true
    )
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const RejectGroupRequest = defineApi(
  'reject_group_request',
  RejectGroupRequestInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.setGroupRequest(
      payload.is_filtered,
      payload.group_id,
      payload.notification_seq,
      payload.notification_type === 'join_request' ? GroupNotificationType.JoinRequest : GroupNotificationType.InvitedJoinRequest,
      false,
      payload.reason ?? undefined
    )
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const AcceptGroupInvitation = defineApi(
  'accept_group_invitation',
  AcceptGroupInvitationInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.setGroupRequest(
      false,
      payload.group_id,
      payload.invitation_seq,
      GroupNotificationType.Invitation,
      true
    )
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const RejectGroupInvitation = defineApi(
  'reject_group_invitation',
  RejectGroupInvitationInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.setGroupRequest(
      false,
      payload.group_id,
      payload.invitation_seq,
      GroupNotificationType.Invitation,
      false
    )
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

export const GroupApi: MilkyApiHandler[] = [
  SetGroupName,
  SetGroupAvatar,
  SetGroupMemberCard,
  SetGroupMemberSpecialTitle,
  SetGroupMemberAdmin,
  SetGroupMemberMute,
  SetGroupWholeMute,
  KickGroupMember,
  GetGroupAnnouncements,
  SendGroupAnnouncement,
  DeleteGroupAnnouncement,
  GetGroupEssenceMessages,
  SetGroupEssenceMessage,
  QuitGroup,
  SendGroupMessageReaction,
  SendGroupNudge,
  GetGroupNotifications,
  AcceptGroupRequest,
  RejectGroupRequest,
  AcceptGroupInvitation,
  RejectGroupInvitation,
]
