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
import { GroupNotifyStatus, GroupNotifyType } from '@/ntqqapi/types'
import { transformIncomingSegments } from '../transform/message'

const SetGroupName = defineApi(
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

const SetGroupAvatar = defineApi(
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

const SetGroupMemberCard = defineApi(
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

const SetGroupMemberSpecialTitle = defineApi(
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

const SetGroupMemberAdmin = defineApi(
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

const SetGroupMemberMute = defineApi(
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

const SetGroupWholeMute = defineApi(
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

const KickGroupMember = defineApi(
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

const GetGroupAnnouncements = defineApi(
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
          content: e.msg.text,
          image_url: e.msg.pics[0] ? `https://gdynamic.qpic.cn/gdynamic/${e.msg.pics[0].id}/0` : undefined
        }
      })
    })
  }
)

const SendGroupAnnouncement = defineApi(
  'send_group_announcement',
  SendGroupAnnouncementInput,
  z.object({}),
  async (ctx, payload) => {
    const groupCode = payload.group_id.toString()
    let picInfo: { id: string, width: number, height: number } | undefined
    if (payload.image_uri) {
      const imageBuffer = await resolveMilkyUri(payload.image_uri)
      const tempPath = path.join(TEMP_DIR, `group-announcement-${randomUUID()}`)
      await writeFile(tempPath, imageBuffer)
      const result = await ctx.ntGroupApi.uploadGroupBulletinPic(groupCode, tempPath)
      unlink(tempPath).catch(e => { })
      if (result.errCode !== 0) {
        return Failed(-500, result.errMsg)
      }
      picInfo = result.picInfo
    }
    const result = await ctx.ntGroupApi.publishGroupBulletin(
      groupCode,
      {
        text: encodeURIComponent(payload.content),
        oldFeedsId: '',
        pinned: 0,
        confirmRequired: 1,
        picInfo
      }
    )
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

const DeleteGroupAnnouncement = defineApi(
  'delete_group_announcement',
  DeleteGroupAnnouncementInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.deleteGroupBulletin(payload.group_id.toString(), payload.announcement_id)
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
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
    const essence = await ctx.ntGroupApi.queryCachedEssenceMsg(groupCode)
    let isEnd = true
    let items = essence.items
    let start = ((payload.page_index + 1) * payload.page_size) - 1
    if (start > items.length - 1) {
      start = items.length - 1
    }
    items = items.slice(start)
    if (items.length > payload.page_size) {
      items = items.slice(0, payload.page_size)
      isEnd = false
    }
    const messages: GetGroupEssenceMessagesOutput['messages'] = []
    for (const item of items) {
      const { msgList } = await ctx.ntMsgApi.getMsgsBySeqAndCount(
        peer,
        item.msgSeq.toString(),
        1,
        true,
        true
      )
      const sourceMsg = msgList.find(e => e.msgRandom === item.msgRandom.toString())
      if (!sourceMsg) continue
      messages.push({
        group_id: +item.groupCode,
        message_seq: item.msgSeq,
        message_time: +sourceMsg.msgTime,
        sender_id: +item.msgSenderUin,
        sender_name: item.msgSenderNick,
        operator_id: +item.opUin,
        operator_name: item.opNick,
        operation_time: item.opTime,
        segments: await transformIncomingSegments(ctx, sourceMsg)
      })
    }
    return Ok({
      messages,
      is_end: isEnd
    })
  }
)

const SetGroupEssenceMessage = defineApi(
  'set_group_essence_message',
  SetGroupEssenceMessageInput,
  z.object({}),
  async (ctx, payload) => {
    const groupCode = payload.group_id.toString()
    const peer = {
      guildId: '',
      chatType: 2,
      peerUid: groupCode
    }
    const msg = await ctx.ntMsgApi.getMsgsBySeqAndCount(
      peer,
      payload.message_seq.toString(),
      1,
      true,
      true
    )
    if (msg.msgList.length === 0) {
      return Failed(-404, 'Message not found')
    }
    if (payload.is_set) {
      const result = await ctx.ntGroupApi.addGroupEssence(groupCode, msg.msgList[0].msgId)
      if (result.errCode !== 0) {
        return Failed(-500, result.errMsg)
      }
    } else {
      const result = await ctx.ntGroupApi.removeGroupEssence(groupCode, msg.msgList[0].msgId)
      if (result.errCode !== 0) {
        return Failed(-500, result.errMsg)
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
    const result = await ctx.ntGroupApi.quitGroup(payload.group_id.toString())
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
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
    const result = await ctx.ntMsgApi.setEmojiLike(
      peer,
      payload.message_seq.toString(),
      payload.reaction,
      payload.is_add,
      {
        face: '1',
        emoji: '2'
      }[payload.reaction_type]
    )
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
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
    await ctx.app.pmhq.sendGroupPoke(payload.group_id, payload.user_id)
    return Ok({})
  }
)

const GetGroupNotifications = defineApi(
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
    const notifications = []
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

const AcceptGroupRequest = defineApi(
  'accept_group_request',
  AcceptGroupRequestInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.operateSysNotify(
      payload.is_filtered,
      {
        operateType: 1,
        targetMsg: {
          seq: payload.notification_seq.toString(),
          type: payload.notification_type === 'join_request' ? 7 : 5,
          groupCode: payload.group_id.toString(),
          postscript: ''
        }
      }
    )
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

const RejectGroupRequest = defineApi(
  'reject_group_request',
  RejectGroupRequestInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.operateSysNotify(
      payload.is_filtered,
      {
        operateType: 2,
        targetMsg: {
          seq: payload.notification_seq.toString(),
          type: payload.notification_type === 'join_request' ? 7 : 5,
          groupCode: payload.group_id.toString(),
          postscript: payload.reason ?? ''
        }
      }
    )
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

const AcceptGroupInvitation = defineApi(
  'accept_group_invitation',
  AcceptGroupInvitationInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.operateSysNotify(
      false,
      {
        operateType: 1,
        targetMsg: {
          seq: payload.invitation_seq.toString(),
          type: 1,
          groupCode: payload.group_id.toString(),
          postscript: ''
        }
      }
    )
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

const RejectGroupInvitation = defineApi(
  'reject_group_invitation',
  RejectGroupInvitationInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.operateSysNotify(
      false,
      {
        operateType: 2,
        targetMsg: {
          seq: payload.invitation_seq.toString(),
          type: 1,
          groupCode: payload.group_id.toString(),
          postscript: ''
        }
      }
    )
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
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
