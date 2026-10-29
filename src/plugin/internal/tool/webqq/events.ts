import { Context } from 'cordis'
import { SSEStreamingApi } from 'hono/streaming'
import { ChatType, RawMessage } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import { serializeResult } from '../../service/webui/BE/utils'
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

  // 别人发的, 或自己在其它客户端发的
  ctx.on('nt/message-created', async (data) => {
    if (sseClients.size === 0) return
    await fillPeerUin(data.message)
    await resolveWatchPicUrls(ctx, data.message)
    broadcastMessage('message', { type: 'message-created', data: data.message })
  })

  // 自己经 bot 发的; 没有它, FE 删掉临时气泡后等不到真消息回填
  ctx.on('nt/message-sent', async (data) => {
    if (sseClients.size === 0) return
    await fillPeerUin(data.message)
    await resolveWatchPicUrls(ctx, data.message)
    broadcastMessage('message', { type: 'message-sent', data: data.message })
  })

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
