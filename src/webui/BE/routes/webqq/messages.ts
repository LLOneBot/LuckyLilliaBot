import { Context } from 'cordis'
import { ChatType, ElementType, RawMessage, SendMessageElement, SendPicElement, MessageElement } from '@/ntqqapi/types'
import { SendElement } from '@/ntqqapi/entities'
import { serializeResult } from '../../../BE/utils'
import { unlink, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { TEMP_DIR } from '@/common/globalVars'
import { Hono } from 'hono'

export function createMessagesRoutes(ctx: Context, createPicElement: (imagePath: string) => Promise<SendPicElement | null>): Hono {
  const router = new Hono()

  // 获取消息历史 - 返回原始 RawMessage 数据
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

  // 发送消息
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
      // 文件发送是独立 API (uploadGroupFile/uploadPrivateFile + sendGroupFileMessage/
      // sendPrivateFileMessage), 不走 sendMsg(elements). content 里有 file 项就累计
      // 到这里, 循环走完后单独发. 当前 FE handleFileSelect 一次只发一个 file, 且不跟
      // text/image 混发, 所以这里也按"file 项不跟 elements 共存"处理.
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

      // 文件分支: content 全是 file (FE 当前用法). 一次 request 发一个文件.
      if (files.length > 0) {
        if (elements.length > 0) {
          return c.json({ success: false, message: '文件不能和文字/图片/表情一起发送' }, 400)
        }
        const sentMsgIds: string[] = []
        for (const f of files) {
          if (chatTypeNum === ChatType.Group) {
            const info = await ctx.ntFileApi.uploadGroupFile(+peerId, f.filePath, f.fileName)
            const result = await ctx.ntMsgApi.sendGroupFileMessage(+peerId, info.fileId)
            if (result.retCode !== 0) {
              return c.json({ success: false, message: '发送群文件失败', error: result.clientWording || '' }, 500)
            }
            sentMsgIds.push(info.fileId)
          } else {
            // C2C / TempC2CFromGroup: peerUid 上面已经解出 (line 95-102), peerId 是 Uin.
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
            sentMsgIds.push(info.fileId)
          }
        }

        // 发送成功后清理上传的临时文件
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

      const result = await ctx.ntMsgApi.sendMsg(peer, elements)

      // 发送成功后清理上传的临时文件
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

  // 获取合并转发消息内容. 返回的 segment 跟 FE 的 ForwardMessageSegment 对齐:
  // 只覆盖 text / image / face / forward 四类, 其他类型暂时降级成 [类型] 文本占位.
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
              const url = await ctx.ntFileApi.getImageUrl(p.originImageUrl ?? '', p.md5HexStr ?? '')
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
            // 嵌套合并转发: 直接拿 multiForwardMsgElement.resId, brief 从 xmlContent 抠
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
            // 嵌套合并转发也是 ark 形态. 不解析 ark JSON 里的 m_resid (字段名/位置因 ark 类型而异),
            // 给 FE 发个占位 forward 段, 不带 resId; FE 识别 resId 缺失就显示 "[聊天记录]" 不可点.
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

  // 视频播放 URL
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

  // 撤回消息（统一按 msgId 找原消息，自动取 msgSeq/clientSeq/msgRandom/msgTime）
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

  // 贴表情 (setGroupMsgReaction; 实际 server 端对群和私聊都用同一个)
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

  // 语音转文字
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

  // 收藏表情列表 (getCustomFaceList)
  router.get('/fav-emoji', async (c) => {
    try {
      const result = await ctx.ntMsgApi.getCustomFaceList()
      return c.json({ success: true, data: serializeResult(result) })
    } catch (e) {
      ctx.logger.error('获取收藏表情失败:', e)
      return c.json({ success: false, message: '获取收藏表情失败', error: (e as Error).message }, 500)
    }
  })

  // 删除收藏表情 (deleteCustomFace)
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

  // 添加收藏表情（filePath 是 bot 端可访问的本地图片路径）
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

  // 从 URL 下载图片并添加为收藏表情。专给 webui "右键聊天图片→添加到表情" 用：
  // FE 把消息里 picElement.originImageUrl (拼好 host) 传过来，BE 复用 image-proxy
  // 那套 (rkey 注入 + host 白名单 + fetch) 下到 temp 文件，再调 addCustomFace。
  // cordis 直连模式没有 ntFileApi.downloadMedia，所以走 URL 路线最直接。
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

      // 跟 image-proxy 同一份白名单；防止把 BE 当通用代理用
      const allowedHosts = ['gchat.qpic.cn', 'multimedia.nt.qq.com.cn', 'c2cpicdw.qpic.cn', 'p.qlogo.cn', 'q1.qlogo.cn', 'p.qpic.cn']
      if (!allowedHosts.some(host => parsedUrl.hostname.includes(host))) {
        return c.json({ success: false, message: '不允许下载此域名的图片' }, 403)
      }

      // 跟 image-proxy 同一份 rkey 注入（无 rkey 的群图/私图 URL 会 403）
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
      // 取扩展名：URL path 末尾片段优先；都没有就用 png 兜底（addCustomFace 实测扩展名只是给本地存文件用的）
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
