import { Context } from 'cordis'
import { ChatType, ElementType, RawMessage, SendMessageElement, SendPicElement, MessageElement, MessageStyle } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import { SendElement } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/entities'
import { rawElementsToSend } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/helper/forwardMsg'
import { serializeResult } from '../../service/webui/BE/utils'
import { unlink, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { TEMP_DIR, selfInfo } from '@/common/globalVars'
import { Hono } from 'hono'

// 发消息一律走 ctx.app.sendMessage, 别直接调 ntMsgApi.sendMsg: C2C 没有回声, 只有它会补发 nt/message-sent,
// 少了这个私聊发完界面空白, 各协议端也收不到。群禁言检查和 groupMsgMask 也在它里面

// 群聊 sendMsg 发出后会等 self-echo 拿真实 msgSeq, 超时抛此错 —— 但消息已发出, 转发场景不算失败.
function isSelfEchoTimeout(e: unknown): boolean {
  return e instanceof Error && e.message.includes('waitForSelfEcho timeout')
}

// 手表老式图没有内嵌 URL, 按 md5 + 老 fileId 现取带 rkey 的 URL 回填 originImageUrl。rkey 约 57 分钟有效,
// 过期靠 FE onError 重取
export async function resolveWatchPicUrls(ctx: Context, message: RawMessage): Promise<void> {
  const ntFileApi = ctx.get('ntFileApi' as never) as Context['ntFileApi'] | undefined
  if (!ntFileApi) return
  const peerUid = message.peerUid
  if (!peerUid) return
  const isGroup = message.chatType === ChatType.Group
  await Promise.all((message.elements ?? []).map(async (elem) => {
    const pic = elem.picElement
    if (!pic || pic.originImageUrl || !pic.md5HexStr || !pic.fileUuid) return
    const url = await ntFileApi.getImageUrl('', pic.md5HexStr, { fileUuid: pic.fileUuid, isGroup, peerUid })
    if (url) pic.originImageUrl = url
  }))
}

export function createMessagesRoutes(ctx: Context, createPicElement: (imagePath: string) => Promise<SendPicElement | null>): Hono {
  const router = new Hono()

  // 前端传的群号可能是 number, 回声里的 peerUid 是 string
  const resolvePeer = async (chatType: number, peerId: string) => {
    let peerUid = String(peerId)
    if (chatType === ChatType.C2C || chatType === ChatType.TempC2CFromGroup) {
      const uid = await ctx.ntUserApi.getUidByUin(+peerId)
      if (!uid) throw new Error('无法获取用户信息')
      peerUid = uid
    }
    return { chatType, peerUid, guildId: '' }
  }

  router.get('/messages', async (c) => {
    try {
      const { chatType, peerId, beforeMsgSeq, afterMsgSeq, limit = '20' } = c.req.query() as {
        chatType: string
        peerId: string
        beforeMsgSeq?: string
        afterMsgSeq?: string
        limit?: string
      }

      if (!chatType || !peerId) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }

      const chatTypeNum = Number(chatType)
      if (chatTypeNum !== ChatType.C2C && chatTypeNum !== ChatType.Group && chatTypeNum !== ChatType.TempC2CFromGroup) {
        return c.json({ success: false, message: `无效的 chatType: ${chatType}，应为 1(私聊)、2(群聊) 或 100(临时会话)` }, 400)
      }

      let peerUid = peerId
      if (chatTypeNum === ChatType.C2C || chatTypeNum === ChatType.TempC2CFromGroup) {
        const uid = await ctx.ntUserApi.getUidByUin(+peerId)
        if (!uid) {
          return c.json({ success: false, message: '无法获取用户信息' }, 400)
        }
        peerUid = uid
      }

      const peer = {
        chatType: chatTypeNum,
        peerUid,
        guildId: ''
      }

      let result
      if (afterMsgSeq) {
        result = await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, +afterMsgSeq, +limit, false)
      } else if (beforeMsgSeq && beforeMsgSeq !== '0') {
        result = await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, +beforeMsgSeq, +limit, true)
      } else {
        const latestSeq = await ctx.ntMsgApi.getLatestMsgSeq(peer)
        result = await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, latestSeq, +limit, true)
      }

      const messages = result?.msgList || []
      messages.sort((a: RawMessage, b: RawMessage) => a.msgTime - b.msgTime)
      await Promise.all(messages.map((m: RawMessage) => resolveWatchPicUrls(ctx, m)))

      return c.json({
        success: true,
        data: serializeResult({
          messages,
          hasMore: messages.length >= parseInt(limit)
        })
      })
    } catch (e) {
      ctx.logger.error('获取消息历史失败:', e)
      return c.json({ success: false, message: '获取消息历史失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/messages', async (c) => {
    const uploadedFiles: string[] = []
    try {
      const { chatType, peerId, content } = await c.req.json() as {
        chatType: number | string
        peerId: string
        content: { type: string; text?: string; imagePath?: string; msgId?: string; msgSeq?: string; uid?: string; uin?: string; name?: string; faceId?: number; filePath?: string; fileName?: string }[]
      }

      if (chatType === undefined || chatType === null || !peerId || !content || content.length === 0) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }

      const chatTypeNum = Number(chatType)
      if (chatTypeNum !== ChatType.C2C && chatTypeNum !== ChatType.Group && chatTypeNum !== ChatType.TempC2CFromGroup) {
        return c.json({ success: false, message: `无效的 chatType: ${chatType}，应为 1(私聊)、2(群聊) 或 100(临时会话)` }, 400)
      }

      let peerUid = peerId
      if (chatTypeNum === ChatType.C2C || chatTypeNum === ChatType.TempC2CFromGroup) {
        const uid = await ctx.ntUserApi.getUidByUin(+peerId)
        if (!uid) {
          return c.json({ success: false, message: '无法获取用户信息' }, 400)
        }
        peerUid = uid
      }

      const peer = {
        chatType: chatTypeNum,
        peerUid,
        guildId: ''
      }

      const elements: SendMessageElement[] = []
      // 文件走独立的上传接口, 不走 sendMsg; FE 一次只发一个文件, 也不跟其他内容混发
      const files: { filePath: string; fileName: string }[] = []
      for (const item of content) {
        if (item.type === 'reply' && item.msgId && item.msgSeq) {
          elements.push({
            elementType: ElementType.Reply,
            replyElement: {
              replyMsgSeq: Number(item.msgSeq),
              replyMsgTime: 0,
              senderUin: Number(item.uin ?? 0),
              senderUid: item.uid ?? '',
              replyMsgClientSeq: 0
            }
          })
        } else if (item.type === 'text' && item.text) {
          elements.push({
            elementType: ElementType.Text,
            textElement: {
              content: item.text,
              atType: 0,
              atUin: 0
            }
          })
        } else if (item.type === 'at' && item.uid) {
          const atUin = item.uin || ''
          const display = item.name ? `@${item.name}` : '@'
          elements.push({
            elementType: ElementType.Text,
            textElement: {
              content: display,
              atType: 2,
              atUin: +atUin
            }
          })
        } else if (item.type === 'image' && item.imagePath) {
          uploadedFiles.push(item.imagePath)
          const picElement = await createPicElement(item.imagePath)
          if (picElement) {
            elements.push(picElement)
          }
        } else if (item.type === 'face' && item.faceId !== undefined) {
          elements.push(SendElement.face(item.faceId))
        } else if (item.type === 'file' && item.filePath && item.fileName) {
          uploadedFiles.push(item.filePath)
          files.push({ filePath: item.filePath, fileName: item.fileName })
        }
      }

      if (files.length > 0) {
        if (elements.length > 0) {
          return c.json({ success: false, message: '文件不能和文字/图片/表情一起发送' }, 400)
        }
        const sentMsgIds: string[] = []
        for (const f of files) {
          if (chatTypeNum === ChatType.Group) {
            const info = await ctx.ntFileApi.uploadGroupFile(+peerId, f.filePath, f.fileName)
            const result = await ctx.ntMsgApi.sendGroupFileMessage(+peerId, info.fileId, info.busId)
            if (result.retCode !== 0) {
              return c.json({ success: false, message: '发送群文件失败', error: result.clientWording || '' }, 500)
            }
            sentMsgIds.push(info.fileId)
          } else {
            const info = await ctx.ntFileApi.uploadPrivateFile(ChatType.C2C, peerUid, f.filePath, f.fileName)
            const result = await ctx.ntMsgApi.sendPrivateFileMessage({
              toUin: +peerId,
              toUid: peerUid,
              fileUuid: info.fileId,
              fileName: f.fileName,
              fileSize: info.fileSize,
              file10MMd5: info.file10MMd5,
              crcMedia: info.crcMedia,
            })
            if (result.resultCode !== 0) {
              return c.json({ success: false, message: '发送私聊文件失败', error: result.errMsg ?? '' }, 500)
            }
            // 私聊文件的真 msgId 来自补发的 nt/message-sent; 群文件拿不到, 只能用 fileId
            sentMsgIds.push(result.message?.msgId ?? info.fileId)
          }
        }

        for (const filePath of uploadedFiles) {
          unlink(filePath).catch(err => {
            ctx.logger.warn(`清理临时文件失败: ${filePath}`, err)
          })
        }

        return c.json({
          success: true,
          data: { msgId: sentMsgIds[0] }
        })
      }

      if (elements.length === 0) {
        return c.json({ success: false, message: '消息内容为空' }, 400)
      }

      const result = await ctx.app.sendMessage(ctx, peer, elements, [])

      for (const filePath of uploadedFiles) {
        unlink(filePath).catch(err => {
          ctx.logger.warn(`清理临时文件失败: ${filePath}`, err)
        })
      }

      return c.json({
        success: true,
        data: { msgId: result.msgId }
      })
    } catch (e) {
      ctx.logger.error('发送消息失败:', e)

      // 发送失败也要清理临时文件
      for (const filePath of uploadedFiles) {
        unlink(filePath).catch(err => {
          ctx.logger.warn(`清理临时文件失败: ${filePath}`, err)
        })
      }

      return c.json({ success: false, message: '发送消息失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/messages/forward', async (c) => {
    let cleanup: string[] = []
    try {
      const { srcChatType, srcPeerId, msgSeq, targetChatType, targetPeerId } = await c.req.json() as {
        srcChatType: number; srcPeerId: string; msgSeq: number | string
        targetChatType: number; targetPeerId: string
      }
      if (srcChatType == null || !srcPeerId || msgSeq == null || targetChatType == null || !targetPeerId) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const srcPeer = await resolvePeer(Number(srcChatType), srcPeerId)
      const targetPeer = await resolvePeer(Number(targetChatType), targetPeerId)
      const src = await ctx.ntMsgApi.getSingleMsg(srcPeer, Number(msgSeq))
      const msg = src.msgList?.[0]
      if (!msg) return c.json({ success: false, message: '找不到源消息' }, 404)

      const { elements, deleteAfterSentFiles } = await rawElementsToSend(ctx, msg.elements, srcPeer)
      cleanup = deleteAfterSentFiles
      if (elements.length === 0) return c.json({ success: false, message: '该消息无可转发内容' }, 400)
      const result = await ctx.app.sendMessage(ctx, targetPeer, elements, [])
      return c.json({ success: true, data: { msgId: result.msgId } })
    } catch (e) {
      // 消息已经发出, 只是等回声超时, 当成功 (前端不依赖 msgSeq)
      if (isSelfEchoTimeout(e)) {
        return c.json({ success: true, data: { msgId: '' } })
      }
      ctx.logger.error('转发消息失败:', e)
      return c.json({ success: false, message: '转发消息失败', error: (e as Error).message }, 500)
    } finally {
      for (const f of cleanup) unlink(f).catch(() => { })
    }
  })

  router.post('/messages/forward-multi', async (c) => {
    const cleanup: string[] = []
    try {
      const { srcChatType, srcPeerId, msgSeqs, targetChatType, targetPeerId } = await c.req.json() as {
        srcChatType: number; srcPeerId: string; msgSeqs: (number | string)[]
        targetChatType: number; targetPeerId: string
      }
      if (srcChatType == null || !srcPeerId || !Array.isArray(msgSeqs) || msgSeqs.length === 0 || targetChatType == null || !targetPeerId) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const srcPeer = await resolvePeer(Number(srcChatType), srcPeerId)
      const targetPeer = await resolvePeer(Number(targetChatType), targetPeerId)

      const seqs = [...msgSeqs].map(Number).sort((a, b) => a - b)
      const nodes: {
        senderUin: number
        senderName: string
        elements: SendMessageElement[]
        msgSeq: number
        msgTime?: number
        msgStyle?: MessageStyle
      }[] = []
      for (const seq of seqs) {
        const res = await ctx.ntMsgApi.getSingleMsg(srcPeer, seq)
        const msg = res.msgList?.[0]
        if (!msg) continue
        const { elements, deleteAfterSentFiles } = await rawElementsToSend(ctx, msg.elements, srcPeer)
        if (elements.length === 0) continue
        cleanup.push(...deleteAfterSentFiles)
        nodes.push({
          senderUin: msg.senderUin,
          senderName: msg.sendMemberName || msg.sendNickName || String(msg.senderUin),
          elements,
          msgSeq: msg.msgSeq,
          msgTime: msg.msgTime,
          msgStyle: msg.msgStyle,
        })
      }
      if (nodes.length === 0) return c.json({ success: false, message: '没有可转发的消息' }, 400)

      const forwardElement = SendElement.forward(nodes)
      const result = await ctx.app.sendMessage(ctx, targetPeer, [forwardElement], [])
      return c.json({ success: true, data: { msgId: result.msgId } })
    } catch (e) {
      if (isSelfEchoTimeout(e)) {
        return c.json({ success: true, data: { msgId: '' } })
      }
      ctx.logger.error('合并转发失败:', e)
      return c.json({ success: false, message: '合并转发失败', error: (e as Error).message }, 500)
    } finally {
      for (const f of cleanup) unlink(f).catch(() => { })
    }
  })

  // segment 跟 FE 的 ForwardMessageSegment 对齐, 只支持 text / image / face / forward, 其他降级成 [类型] 文本
  router.get('/forward-msg', async (c) => {
    try {
      const { resId } = c.req.query() as { resId: string }
      if (!resId) {
        return c.json({ success: false, message: '缺少 resId 参数' }, 400)
      }

      const { msgList } = await ctx.ntMsgApi.getForwardedMsgs(resId)

      const transformed = await Promise.all(msgList.map(async (msg) => {
        const segments: any[] = []
        for (const elem of msg.elements ?? []) {
          if (elem.elementType === ElementType.Text && elem.textElement?.content) {
            segments.push({ type: 'text', data: { text: elem.textElement.content } })
          } else if (elem.elementType === ElementType.Pic && elem.picElement) {
            const p = elem.picElement
            try {
              const url = await ctx.ntFileApi.getImageUrl(p.originImageUrl ?? '', p.md5HexStr ?? '', {
                fileUuid: p.fileUuid,
                isGroup: msg.chatType === ChatType.Group,
                peerUid: msg.peerUid,
              })
              segments.push({
                type: 'image',
                data: { url, width: p.picWidth, height: p.picHeight }
              })
            } catch {
              segments.push({ type: 'text', data: { text: '[图片]' } })
            }
          } else if (elem.elementType === ElementType.Face && elem.faceElement) {
            segments.push({ type: 'face', data: { faceId: elem.faceElement.faceIndex } })
          } else if (elem.elementType === ElementType.MarketFace && (elem as any).marketFaceElement) {
            const mf = (elem as any).marketFaceElement
            segments.push({ type: 'text', data: { text: mf.faceName || '[表情]' } })
          } else if (elem.elementType === ElementType.Video) {
            segments.push({ type: 'text', data: { text: '[视频]' } })
          } else if (elem.elementType === ElementType.Ptt) {
            segments.push({ type: 'text', data: { text: '[语音]' } })
          } else if (elem.elementType === ElementType.File) {
            segments.push({ type: 'text', data: { text: '[文件]' } })
          } else if (elem.elementType === ElementType.MultiForward && elem.multiForwardMsgElement) {
            const mf = elem.multiForwardMsgElement
            const briefMatch = mf.xmlContent?.match(/brief="([^"]+)"/)
            segments.push({
              type: 'forward',
              data: {
                resId: mf.resId,
                title: briefMatch?.[1] || '[聊天记录]',
              }
            })
          } else if (elem.elementType === ElementType.Ark && (elem as any).arkElement?.bytesData) {
            // ark 形态的嵌套转发不解析 m_resid (位置因 ark 类型而异), 给个不带 resId 的占位, FE 显示为不可点
            segments.push({ type: 'forward', data: { title: '[聊天记录]' } })
          }
        }
        return {
          senderName: msg.sendMemberName || msg.sendNickName || '',
          senderUin: Number(msg.senderUin) || 0,
          time: Number(msg.msgTime) || 0,
          segments,
        }
      }))

      return c.json({ success: true, data: transformed })
    } catch (e) {
      ctx.logger.error('获取合并转发消息失败:', e)
      return c.json({ success: false, message: '获取合并转发消息失败', error: (e as Error).message }, 500)
    }
  })

  router.get('/video-url', async (c) => {
    try {
      const { fileUuid, isGroup } = c.req.query() as { fileUuid: string, isGroup: string }
      if (!fileUuid) {
        return c.json({ success: false, message: '缺少 fileUuid 参数' }, 400)
      }
      const url = await ctx.ntFileApi.getVideoUrl(fileUuid, isGroup === 'true')
      return c.json({ success: true, data: url })
    } catch (e) {
      ctx.logger.error('获取视频 URL 失败:', e)
      return c.json({ success: false, message: '获取视频 URL 失败', error: (e as Error).message }, 500)
    }
  })

  // receiverUid: 别人发来的文件用自己的 uid, 自己发出去的用对方的 uid
  router.get('/private-file-url', async (c) => {
    try {
      const { peerUid, fileId, isSelfSend } = c.req.query() as { peerUid: string; fileId: string; isSelfSend?: string }
      if (!peerUid || !fileId) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const receiverUid = isSelfSend === 'true' ? peerUid : selfInfo.uid
      const res = await ctx.ntFileApi.getFileUrl(fileId, false, receiverUid)
      if (res.retCode !== 0) {
        return c.json({ success: false, message: res.retMsg || '获取下载链接失败' }, 500)
      }
      return c.json({ success: true, data: { url: res.url } })
    } catch (e) {
      ctx.logger.error('获取私聊文件下载链接失败:', e)
      return c.json({ success: false, message: '获取私聊文件下载链接失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/messages/recall', async (c) => {
    try {
      const { msgId, chatType, peerUid } = await c.req.json() as {
        msgId: string
        chatType: number
        peerUid: string
      }
      if (!msgId || chatType === undefined || !peerUid) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const peer = { chatType, peerUid, guildId: '' }
      const msg = ctx.store.getMsgByMsgId(msgId)
      if (!msg) {
        return c.json({ success: false, message: '找不到要撤回的消息（可能 store 缓存丢了）' }, 400)
      }
      if (chatType === ChatType.Group) {
        await ctx.ntMsgApi.recallMsg(peer, msg.msgSeq)
      } else {
        await ctx.ntMsgApi.recallMsg(peer, msg.msgSeq, msg.clientSeq, msg.msgRandom, +msg.msgTime)
      }
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('撤回消息失败:', e)
      return c.json({ success: false, message: '撤回消息失败', error: (e as Error).message }, 500)
    }
  })

  // server 对群和私聊用的是同一个 setGroupMsgReaction
  router.post('/messages/emoji-like', async (c) => {
    try {
      const { groupCode, msgSeq, emojiId, set } = await c.req.json() as {
        groupCode: string | number
        msgSeq: number
        emojiId: string
        set: boolean
      }
      if (!groupCode || msgSeq === undefined || !emojiId || set === undefined) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      await ctx.ntMsgApi.setGroupMsgReaction(+groupCode, +msgSeq, emojiId, set)
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('贴表情失败:', e)
      return c.json({ success: false, message: '贴表情失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/messages/ptt-to-text', async (c) => {
    try {
      const { msgId, chatType, peerUid } = await c.req.json() as {
        msgId: string
        chatType: number
        peerUid: string
      }
      if (!msgId || chatType === undefined || !peerUid) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const peer = { chatType, peerUid, guildId: '' }
      const msg = ctx.store.getMsgByMsgId(msgId)
      if (!msg) {
        return c.json({ success: false, message: '找不到原消息（store 缓存丢了）' }, 400)
      }
      const voiceElement = msg.elements.find((e: MessageElement) => e.elementType === ElementType.Ptt)
      if (!voiceElement) {
        return c.json({ success: false, message: '该消息不是语音消息' }, 400)
      }
      const text = await ctx.ntMsgApi.translatePtt2Text(msgId, peer, +msg.senderUin, voiceElement)
      return c.json({ success: true, data: text || '' })
    } catch (e) {
      ctx.logger.error('语音转文字失败:', e)
      return c.json({ success: false, message: '语音转文字失败', error: (e as Error).message }, 500)
    }
  })

  router.get('/fav-emoji', async (c) => {
    try {
      const result = await ctx.ntMsgApi.getCustomFaceList()
      return c.json({ success: true, data: serializeResult(result) })
    } catch (e) {
      ctx.logger.error('获取收藏表情失败:', e)
      return c.json({ success: false, message: '获取收藏表情失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/fav-emoji/delete', async (c) => {
    try {
      const { emojiIds } = await c.req.json() as { emojiIds: string[] }
      if (!emojiIds || !emojiIds.length) {
        return c.json({ success: false, message: '缺少 emojiIds 参数' }, 400)
      }
      const result = await ctx.ntMsgApi.deleteCustomFace(emojiIds)
      return c.json({ success: true, data: serializeResult(result) })
    } catch (e) {
      ctx.logger.error('删除收藏表情失败:', e)
      return c.json({ success: false, message: '删除收藏表情失败', error: (e as Error).message }, 500)
    }
  })

  // filePath 是 bot 本机的路径
  router.post('/fav-emoji/add', async (c) => {
    try {
      const { filePath } = await c.req.json() as { filePath: string }
      if (!filePath) {
        return c.json({ success: false, message: '缺少 filePath 参数' }, 400)
      }
      const result = await ctx.ntMsgApi.addCustomFace(filePath)
      return c.json({ success: true, data: serializeResult(result) })
    } catch (e) {
      ctx.logger.error('添加收藏表情失败:', e)
      return c.json({ success: false, message: '添加收藏表情失败', error: (e as Error).message }, 500)
    }
  })

  // 聊天图片右键"添加到表情": 跟 image-proxy 一样 (host 白名单 + 注入 rkey) 下到临时文件再添加
  router.post('/fav-emoji/add-from-url', async (c) => {
    let tempPath: string | null = null
    try {
      const { url: rawUrl } = await c.req.json() as { url: string }
      if (!rawUrl) {
        return c.json({ success: false, message: '缺少 url 参数' }, 400)
      }

      let url = rawUrl
      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
      } catch {
        return c.json({ success: false, message: '无效的 URL' }, 400)
      }

      // 免得被当成通用代理
      const allowedHosts = ['gchat.qpic.cn', 'multimedia.nt.qq.com.cn', 'c2cpicdw.qpic.cn', 'p.qlogo.cn', 'q1.qlogo.cn', 'p.qpic.cn']
      if (!allowedHosts.some(host => parsedUrl.hostname.includes(host))) {
        return c.json({ success: false, message: '不允许下载此域名的图片' }, 403)
      }

      // 没有 rkey 会 403
      if (!url.includes('rkey=') && (parsedUrl.hostname.includes('multimedia.nt.qq.com.cn') || parsedUrl.hostname.includes('gchat.qpic.cn'))) {
        try {
          const appid = parsedUrl.searchParams.get('appid')
          if (appid && ['1406', '1407'].includes(appid)) {
            const rkeyData = await ctx.ntFileApi.rkeyManager.getRkey()
            const rkey = appid === '1406' ? rkeyData.private_rkey : rkeyData.group_rkey
            if (rkey) url = url + rkey
          }
        } catch (e) {
          ctx.logger.warn('add-from-url 添加 rkey 失败:', e)
        }
      }

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        }
      })
      if (!response.ok) {
        return c.json({ success: false, message: `下载图片失败: ${response.status} ${response.statusText}` }, 500)
      }
      const buffer = Buffer.from(await response.arrayBuffer())

      if (!existsSync(TEMP_DIR)) {
        await mkdir(TEMP_DIR, { recursive: true })
      }
      // 扩展名只用于本地存文件, 取不到就用 png
      const pathExt = parsedUrl.pathname.match(/\.([a-zA-Z0-9]{1,5})$/)?.[1] ?? 'png'
      tempPath = join(TEMP_DIR, `fav-emoji-${randomUUID()}.${pathExt}`)
      await writeFile(tempPath, buffer)

      const result = await ctx.ntMsgApi.addCustomFace(tempPath)
      return c.json({ success: true, data: serializeResult(result) })
    } catch (e) {
      ctx.logger.error('从 URL 添加收藏表情失败:', e)
      return c.json({ success: false, message: '从 URL 添加收藏表情失败', error: (e as Error).message }, 500)
    } finally {
      if (tempPath) {
        unlink(tempPath).catch(() => { })
      }
    }
  })

  return router
}
