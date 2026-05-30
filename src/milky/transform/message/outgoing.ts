import { resolveMilkyUri } from '@/milky/common/download'
import type { Context } from 'cordis'
import { OutgoingSegment } from '@saltify/milky-types'
import { AtType, SendMessageElement } from '@/ntqqapi/types'
import { SendElement } from '@/ntqqapi/entities'
import { TEMP_DIR } from '@/common/globalVars'
import { writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

export async function transformOutgoingMessage(
  ctx: Context,
  segments: OutgoingSegment[],
  peerUid: string,
  isGroup: boolean = false,
) {
  const elements: SendMessageElement[] = []
  const deleteAfterSentFiles: string[] = []

  for (const segment of segments) {
    try {
      if (segment.type === 'text') {
        elements.push(SendElement.text(segment.data.text))
      } else if (segment.type === 'mention' && isGroup) {
        const memberUin = segment.data.user_id
        const info = await ctx.ntGroupApi.getGroupMemberByUin(+peerUid, memberUin, false)
        elements.push(SendElement.at(memberUin, AtType.One, `@${info?.cardName || info?.nick || ''}`))
      } else if (segment.type === 'mention_all' && isGroup) {
        elements.push(SendElement.at(0, AtType.All, '@全体成员'))
      } else if (segment.type === 'face') {
        elements.push(SendElement.face(+segment.data.face_id, segment.data.is_large ? 3 : undefined))
      } else if (segment.type === 'reply') {
        const peer = {
          chatType: isGroup ? 2 : 1,
          peerUid,
          guildId: ''
        }
        let msg = ctx.store.getMsgBySeq(peer.peerUid, segment.data.message_seq)
        if (!msg) {
          const { msgList } = await ctx.ntMsgApi.getSingleMsg(peer, segment.data.message_seq)
          msg = msgList[0]
        }
        if (!msg) {
          throw new Error('被回复的消息未找到')
        }
        elements.push(SendElement.reply(segment.data.message_seq, +msg.senderUin, +msg.msgTime, msg.clientSeq))
      } else if (segment.type === 'image') {
        const imageBuffer = await resolveMilkyUri(segment.data.uri)
        // Save to temp file and upload
        const tempPath = path.join(TEMP_DIR, `image-${randomUUID()}`)
        await writeFile(tempPath, imageBuffer)
        const subType = segment.data.sub_type === 'sticker' ? 1 : 0
        const picElement = await SendElement.pic(ctx, tempPath, segment.data.summary ?? '', subType)
        elements.push(picElement)
        deleteAfterSentFiles.push(tempPath)
      } else if (segment.type === 'record') {
        const recordBuffer = await resolveMilkyUri(segment.data.uri)
        const tempPath = path.join(TEMP_DIR, `audio-${randomUUID()}`)
        await writeFile(tempPath, recordBuffer)
        const pttElement = await SendElement.ptt(ctx, tempPath)
        elements.push(pttElement)
        deleteAfterSentFiles.push(tempPath)
      } else if (segment.type === 'video') {
        const videoBuffer = await resolveMilkyUri(segment.data.uri)
        const tempPath = path.join(TEMP_DIR, `video-${randomUUID()}`)
        await writeFile(tempPath, videoBuffer)
        let thumbTempPath: string | undefined = undefined
        if (segment.data.thumb_uri) {
          const thumbBuffer = await resolveMilkyUri(segment.data.thumb_uri)
          thumbTempPath = path.join(TEMP_DIR, `thumb-${randomUUID()}`)
          await writeFile(thumbTempPath, thumbBuffer)
          deleteAfterSentFiles.push(thumbTempPath)
        }
        const videoElement = await SendElement.video(ctx, tempPath, thumbTempPath)
        elements.push(videoElement)
        deleteAfterSentFiles.push(tempPath)
      } else if (segment.type === 'forward') {
        const { data } = segment
        const nodes: {
          senderUin: number
          senderName: string
          elements: SendMessageElement[]
        }[] = []
        for (const item of data.messages) {
          const res = await transformOutgoingMessage(ctx, item.segments as OutgoingSegment[], peerUid, isGroup)
          deleteAfterSentFiles.push(...res.deleteAfterSentFiles)
          nodes.push({
            senderUin: item.user_id,
            senderName: item.sender_name,
            elements: res.elements
          })
        }
        elements.push(SendElement.forward(nodes, data.title, data.preview, data.summary, data.prompt))
      } else if (segment.type === 'light_app') {
        const arkElement = SendElement.ark(segment.data.json_payload)
        elements.push(arkElement)
      }
    } catch (error) {
      ctx.logger.error('MilkyTransform', `Failed to transform segment ${segment.type}: ${error}`)
    }
  }

  return {
    elements,
    deleteAfterSentFiles
  }
}
