import { Context } from 'cordis'
import { XMLParser } from 'fast-xml-parser'
import {
  ChatType,
  MessageElement,
  Peer,
  SendArkElement,
  SendFaceElement,
  SendMarketFaceElement,
  SendMessageElement,
  SendReplyElement,
  SendTextElement,
} from '../types'
import { SendElement } from '../entities'
import { uri2local } from '@/common/utils'
import { selfInfo } from '@/common/globalVars'

/** 图片 / 视频 / 语音要重新下载上传, 嵌套的合并转发重建卡片。deleteAfterSentFiles 是临时下载的文件, 发完要删 */
export async function rawElementsToSend(
  ctx: Context,
  elements: MessageElement[],
  fromPeer: Peer
): Promise<{ elements: SendMessageElement[]; deleteAfterSentFiles: string[] }> {
  const isGroup = fromPeer.chatType === ChatType.Group
  const out: SendMessageElement[] = []
  const deleteAfterSentFiles: string[] = []

  const fetchFile = async (url: string): Promise<string> => {
    const res = await uri2local(ctx, url)
    if (!res.success) {
      ctx.logger.error(res.errMsg)
      throw new Error(res.errMsg)
    }
    if (!res.isLocal) {
      deleteAfterSentFiles.push(res.path)
    }
    return res.path
  }

  for (const e of elements) {
    if (e.textElement) {
      out.push(e as SendTextElement)
    } else if (e.faceElement) {
      out.push(e as SendFaceElement)
    } else if (e.picElement) {
      const url = await ctx.ntFileApi.getImageUrl(e.picElement.originImageUrl, e.picElement.md5HexStr, {
        fileUuid: e.picElement.fileUuid,
        isGroup,
        peerUid: fromPeer.peerUid,
      })
      const path = await fetchFile(url)
      out.push(await SendElement.pic(ctx, path))
    } else if (e.videoElement) {
      const url = await ctx.ntFileApi.getVideoUrl(e.videoElement.fileUuid, isGroup)
      const path = await fetchFile(url)
      out.push(await SendElement.video(ctx, path))
    } else if (e.pttElement) {
      const url = await ctx.ntFileApi.getPttUrl(e.pttElement.fileUuid, isGroup)
      const path = await fetchFile(url)
      out.push(await SendElement.ptt(ctx, path))
    } else if (e.fileElement) {
      const { url } = await ctx.ntFileApi.getFileUrl(
        e.fileElement.fileUuid,
        isGroup,
        isGroup ? fromPeer.peerUid : selfInfo.uid
      )
      const path = await fetchFile(url)
      out.push(await SendElement.file(ctx, path, e.fileElement.fileName))
    } else if (e.arkElement) {
      out.push(e as SendArkElement)
    } else if (e.replyElement) {
      out.push(e as SendReplyElement)
    } else if (e.marketFaceElement) {
      out.push(e as SendMarketFaceElement)
    } else if (e.multiForwardMsgElement) {
      const parser = new XMLParser()
      const content = parser.parse(e.multiForwardMsgElement.xmlContent)
      const uuid = e.multiForwardMsgElement.fileName
      const prompt = e.multiForwardMsgElement.xmlContent.match(/brief="([^"]*)"/)?.[1] ?? '[聊天记录]'
      const json = JSON.stringify({
        app: 'com.tencent.multimsg',
        config: {
          autosize: 1,
          forward: 1,
          round: 1,
          type: 'normal',
          width: 300
        },
        desc: prompt,
        extra: JSON.stringify({
          filename: uuid,
          tsum: 0,
        }),
        meta: {
          detail: {
            news: content.msg.item.title.slice(1).map((e: string) => ({ text: e })),
            resid: e.multiForwardMsgElement.resId,
            source: content.msg.item.title[0],
            summary: content.msg.item.summary,
            uniseq: uuid,
          }
        },
        prompt,
        ver: '0.0.0.5',
        view: 'contact'
      })
      out.push(SendElement.ark(json))
    }
  }

  return { elements: out, deleteAfterSentFiles }
}
