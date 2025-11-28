import { defineApi, Failed, Ok } from '@/milky/common/api'
import { transformOutgoingMessage } from '@/milky/transform/message/outgoing'
import { transformIncomingPrivateMessage, transformIncomingGroupMessage } from '@/milky/transform/message/incoming'
import {
  SendPrivateMessageInput,
  SendPrivateMessageOutput,
  SendGroupMessageInput,
  SendGroupMessageOutput,
  GetMessageInput,
  GetMessageOutput,
  GetHistoryMessagesInput,
  GetHistoryMessagesOutput,
  RecallPrivateMessageInput,
  RecallGroupMessageInput,
  GetResourceTempUrlInput,
  GetResourceTempUrlOutput,
} from '@saltify/milky-types'
import z from 'zod'

export const SendPrivateMessage = defineApi(
  'send_private_message',
  SendPrivateMessageInput,
  SendPrivateMessageOutput,
  async (ctx, payload) => {
    const friendUid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!friendUid) {
      return Failed(-404, 'Friend not found')
    }

    const elements = await transformOutgoingMessage(ctx, payload.message, friendUid, false)
    const peer = { chatType: 1, peerUid: friendUid, guildId: '' } // ChatType.C2C = 1
    const result = await ctx.ntMsgApi.sendMsg(peer, elements, 10000)

    if (!result) {
      return Failed(-500, 'Failed to send message')
    }

    return Ok({
      message_seq: parseInt(result.msgSeq),
      time: parseInt(result.msgTime),
    })
  }
)

export const SendGroupMessage = defineApi(
  'send_group_message',
  SendGroupMessageInput,
  SendGroupMessageOutput,
  async (ctx, payload) => {
    const groups = await ctx.ntGroupApi.getGroups()
    const group = groups.find(g => g.groupCode === payload.group_id.toString())
    if (!group) {
      return Failed(-404, 'Group not found')
    }

    const elements = await transformOutgoingMessage(ctx, payload.message, group.groupCode, true)
    const peer = { chatType: 2, peerUid: group.groupCode, guildId: '' } // ChatType.Group = 2
    const result = await ctx.ntMsgApi.sendMsg(peer, elements, 10000)

    if (!result) {
      return Failed(-500, 'Failed to send message')
    }

    return Ok({
      message_seq: parseInt(result.msgSeq),
      time: parseInt(result.msgTime),
    })
  }
)

export const GetMessage = defineApi(
  'get_message',
  GetMessageInput,
  GetMessageOutput,
  async (ctx, payload) => {
    const msgId = `${payload.peer_id}_${payload.message_seq}`
    const peer = {
      chatType: payload.message_scene === 'friend' ? 1 : 2, // C2C=1, Group=2
      peerUid: payload.peer_id.toString(),
      guildId: ''
    }
    const msgResult = await ctx.ntMsgApi.getMsgsByMsgId(peer, [msgId])

    if (!msgResult || !msgResult.msgList || msgResult.msgList.length === 0) {
      return Failed(-404, 'Message not found')
    }

    const rawMsg = msgResult.msgList[0]
    if (payload.message_scene === 'friend') {
      const friends = await ctx.ntFriendApi.getBuddyList()
      const friend = friends.find(f => f.uin === rawMsg.peerUin)

      if (!friend) {
        return Failed(-404, 'Friend not found')
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

      return Ok({
        message: transformIncomingPrivateMessage(friend, defaultCategory, rawMsg),
      })
    } else {
      const groups = await ctx.ntGroupApi.getGroups()
      const group = groups.find(g => g.groupCode === rawMsg.peerUin)
      if (!group) {
        return Failed(-404, 'Group not found')
      }
      const member = await ctx.ntGroupApi.getGroupMember(rawMsg.peerUin, rawMsg.senderUin)
      if (!member) {
        return Failed(-404, 'Member not found')
      }
      return Ok({
        message: transformIncomingGroupMessage(group, member, rawMsg),
      })
    }
  }
)

export const GetHistoryMessages = defineApi(
  'get_history_messages',
  GetHistoryMessagesInput,
  GetHistoryMessagesOutput,
  async (ctx, payload) => {
    const peer = {
      chatType: payload.message_scene === 'friend' ? 1 : 2, // C2C=1, Group=2
      peerUid: payload.peer_id.toString(),
      guildId: ''
    }

    const msgResult = await ctx.ntMsgApi.getMsgHistory(
      peer,
      payload.start_message_seq ? payload.start_message_seq.toString() : '0',
      payload.limit,
      false
    )

    if (!msgResult || !msgResult.msgList || msgResult.msgList.length === 0) {
      return Ok({
        messages: [],
        next_message_seq: undefined,
      })
    }

    const messages = msgResult.msgList
    const transformedMessages = []

    if (payload.message_scene === 'friend') {
      const friends = await ctx.ntFriendApi.getBuddyList()
      const friend = friends.find(f => f.uin === payload.peer_id.toString())

      if (!friend) {
        return Failed(-404, 'Friend not found')
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

      for (const msg of messages) {
        transformedMessages.push(transformIncomingPrivateMessage(friend, defaultCategory, msg))
      }
    } else {
      const groups = await ctx.ntGroupApi.getGroups()
      const group = groups.find(g => g.groupCode === payload.peer_id.toString())
      if (!group) {
        return Failed(-404, 'Group not found')
      }
      for (const msg of messages) {
        const member = await ctx.ntGroupApi.getGroupMember(msg.peerUin, msg.senderUin)
        if (member) {
          transformedMessages.push(transformIncomingGroupMessage(group, member, msg))
        }
      }
    }

    const nextSeq = messages.length > 0 ? parseInt(messages[messages.length - 1].msgSeq) - 1 : undefined

    return Ok({
      messages: transformedMessages,
      next_message_seq: nextSeq && nextSeq > 0 ? nextSeq : undefined,
    })
  }
)

export const GetResourceTempUrl = defineApi(
  'get_resource_temp_url',
  GetResourceTempUrlInput,
  GetResourceTempUrlOutput,
  async (ctx, payload) => {
    // TODO: Parse resource_id to determine type and get appropriate URL
    // resource_id format may vary by resource type (image, video, audio, file)
    // For now, return the resource_id as-is
    // Proper implementation would need:
    // - Parse resource type from resource_id
    // - Use pmhq.getGroupImageUrl / getC2cImageUrl for images
    // - Use pmhq.getGroupFileUrl / getPrivateFileUrl for files
    // - Use pmhq.getC2cPttUrl for audio
    ctx.logger.warn('GetResourceTempUrl: partial implementation, returning resource_id as-is')
    return Ok({
      url: payload.resource_id,
    })
  }
)

export const RecallPrivateMessage = defineApi(
  'recall_private_message',
  RecallPrivateMessageInput,
  z.object({}),
  async (ctx, payload) => {
    const friendUid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!friendUid) {
      return Failed(-404, 'Friend not found')
    }

    const peer = { chatType: 1, peerUid: friendUid, guildId: '' } // ChatType.C2C = 1
    await ctx.ntMsgApi.recallMsg(peer, [`${payload.user_id}_${payload.message_seq}`])
    return Ok({})
  }
)

export const RecallGroupMessage = defineApi(
  'recall_group_message',
  RecallGroupMessageInput,
  z.object({}),
  async (ctx, payload) => {
    const groups = await ctx.ntGroupApi.getGroups()
    const group = groups.find(g => g.groupCode === payload.group_id.toString())
    if (!group) {
      return Failed(-404, 'Group not found')
    }

    const peer = { chatType: 2, peerUid: group.groupCode, guildId: '' } // ChatType.Group = 2
    await ctx.ntMsgApi.recallMsg(peer, [`${payload.group_id}_${payload.message_seq}`])
    return Ok({})
  }
)

export const MessageApi = [
  SendPrivateMessage,
  SendGroupMessage,
  GetMessage,
  GetHistoryMessages,
  GetResourceTempUrl,
  RecallPrivateMessage,
  RecallGroupMessage,
]
