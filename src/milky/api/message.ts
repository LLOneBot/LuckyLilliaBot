import { defineApi, Failed, MilkyApiHandler, Ok } from '@/milky/common/api'
import { transformOutgoingMessage } from '@/milky/transform/message/outgoing'
import { transformIncomingPrivateMessage, transformIncomingGroupMessage, transformIncomingForwardedMessage, transformIncomingTempMessage } from '@/milky/transform/message/incoming'
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
  MarkMessageAsReadInput,
  GetForwardedMessagesInput,
  GetForwardedMessagesOutput,
} from '@saltify/milky-types'
import z from 'zod'
import { ChatType, IMAGE_HTTP_HOST_NT, RawMessage } from '@/ntqqapi/types'
import { Media } from '@/ntqqapi/proto'

const SendPrivateMessage = defineApi(
  'send_private_message',
  SendPrivateMessageInput,
  SendPrivateMessageOutput,
  async (ctx, payload) => {
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id)
    if (!uid) {
      return Failed(-404, 'User not found')
    }
    const peer = { chatType: 1, peerUid: uid, guildId: '' }
    const isBuddy = await ctx.ntFriendApi.isFriend(uid)
    if (!isBuddy) {
      peer.chatType = 100
    }

    const { elements, deleteAfterSentFiles } = await transformOutgoingMessage(
      ctx,
      payload.message,
      uid,
      false
    )
    const result = await ctx.app.sendMessage(
      ctx,
      peer,
      elements,
      deleteAfterSentFiles
    )
    // 跟 OneBot11 的 SendMsg.ts:42 一样，把自己刚发的消息塞 msgCache，
    // 后续 recall_private_message 通过 (peerUid, msgSeq) 反查时能命中。
    // C2C 没有 server self-echo，不存就永远进不了 cache。
    ctx.store.addMsgCache(result)

    return Ok({
      message_seq: +result.msgSeq,
      time: +result.msgTime,
    })
  }
)

const SendGroupMessage = defineApi(
  'send_group_message',
  SendGroupMessageInput,
  SendGroupMessageOutput,
  async (ctx, payload) => {
    const groupCode = payload.group_id.toString()
    const peer = { chatType: 2, peerUid: groupCode, guildId: '' } // ChatType.Group = 2

    const { elements, deleteAfterSentFiles } = await transformOutgoingMessage(
      ctx,
      payload.message,
      groupCode,
      true
    )
    const result = await ctx.app.sendMessage(
      ctx,
      peer,
      elements,
      deleteAfterSentFiles
    )

    return Ok({
      message_seq: +result.msgSeq,
      time: +result.msgTime,
    })
  }
)

const RecallPrivateMessage = defineApi(
  'recall_private_message',
  RecallPrivateMessageInput,
  z.object({}),
  async (ctx, payload) => {
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id)
    if (!uid) {
      return Failed(-404, 'User not found')
    }
    const peer = {
      chatType: ChatType.C2C,
      peerUid: uid,
      guildId: ''
    }
    const isBuddy = await ctx.ntFriendApi.isFriend(uid)
    if (!isBuddy) {
      peer.chatType = ChatType.TempC2CFromGroup
    }
    let msg = ctx.store.getMsgBySeq(peer.peerUid, payload.message_seq)
    if (!msg) {
      // 从服务器拉取的消息可以用
      const { msgList } = await ctx.ntMsgApi.getSingleMsg(peer, payload.message_seq)
      msg = msgList[0]
    }
    await ctx.ntMsgApi.recallMsg(peer, msg.msgSeq, msg.clientSeq, msg.msgRandom, +msg.msgTime)
    return Ok({})
  }
)

const RecallGroupMessage = defineApi(
  'recall_group_message',
  RecallGroupMessageInput,
  z.object({}),
  async (ctx, payload) => {
    const peer = {
      chatType: ChatType.Group,
      peerUid: payload.group_id.toString(),
      guildId: ''
    }
    await ctx.ntMsgApi.recallMsg(peer, payload.message_seq)
    return Ok({})
  }
)

const GetMessage = defineApi(
  'get_message',
  GetMessageInput,
  GetMessageOutput,
  async (ctx, payload) => {
    const peer = {
      chatType: {
        friend: ChatType.C2C,
        group: ChatType.Group,
        temp: ChatType.TempC2CFromGroup
      }[payload.message_scene],
      peerUid: payload.peer_id.toString(),
      guildId: ''
    }
    if (peer.chatType === ChatType.C2C || peer.chatType === ChatType.TempC2CFromGroup) {
      const uid = await ctx.ntUserApi.getUidByUin(+peer.peerUid)
      if (!uid) {
        return Failed(-404, 'User not found')
      }
      peer.peerUid = uid
    }

    const msgResult = await ctx.ntMsgApi.getSingleMsg(peer, payload.message_seq)
    if (msgResult.msgList.length === 0) {
      return Failed(-404, 'Message not found')
    }
    const rawMsg = msgResult.msgList[0]

    let message
    if (payload.message_scene === 'friend') {
      const friend = await ctx.ntFriendApi.getFriendByUid(rawMsg.senderUid, false)
      message = await transformIncomingPrivateMessage(ctx, friend!, rawMsg)
    } else if (payload.message_scene === 'group') {
      const group = await ctx.ntGroupApi.getGroup(+rawMsg.peerUid, false)
      const member = await ctx.ntGroupApi.getGroupMemberByUid(+rawMsg.peerUin, rawMsg.senderUid, false)
      message = await transformIncomingGroupMessage(ctx, group, member!, rawMsg)
    } else {
      const group = await ctx.ntGroupApi.getGroup(rawMsg.tempFromGroupCode, false)
      message = await transformIncomingTempMessage(ctx, group, rawMsg)
    }
    if (message.segments.length === 0) {
      return Failed(-404, 'Message not found')
    }
    return Ok({ message })
  }
)

const GetHistoryMessages = defineApi(
  'get_history_messages',
  GetHistoryMessagesInput,
  GetHistoryMessagesOutput,
  async (ctx, payload) => {
    const peer = {
      chatType: {
        friend: 1,
        group: 2,
        temp: 100
      }[payload.message_scene],
      peerUid: payload.peer_id.toString(),
      guildId: ''
    }
    if (peer.chatType === 1 || peer.chatType === 100) {
      const uid = await ctx.ntUserApi.getUidByUin(+peer.peerUid)
      if (!uid) {
        return Failed(-404, 'User not found')
      }
      peer.peerUid = uid
    }

    let msgList: RawMessage[]
    if (!payload.start_message_seq) {
      // 没传起点：用 getLatestMsgSeq 拿当前最新 seq，再倒拉 N 条
      const latestSeq = await ctx.ntMsgApi.getLatestMsgSeq(peer)
      msgList = (await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, latestSeq, payload.limit, false)).msgList
    } else {
      msgList = (await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, payload.start_message_seq, payload.limit, true)).msgList
    }

    if (msgList.length === 0) {
      return Ok({
        messages: [],
        next_message_seq: undefined,
      })
    }

    const transformedMessages: GetHistoryMessagesOutput['messages'] = []
    if (payload.message_scene === 'friend') {
      const friend = await ctx.ntFriendApi.getFriendByUid(msgList[0].peerUid, false)
      for (const msg of msgList) {
        transformedMessages.push(await transformIncomingPrivateMessage(ctx, friend!, msg))
      }
    } else if (payload.message_scene === 'group') {
      const group = await ctx.ntGroupApi.getGroup(payload.peer_id, false)
      for (const msg of msgList) {
        const member = await ctx.ntGroupApi.getGroupMemberByUid(+msg.peerUid, msg.senderUid, false)
        transformedMessages.push(await transformIncomingGroupMessage(ctx, group, member!, msg))
      }
    } else {
      let group
      for (const msg of msgList) {
        group ??= await ctx.ntGroupApi.getGroup(msg.tempFromGroupCode, false)
        transformedMessages.push(await transformIncomingTempMessage(ctx, group, msg))
      }
    }

    let nextMessageSeq = undefined
    if (msgList.length > 0) {
      const seq = +msgList[0].msgSeq - 1
      if (seq >= 0) {
        nextMessageSeq = seq
      }
    }

    return Ok({
      messages: transformedMessages.filter(e => e.segments.length > 0),
      next_message_seq: nextMessageSeq,
    })
  }
)

const GetResourceTempUrl = defineApi(
  'get_resource_temp_url',
  GetResourceTempUrlInput,
  GetResourceTempUrlOutput,
  async (ctx, payload) => {
    const buffer = Buffer.from(payload.resource_id, 'base64url')
    const { appid } = Media.FileIdInfo.decode(buffer)
    if (appid === 1402 || appid === 1403) {
      const url = await ctx.ntFileApi.getPttUrl(payload.resource_id, appid === 1403)
      return Ok({ url })
    } else if (appid === 1406 || appid === 1407) {
      const rkeyData = await ctx.ntFileApi.rkeyManager.getRkey(true)
      const rkey = appid === 1406 ? rkeyData.private_rkey : rkeyData.group_rkey
      const url = `${IMAGE_HTTP_HOST_NT}/download?appid=${appid}&fileid=${payload.resource_id}&spec=0${rkey}`
      return Ok({ url })
    } else if (appid === 1413 || appid === 1415) {
      const url = await ctx.ntFileApi.getVideoUrl(payload.resource_id, appid === 1415)
      return Ok({ url })
    } else {
      ctx.logger.warn(`GetResourceTempUrl: not yet supported appid: ${appid}`)
      return Ok({
        url: '',
      })
    }
  }
)

const GetForwardedMessages = defineApi(
  'get_forwarded_messages',
  GetForwardedMessagesInput,
  GetForwardedMessagesOutput,
  async (ctx, payload) => {
    const result = await ctx.qqProtocol.getMultiMsg(payload.forward_id)
    return Ok({
      messages: await Promise.all(
        result[0].buffer.msg.map(async e => await transformIncomingForwardedMessage(ctx, e))
      )
    })
  }
)

const MarkMessageAsRead = defineApi(
  'mark_message_as_read',
  MarkMessageAsReadInput,
  z.object({}),
  async (ctx, payload) => {
    const peer = {
      chatType: {
        friend: 1,
        group: 2,
        temp: 100
      }[payload.message_scene],
      peerUid: payload.peer_id.toString(),
      guildId: ''
    }
    if (peer.chatType === 1 || peer.chatType === 100) {
      const uid = await ctx.ntUserApi.getUidByUin(+peer.peerUid)
      if (!uid) {
        return Failed(-404, 'User not found')
      }
      peer.peerUid = uid
    }
    await ctx.ntMsgApi.setMsgRead(peer, payload.message_seq)
    return Ok({})
  }
)

export const MessageApi: MilkyApiHandler[] = [
  SendPrivateMessage,
  SendGroupMessage,
  GetMessage,
  GetHistoryMessages,
  GetResourceTempUrl,
  RecallPrivateMessage,
  RecallGroupMessage,
  GetForwardedMessages,
  MarkMessageAsRead
]
