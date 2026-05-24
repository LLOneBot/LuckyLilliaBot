import { ChatType, ElementType, MessageElement, SendArkElement, SendFaceElement, SendMarketFaceElement, SendMessageElement, SendReplyElement, SendTextElement } from '@/ntqqapi/types'
import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { createPeer } from '@/onebot11/utils'
import { SendElement } from '@/ntqqapi/entities'
import { uri2local } from '@/common/utils'
import { XMLParser } from 'fast-xml-parser'

interface Payload {
  message_id: number | string
  group_id?: number | string
  user_id?: number | string
}

interface Response {
  message_id: number
}

abstract class ForwardSingleMsg extends BaseAction<Payload, Response> {
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required(),
    group_id: Schema.union([Number, String]),
    user_id: Schema.union([Number, String])
  })

  private deleteAfterSentFiles: string[] = []

  protected async _handle(payload: Payload) {
    // 判断长id
    if (!(+payload.message_id >= -2147483648 && +payload.message_id <= 2147483647)) {
      const short_msg_id = await this.ctx.store.getShortIdByMsgId(String(payload.message_id))
      if (!short_msg_id) {
        throw new Error(`无法找到长id消息${payload.message_id}`)
      }
      payload.message_id = short_msg_id
    }

    // 获取源消息判断是否存在
    const msg = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msg) {
      throw new Error(`无法找到消息${payload.message_id}`)
    }

    // 获取源消息内容
    const { msgList } = await this.ctx.ntMsgApi.getMsgsByMsgId(msg.peer, [msg.msgId])
    if (msgList.length === 0) {
      throw new Error(`无法找到消息内容${payload.message_id}`)
    }

    // 转换消息元素
    const elements = await this.rawElementsToSend(msgList[0].elements, msgList[0].chatType === ChatType.Group)

    // 发送目标的peer
    const peer = await createPeer(this.ctx, payload)

    // 转发消息
    const ret = await this.ctx.app.sendMessage(this.ctx, peer, elements, this.deleteAfterSentFiles)

    // 创建消息id
    const msgShortId = this.ctx.store.createMsgShortId(ret)
    return { message_id: msgShortId }
  }

  private async fetchFile(url: string) {
    const res = await uri2local(this.ctx, url)
    if (!res.success) {
      this.ctx.logger.error(res.errMsg)
      throw Error(res.errMsg)
    }
    if (!res.isLocal) {
      this.deleteAfterSentFiles.push(res.path)
    }
    return res.path
  }

  private async rawElementsToSend(elements: MessageElement[], isGroup: boolean): Promise<SendMessageElement[]> {
    const out: SendMessageElement[] = []
    for (const e of elements) {
      if (e.textElement) {
        out.push(e as SendTextElement)
      } else if (e.faceElement) {
        out.push(e as SendFaceElement)
      } else if (e.picElement) {
        const url = await this.ctx.ntFileApi.getImageUrl(e.picElement.originImageUrl, e.picElement.md5HexStr)
        const path = await this.fetchFile(url)
        out.push(await SendElement.pic(this.ctx, path))
      } else if (e.videoElement) {
        const url = await this.ctx.ntFileApi.getVideoUrl(e.videoElement.fileUuid, isGroup)
        const path = await this.fetchFile(url)
        out.push(await SendElement.video(this.ctx, path))
      } else if (e.pttElement) {
        const url = await this.ctx.ntFileApi.getPttUrl(e.pttElement.fileUuid, isGroup)
        const path = await this.fetchFile(url)
        out.push(await SendElement.ptt(this.ctx, path))
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
    return out
  }
}

export class ForwardFriendSingleMsg extends ForwardSingleMsg {
  actionName = ActionName.ForwardFriendSingleMsg
}

export class ForwardGroupSingleMsg extends ForwardSingleMsg {
  actionName = ActionName.ForwardGroupSingleMsg
}
