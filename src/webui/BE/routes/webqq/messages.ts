import { Context } from 'cordis'
import { ChatType, ElementType, RawMessage, SendMessageElement, SendPicElement, MessageElement } from '@/ntqqapi/types'
import { SendElement } from '@/ntqqapi/entities'
import { serializeResult } from '../../../BE/utils'
import { unlink, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { TEMP_DIR } from '@/common/globalVars'
import { Msg, Media } from '@/ntqqapi/proto'
import { inflateSync } from 'node:zlib'
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
        result = await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, latestSeq, +limit, false)
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
      for (const item of content) {
        if (item.type === 'reply' && item.msgId && item.msgSeq) {
          elements.push({
            elementType: ElementType.Reply,
            replyElement: {
              replyMsgSeq: Number(item.msgSeq),
              replyMsgTime: 0,
              senderUin: Number(item.uin ?? 0),
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
          // TODO: 走独立的文件上传接口，如 ntFileApi.uploadGroupFile + ntMsgApi.sendGroupFileMessage
        }
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

  // 获取合并转发消息内容
  // TODO: 迁移至 ntMsgApi.getForwardedMsgs
  /**router.get('/forward-msg', async (c) => {
    try {
      const { resId } = c.req.query() as { resId: string }
      if (!resId) {
        return c.json({ success: false, message: '缺少 resId 参数' }, 400)
      }

      const items = await ctx.qqProtocol.getMultiMsg(resId)
      const messages = items[0]?.buffer?.msg || []

      const transformedMessages = await Promise.all(messages.map(async (msg) => {
        const { body, contentHead, routingHead } = msg
        const segments = []

        for (const elem of body?.richText?.elems || []) {
          if (elem.text) {
            segments.push({ type: 'text', data: { text: elem.text.str } })
          } else if (elem.face) {
            segments.push({ type: 'face', data: { faceId: elem.face.index } })
          } else if (elem.commonElem) {
            const { businessType, serviceType } = elem.commonElem
            if (serviceType === 33) {
              try {
                const { faceId } = Msg.QSmallFaceExtra.decode(elem.commonElem.pbElem)
                segments.push({ type: 'face', data: { faceId } })
              } catch {  }
            } else if (serviceType === 48 && (businessType === 10 || businessType === 20)) {
              try {
                const { extBizInfo, msgInfoBody } = Media.MsgInfo.decode(elem.commonElem.pbElem)
                const { index, pic } = msgInfoBody[0]
                const rkeyData = await ctx.ntFileApi.rkeyManager.getRkey()
                const rkey = businessType === 10 ? rkeyData.private_rkey : rkeyData.group_rkey
                const url = `https://${pic!.domain}${pic!.urlPath}&spec=0${rkey}`
                segments.push({
                  type: 'image',
                  data: {
                    url,
                    width: index.info.width,
                    height: index.info.height,
                  }
                })
              } catch {  }
            }
          } else if (elem.richMsg && elem.richMsg.serviceId === 35) {
            // 嵌套的合并转发
            try {
              const xml = inflateSync(elem.richMsg.template.subarray(1)).toString()
              const nestedResId = xml.match(/m_resid="([^"]+)"/)?.[1]
              if (nestedResId) {
                const titleMatch = xml.match(/brief="([^"]+)"/)?.[1]
                segments.push({
                  type: 'forward',
                  data: {
                    resId: nestedResId,
                    title: titleMatch || '[聊天记录]',
                  }
                })
              }
            } catch {  }
          }
        }

        const isGroup = contentHead?.msgType === 82
        const senderName = isGroup
          ? routingHead?.group?.groupCard || ''
          : routingHead?.c2c?.name || ''

        return {
          senderName,
          senderUin: routingHead?.fromUin || 0,
          time: contentHead?.msgTime || 0,
          segments,
        }
      }))

      return c.json({ success: true, data: transformedMessages })
    } catch (e) {
      ctx.logger.error('获取合并转发消息失败:', e)
      return c.json({ success: false, message: '获取合并转发消息失败', error: (e as Error).message }, 500)
    }
  })*/

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
