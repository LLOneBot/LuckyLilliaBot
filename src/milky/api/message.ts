import { defineApi, Failed, MilkyApiHandler, Ok } from '@/milky/common/api'
import { transformOutgoingForwardMessages, transformOutgoingMessage } from '@/milky/transform/message/outgoing'
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
  OutgoingForwardedMessage,
} from '@saltify/milky-types'
import z from 'zod'
import { IMAGE_HTTP_HOST_NT, RawMessage } from '@/ntqqapi/types'
import { randomUUID } from 'node:crypto'
import { Media } from '@/ntqqapi/proto'

const SendPrivateMessage = defineApi(
  'send_private_message',
  SendPrivateMessageInput,
  SendPrivateMessageOutput,
  async (ctx, payload) => {
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!uid) {
      return Failed(-404, 'User not found')
    }
    const peer = { chatType: 1, peerUid: uid, guildId: '' }
    const isBuddy = await ctx.ntFriendApi.isBuddy(uid)
    if (!isBuddy) {
      const result = await ctx.ntMsgApi.getTempChatInfo(100, uid)
      if (result.tmpChatInfo.groupCode) {
        peer.chatType = 100
      }
    }

    let result: RawMessage
    if (payload.message[0].type === 'forward') {
      const forwardData = payload.message[0].data
      const raw = await transformOutgoingForwardMessages(
        ctx,
        forwardData.messages as OutgoingForwardedMessage[],
        peer,
        {
          title: forwardData.title,
          preview: forwardData.preview,
          summary: forwardData.summary,
          prompt: forwardData.prompt
        }
      )
      const resid = await ctx.app.pmhq.uploadForward(peer, raw.multiMsgItems)
      const uuid = randomUUID()
      const prompt = raw.prompt
      result = await ctx.app.sendMessage(ctx, peer, [{
        elementType: 10,
        elementId: '',
        arkElement: {
          bytesData: JSON.stringify({
            app: 'com.tencent.multimsg',
            config: {
              autosize: 1,
              forward: 1,
              round: 1,
              type: 'normal',
              width: 300,
            },
            desc: prompt,
            extra: JSON.stringify({
              filename: uuid,
              tsum: raw.tsum,
            }),
            meta: {
              detail: {
                news: raw.news,
                resid,
                source: raw.source,
                summary: raw.summary,
                uniseq: uuid,
              },
            },
            prompt,
            ver: '0.0.0.5',
            view: 'contact',
          }),
        },
      }], [])
    } else {
      const { elements, deleteAfterSentFiles } = await transformOutgoingMessage(
        ctx,
        payload.message,
        uid,
        false
      )
      result = await ctx.app.sendMessage(
        ctx,
        peer,
        elements,
        deleteAfterSentFiles
      )
    }


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

    let result: RawMessage
    if (payload.message[0].type === 'forward') {
      const forwardData = payload.message[0].data
      const raw = await transformOutgoingForwardMessages(
        ctx,
        forwardData.messages as OutgoingForwardedMessage[],
        peer,
        {
          title: forwardData.title,
          preview: forwardData.preview,
          summary: forwardData.summary,
          prompt: forwardData.prompt
        }
      )
      const resid = await ctx.app.pmhq.uploadForward(peer, raw.multiMsgItems)
      const uuid = randomUUID()
      const prompt = raw.prompt
      result = await ctx.app.sendMessage(ctx, peer, [{
        elementType: 10,
        elementId: '',
        arkElement: {
          bytesData: JSON.stringify({
            app: 'com.tencent.multimsg',
            config: {
              autosize: 1,
              forward: 1,
              round: 1,
              type: 'normal',
              width: 300,
            },
            desc: prompt,
            extra: JSON.stringify({
              filename: uuid,
              tsum: raw.tsum,
            }),
            meta: {
              detail: {
                news: raw.news,
                resid,
                source: raw.source,
                summary: raw.summary,
                uniseq: uuid,
              },
            },
            prompt,
            ver: '0.0.0.5',
            view: 'contact',
          }),
        },
      }], [])
    } else {
      const { elements, deleteAfterSentFiles } = await transformOutgoingMessage(
        ctx,
        payload.message,
        groupCode,
        true
      )
      result = await ctx.app.sendMessage(
        ctx,
        peer,
        elements,
        deleteAfterSentFiles
      )
    }

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
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!uid) {
      return Failed(-404, 'User not found')
    }
    const peer = { chatType: 1, peerUid: uid, guildId: '' }
    const isBuddy = await ctx.ntFriendApi.isBuddy(uid)
    if (!isBuddy) {
      const result = await ctx.ntMsgApi.getTempChatInfo(100, uid)
      if (result.tmpChatInfo.groupCode) {
        peer.chatType = 100
      }
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
    const result = await ctx.ntMsgApi.recallMsg(peer, [msg.msgList[0].msgId])
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

const RecallGroupMessage = defineApi(
  'recall_group_message',
  RecallGroupMessageInput,
  z.object({}),
  async (ctx, payload) => {
    const peer = { chatType: 2, peerUid: payload.group_id.toString(), guildId: '' } // ChatType.Group = 2
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
    const result = await ctx.ntMsgApi.recallMsg(peer, [msg.msgList[0].msgId])
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
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
        friend: 1,
        group: 2,
        temp: 100
      }[payload.message_scene],
      peerUid: payload.peer_id.toString(),
      guildId: ''
    }
    if (peer.chatType === 1 || peer.chatType === 100) {
      const uid = await ctx.ntUserApi.getUidByUin(peer.peerUid)
      if (!uid) {
        return Failed(-404, 'User not found')
      }
      peer.peerUid = uid
    }

    const msgResult = await ctx.ntMsgApi.queryFirstMsgBySeq(peer, payload.message_seq.toString())
    if (msgResult.msgList.length === 0) {
      return Failed(-404, 'Message not found')
    }
    const rawMsg = msgResult.msgList[0]

    let message
    if (payload.message_scene === 'friend') {
      const friend = await ctx.ntUserApi.getUserSimpleInfo(rawMsg.senderUid)
      const category = await ctx.ntFriendApi.getCategoryById(friend.baseInfo.categoryId)
      message = await transformIncomingPrivateMessage(ctx, friend, category, rawMsg)
    } else if (payload.message_scene === 'group') {
      const group = await ctx.ntGroupApi.getGroupAllInfo(rawMsg.peerUid)
      const member = await ctx.ntGroupApi.getGroupMember(rawMsg.peerUin, rawMsg.senderUid)
      message = await transformIncomingGroupMessage(ctx, group, member, rawMsg)
    } else {
      const { tmpChatInfo } = await ctx.ntMsgApi.getTempChatInfo(100, rawMsg.peerUid)
      const group = await ctx.ntGroupApi.getGroupAllInfo(tmpChatInfo.groupCode)
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
      const uid = await ctx.ntUserApi.getUidByUin(peer.peerUid)
      if (!uid) {
        return Failed(-404, 'User not found')
      }
      peer.peerUid = uid
    }

    let msgList: RawMessage[]
    if (!payload.start_message_seq) {
      msgList = (await ctx.ntMsgApi.getAioFirstViewLatestMsgs(peer, payload.limit)).msgList
    } else {
      msgList = (await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, payload.start_message_seq.toString(), payload.limit, true, true)).msgList
    }

    const filteredMsgList = msgList.filter(msg => {
      if (!msg.senderUid) return false
      if (msg.elements[0].grayTipElement?.subElementType === 1) return false
      return true
    })
    if (filteredMsgList.length === 0) {
      return Ok({
        messages: [],
        next_message_seq: undefined,
      })
    }

    const transformedMessages: GetHistoryMessagesOutput['messages'] = []
    if (payload.message_scene === 'friend') {
      const friend = await ctx.ntUserApi.getUserSimpleInfo(filteredMsgList[0].peerUid)
      const category = await ctx.ntFriendApi.getCategoryById(friend.baseInfo.categoryId)
      for (const msg of filteredMsgList) {
        transformedMessages.push(await transformIncomingPrivateMessage(ctx, friend, category, msg))
      }
    } else if (payload.message_scene === 'group') {
      const group = await ctx.ntGroupApi.getGroupAllInfo(payload.peer_id.toString())
      for (const msg of filteredMsgList) {
        const member = await ctx.ntGroupApi.getGroupMember(msg.peerUid, msg.senderUid)
        transformedMessages.push(await transformIncomingGroupMessage(ctx, group, member, msg))
      }
    } else {
      const { tmpChatInfo } = await ctx.ntMsgApi.getTempChatInfo(100, filteredMsgList[0].peerUid)
      const group = await ctx.ntGroupApi.getGroupAllInfo(tmpChatInfo.groupCode)
      for (const msg of filteredMsgList) {
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
      const url = await ctx.ntFileApi.getVideoUrlByPacket(payload.resource_id, appid === 1415)
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
    const result = await ctx.app.pmhq.getMultiMsg(payload.forward_id)
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
      const uid = await ctx.ntUserApi.getUidByUin(peer.peerUid)
      if (!uid) {
        return Failed(-404, 'User not found')
      }
      peer.peerUid = uid
    }
    const result = await ctx.ntMsgApi.setMsgRead(peer)
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
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
