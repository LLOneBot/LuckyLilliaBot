import { defineApi, Failed, MilkyApiHandler, Ok } from '@/milky/common/api'
import { transformOutgoingForwardMessages, transformOutgoingMessage } from '@/milky/transform/message/outgoing'
import { transformIncomingPrivateMessage, transformIncomingGroupMessage, transformIncomingForwardedMessage } from '@/milky/transform/message/incoming'
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
import { RichMedia } from '@/ntqqapi/proto/compiled'

const SendPrivateMessage = defineApi(
  'send_private_message',
  SendPrivateMessageInput,
  SendPrivateMessageOutput,
  async (ctx, payload) => {
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!uid) {
      return Failed(-404, 'User not found')
    }
    const peer = { chatType: 1, peerUid: uid, guildId: '' } // ChatType.C2C = 1

    let result: RawMessage
    if (payload.message[0].type === 'forward') {
      const raw = await transformOutgoingForwardMessages(
        ctx,
        payload.message[0].data.messages as OutgoingForwardedMessage[],
        peer
      )
      const resid = await ctx.app.pmhq.uploadForward(peer, raw.multiMsgItems)
      const uuid = randomUUID()
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
            desc: '[聊天记录]',
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
            prompt: '[聊天记录]',
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
      const raw = await transformOutgoingForwardMessages(
        ctx,
        payload.message[0].data.messages as OutgoingForwardedMessage[],
        peer
      )
      const resid = await ctx.app.pmhq.uploadForward(peer, raw.multiMsgItems)
      const uuid = randomUUID()
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
            desc: '[聊天记录]',
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
            prompt: '[聊天记录]',
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
    const peer = { chatType: 1, peerUid: uid, guildId: '' } // ChatType.C2C = 1
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
      chatType: payload.message_scene === 'group' ? 2 : 1, // C2C=1, Group=2
      peerUid: payload.peer_id.toString(),
      guildId: ''
    }
    const msgResult = await ctx.ntMsgApi.getMsgsBySeqAndCount(
      peer,
      payload.message_seq.toString(),
      1,
      true,
      true
    )

    if (msgResult.msgList.length === 0) {
      return Failed(-404, 'Message not found')
    }

    const rawMsg = msgResult.msgList[0]
    if (payload.message_scene === 'friend') {
      const friend = await ctx.ntUserApi.getUserSimpleInfo(rawMsg.senderUid)
      const category = await ctx.ntFriendApi.getCategoryById(friend.baseInfo.categoryId)
      return Ok({
        message: await transformIncomingPrivateMessage(ctx, friend, category, rawMsg),
      })
    } else {
      const group = await ctx.ntGroupApi.getGroupAllInfo(rawMsg.peerUid)
      const member = await ctx.ntGroupApi.getGroupMember(rawMsg.peerUin, rawMsg.senderUid)
      return Ok({
        message: await transformIncomingGroupMessage(ctx, group, member, rawMsg),
      })
    }
  }
)

const GetHistoryMessages = defineApi(
  'get_history_messages',
  GetHistoryMessagesInput,
  GetHistoryMessagesOutput,
  async (ctx, payload) => {
    const peer = {
      chatType: payload.message_scene === 'group' ? 2 : 1, // C2C=1, Group=2
      peerUid: payload.peer_id.toString(),
      guildId: ''
    }

    let msgList: RawMessage[]
    if (!payload.start_message_seq) {
      msgList = (await ctx.ntMsgApi.getAioFirstViewLatestMsgs(peer, payload.limit)).msgList
    } else {
      msgList = (await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, payload.start_message_seq.toString(), payload.limit, true, true)).msgList
    }

    if (msgList.length === 0) {
      return Ok({
        messages: [],
        next_message_seq: undefined,
      })
    }

    const transformedMessages: GetHistoryMessagesOutput['messages'] = []

    if (payload.message_scene === 'friend') {
      for (const msg of msgList) {
        const friend = await ctx.ntUserApi.getUserSimpleInfo(msg.senderUid)
        const category = await ctx.ntFriendApi.getCategoryById(friend.baseInfo.categoryId)
        transformedMessages.push(await transformIncomingPrivateMessage(ctx, friend, category, msg))
      }
    } else {
      const group = await ctx.ntGroupApi.getGroupAllInfo(payload.peer_id.toString())
      for (const msg of msgList) {
        const member = await ctx.ntGroupApi.getGroupMember(msg.peerUid, msg.senderUid)
        if (member) {
          transformedMessages.push(await transformIncomingGroupMessage(ctx, group, member, msg))
        }
      }
    }

    return Ok({
      messages: transformedMessages,
      next_message_seq: msgList.length > 0 ? +msgList.at(-1)!.msgSeq - 1 : undefined,
    })
  }
)

const GetResourceTempUrl = defineApi(
  'get_resource_temp_url',
  GetResourceTempUrlInput,
  GetResourceTempUrlOutput,
  async (ctx, payload) => {
    const buffer = Buffer.from(payload.resource_id, 'base64url')
    const { appid } = RichMedia.FileIdInfo.decode(buffer)
    // 1402, 1403: private record, group record
    // 1413, 1415: private video, group video
    if (appid === 1406 || appid === 1407) {
      const rkeyData = await ctx.ntFileApi.rkeyManager.getRkey()
      const rkey = appid === 1406 ? rkeyData.private_rkey : rkeyData.group_rkey
      const url = `${IMAGE_HTTP_HOST_NT}/download?appid=${appid}&fileid=${payload.resource_id}&spec=0${rkey}`
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
    const [chatTypeStr, peerUid, msgId] = payload.forward_id.split('|')
    const multiMsgInfo = await ctx.store.getMultiMsgInfo(msgId)
    const rootMsgId = multiMsgInfo[0]?.rootMsgId ?? msgId
    const peer = multiMsgInfo[0]?.peerUid ? {
      chatType: multiMsgInfo[0].chatType,
      peerUid: multiMsgInfo[0].peerUid,
      guildId: ''
    } : {
      chatType: +chatTypeStr,
      peerUid,
      guildId: ''
    }
    const result = await ctx.ntMsgApi.getMultiMsg(peer, rootMsgId, msgId)
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({
      messages: await Promise.all(
        result.msgList.map(async e => await transformIncomingForwardedMessage(ctx, e, rootMsgId, peer))
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
      chatType: payload.message_scene === 'group' ? 2 : 1, // C2C=1, Group=2
      peerUid: payload.peer_id.toString(),
      guildId: ''
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
