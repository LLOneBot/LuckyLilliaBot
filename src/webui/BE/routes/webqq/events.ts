import { Context } from 'cordis'
import { SSEStreamingApi } from 'hono/streaming'
import { ChatType, RawMessage } from '@/ntqqapi/types'
import { serializeResult } from '../../utils'
import { resolveWatchPicUrls } from './messages'

/** Pushes the NT events the WebQQ page shows live to its SSE clients. */
export function forwardEvents(ctx: Context, sseClients: Set<SSEStreamingApi>) {
  const broadcastMessage = (event: string, data: unknown) => {
    const serializedData = serializeResult(data)
    const message = `event: ${event}\ndata: ${JSON.stringify(serializedData)}\n\n`
    for (const client of sseClients) {
      client.write(message)
    }
  }

  const fillPeerUin = async (message: RawMessage) => {
    if (message.chatType === ChatType.C2C && (!message.peerUin || message.peerUin === 0) && message.peerUid) {
      const uin = await ctx.ntUserApi.getUinByUid(message.peerUid)
      if (uin) {
        message.peerUin = uin
      }
    }
  }

  // 收到的消息 (别人发 / 自己在其它客户端发).
  ctx.on('nt/message-created', async (data) => {
    if (sseClients.size === 0) return
    await fillPeerUin(data.message)
    await resolveWatchPicUrls(ctx, data.message)
    broadcastMessage('message', { type: 'message-created', data: data.message })
  })

  // 自己通过 WebQQ (或 ntMsgApi.sendMsg 任何调用方) 发的消息.
  // 没这条 SSE, FE ChatInput 发完会 onTempMessageRemove 把临时消息清掉但等不到真消息回填 -> 界面空白.
  ctx.on('nt/message-sent', async (data) => {
    if (sseClients.size === 0) return
    await fillPeerUin(data.message)
    await resolveWatchPicUrls(ctx, data.message)
    broadcastMessage('message', { type: 'message-sent', data: data.message })
  })

  // 监听消息撤回事件
  ctx.on('nt/message-deleted', async (data) => {
    if (sseClients.size === 0) return
    broadcastMessage('message', {
      type: 'message-deleted',
      data: {
        msgId: data.msgId,
        msgSeq: data.msgSeq.toString(),
        chatType: data.chatType,
        peerUid: data.peerUid,
        peerUin: data.peerUin.toString(),
        operatorUid: data.operatorUid,
        operatorNick: '',
        isSelfOperate: data.senderUin === data.operatorUin,
        wording: data.displaySuffix
      }
    })
  })

  // 表情回应事件 (群消息被贴表情). 转成 emoji-reaction SSE 推给 FE 实时更新气泡下方的表情.
  ctx.on('nt/group-message-reaction', async (data) => {
    if (sseClients.size === 0) return
    let userName = ''
    try {
      userName = (await ctx.store.getGroupMemberCardName(data.groupCode, data.operatorUin)) || ''
    } catch { /* 查不到名字就留空, 不影响表情显示 */ }
    broadcastMessage('message', {
      type: 'emoji-reaction',
      data: {
        groupCode: data.groupCode.toString(),
        msgSeq: data.msgSeq.toString(),
        emojiId: data.faceId.toString(),
        userId: data.operatorUin.toString(),
        userName,
        isAdd: data.isAdd,
      }
    })
  })

  // TODO: 监听群通知事件（加群申请、邀请入群、被踢等）

  // TODO: 监听好友申请事件

  // TODO: 监听群解散事件

  // TODO: 监听主动退群事件（可能并没有这个事件）
}
