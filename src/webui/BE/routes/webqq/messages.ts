import { Router } from 'express'
import { Context } from 'cordis'
import { ChatType, ElementType, RawMessage } from '@/ntqqapi/types'
import { SendElement } from '@/ntqqapi/entities'
import { serializeResult } from '../../../BE/utils'
import { unlink } from 'node:fs/promises'

export function createMessagesRoutes(ctx: Context, createPicElement: (imagePath: string) => Promise<any>): Router {
  const router = Router()

  // 获取消息历史 - 返回原始 RawMessage 数据
  router.get('/messages', async (req, res) => {
    try {
      const { chatType, peerId, beforeMsgSeq, afterMsgSeq, limit = '20' } = req.query as {
        chatType: string
        peerId: string
        beforeMsgSeq?: string
        afterMsgSeq?: string
        limit?: string
      }

      if (!chatType || !peerId) {
        res.status(400).json({ success: false, message: '缺少必要参数' })
        return
      }

      const chatTypeNum = Number(chatType)
      if (chatTypeNum !== ChatType.C2C && chatTypeNum !== ChatType.Group && chatTypeNum !== ChatType.TempC2CFromGroup) {
        res.status(400).json({ success: false, message: `无效的 chatType: ${chatType}，应为 1(私聊)、2(群聊) 或 100(临时会话)` })
        return
      }

      let peerUid = peerId
      if (chatTypeNum === ChatType.C2C || chatTypeNum === ChatType.TempC2CFromGroup) {
        const uid = await ctx.ntUserApi.getUidByUin(peerId)
        if (!uid) {
          res.status(400).json({ success: false, message: '无法获取用户信息' })
          return
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
        result = await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, afterMsgSeq, parseInt(limit), false, true)
      } else if (beforeMsgSeq && beforeMsgSeq !== '0') {
        result = await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, beforeMsgSeq, parseInt(limit), true, true)
      } else {
        result = await ctx.ntMsgApi.getAioFirstViewLatestMsgs(peer, parseInt(limit))
      }

      const messages = result?.msgList || []
      messages.sort((a: RawMessage, b: RawMessage) => parseInt(a.msgTime) - parseInt(b.msgTime))

      res.json({
        success: true,
        data: serializeResult({
          messages,
          hasMore: messages.length >= parseInt(limit)
        })
      })
    } catch (e: any) {
      ctx.logger.error('获取消息历史失败:', e)
      res.status(500).json({ success: false, message: '获取消息历史失败', error: e.message })
    }
  })

  // 发送消息
  router.post('/messages', async (req, res) => {
    const uploadedFiles: string[] = []
    try {
      const { chatType, peerId, content } = req.body as {
        chatType: number | string
        peerId: string
        content: { type: string; text?: string; imagePath?: string; msgId?: string; msgSeq?: string; uid?: string; uin?: string; name?: string; faceId?: number; filePath?: string; fileName?: string }[]
      }

      if (chatType === undefined || chatType === null || !peerId || !content || content.length === 0) {
        res.status(400).json({ success: false, message: '缺少必要参数' })
        return
      }

      const chatTypeNum = Number(chatType)
      if (chatTypeNum !== ChatType.C2C && chatTypeNum !== ChatType.Group && chatTypeNum !== ChatType.TempC2CFromGroup) {
        res.status(400).json({ success: false, message: `无效的 chatType: ${chatType}，应为 1(私聊)、2(群聊) 或 100(临时会话)` })
        return
      }

      let peerUid = peerId
      if (chatTypeNum === ChatType.C2C || chatTypeNum === ChatType.TempC2CFromGroup) {
        const uid = await ctx.ntUserApi.getUidByUin(peerId)
        if (!uid) {
          res.status(400).json({ success: false, message: '无法获取用户信息' })
          return
        }
        peerUid = uid
      }

      const peer = {
        chatType: chatTypeNum,
        peerUid,
        guildId: ''
      }

      const elements: any[] = []
      for (const item of content) {
        if (item.type === 'reply' && item.msgId && item.msgSeq) {
          elements.push({
            elementType: ElementType.Reply,
            elementId: '',
            replyElement: {
              replayMsgId: item.msgId,
              replayMsgSeq: item.msgSeq,
              sourceMsgText: '',
              senderUid: '',
              senderUidStr: ''
            }
          })
        } else if (item.type === 'text' && item.text) {
          elements.push({
            elementType: ElementType.Text,
            elementId: '',
            textElement: {
              content: item.text,
              atType: 0,
              atUid: '',
              atTinyId: '',
              atNtUid: ''
            }
          })
        } else if (item.type === 'at' && item.uid) {
          const atUid = item.uid
          const atUin = item.uin || ''
          const display = item.name ? `@${item.name}` : '@'
          elements.push({
            elementType: ElementType.Text,
            elementId: '',
            textElement: {
              content: display,
              atType: 2,
              atUid: atUin,
              atTinyId: '',
              atNtUid: atUid
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
          const fileElement = await SendElement.file(ctx, item.filePath, item.fileName)
          elements.push(fileElement)
        }
      }

      if (elements.length === 0) {
        res.status(400).json({ success: false, message: '消息内容为空' })
        return
      }

      const result = await ctx.ntMsgApi.sendMsg(peer, elements)
      
      // 发送成功后清理上传的临时文件
      for (const filePath of uploadedFiles) {
        unlink(filePath).catch(err => {
          ctx.logger.warn(`清理临时文件失败: ${filePath}`, err)
        })
      }
      
      res.json({
        success: true,
        data: { msgId: result.msgId }
      })
    } catch (e: any) {
      ctx.logger.error('发送消息失败:', e)
      
      // 发送失败也要清理临时文件
      for (const filePath of uploadedFiles) {
        unlink(filePath).catch(err => {
          ctx.logger.warn(`清理临时文件失败: ${filePath}`, err)
        })
      }
      
      res.status(500).json({ success: false, message: '发送消息失败', error: e.message })
    }
  })

  return router
}
