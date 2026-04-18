import { Context } from 'cordis'
import { ChatType, ElementType, RawMessage, SendMessageElement, SendPicElement } from '@/ntqqapi/types'
import { SendElement } from '@/ntqqapi/entities'
import { serializeResult } from '../../../BE/utils'
import { unlink } from 'node:fs/promises'
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
        const uid = await ctx.ntUserApi.getUidByUin(peerId)
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
        result = await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, afterMsgSeq, parseInt(limit), false, true)
      } else if (beforeMsgSeq && beforeMsgSeq !== '0') {
        result = await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, beforeMsgSeq, parseInt(limit), true, true)
      } else {
        result = await ctx.ntMsgApi.getAioFirstViewLatestMsgs(peer, parseInt(limit))
      }

      const messages = result?.msgList || []
      messages.sort((a: RawMessage, b: RawMessage) => parseInt(a.msgTime) - parseInt(b.msgTime))

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
        const uid = await ctx.ntUserApi.getUidByUin(peerId)
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
  router.get('/forward-msg', async (c) => {
    try {
      const { resId } = c.req.query() as { resId: string }
      if (!resId) {
        return c.json({ success: false, message: '缺少 resId 参数' }, 400)
      }

      const items = await ctx.pmhq.getMultiMsg(resId)
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
              } catch { /* ignore */ }
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
              } catch { /* ignore */ }
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
            } catch { /* ignore */ }
          }
        }

        const isGroup = contentHead?.msgType === 82
        const senderName = isGroup
          ? routingHead?.group?.groupCard || ''
          : routingHead?.c2c?.friendName || ''

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
  })

  return router
}
