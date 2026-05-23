import { InferProtoModelInput } from '@saltify/typeproto'
import { ChatType, ElementType, SendArkElement, SendFaceElement, SendMarketFaceElement, SendMessageElement, SendPicElement, SendPttElement, SendReplyElement, SendTextElement, SendVideoElement } from '../types'
import { Msg } from '../proto'
import { Context } from 'cordis'
import { deflateSync } from 'node:zlib'

export class MessageBuilding {
  private ctx: Context
  private inputElems: SendMessageElement[]
  private outputElems: InferProtoModelInput<typeof Msg.Elem>[]
  private chatType: ChatType
  private peerUid: string

  constructor(ctx: Context, elements: SendMessageElement[], chatType: ChatType, peerUid: string) {
    this.ctx = ctx
    this.inputElems = elements
    this.outputElems = []
    this.chatType = chatType
    this.peerUid = peerUid
  }

  private async [ElementType.Text](data: SendTextElement) {
    const { textElement } = data
    if (textElement.atType === 1 /* AtType.All */) {
      const attr6 = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x05, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00])
      this.outputElems.push({ text: { str: textElement.content, attr6Buf: attr6 } })
    } else if (textElement.atType === 2 /* AtType.One */) {
      const attr6 = Buffer.alloc(20)
      attr6.writeUInt16BE(0x0001, 0)
      attr6.writeUInt16BE(0x0000, 2)
      attr6.writeUInt16BE((textElement.content).length, 4)
      attr6.writeUInt8(0x00, 6)
      attr6.writeUInt32BE(textElement.atUin, 7)
      attr6.writeUInt16BE(0x0000, 11)
      this.outputElems.push({ text: { str: textElement.content, attr6Buf: attr6 } })
    } else {
      this.outputElems.push({ text: { str: textElement.content } })
    }
  }

  private async [ElementType.Face](data: SendFaceElement) {
    const { faceElement } = data
    this.outputElems.push({ face: { index: faceElement.faceIndex } })
  }

  private async [ElementType.MarketFace](data: SendMarketFaceElement) {
    const { marketFaceElement } = data
    this.outputElems.push({
      marketFace: {
        summary: marketFaceElement.faceName,
        itemType: 6,
        info: 1,
        faceId: Buffer.from(marketFaceElement.emojiId, 'hex'),
        tabId: marketFaceElement.emojiPackageId,
        subType: 3,
        key: marketFaceElement.key,
        width: marketFaceElement.imageWidth,
        height: marketFaceElement.imageHeight,
      }
    })
  }

  private async [ElementType.Reply](data: SendReplyElement) {
    const { replyElement } = data
    this.outputElems.push({
      srcMsg: {
        origSeqs: [replyElement.replyMsgSeq],
        senderUin: replyElement.senderUin,
        time: replyElement.replyMsgTime,
      }
    })
  }

  private async [ElementType.Pic](data: SendPicElement) {
    const { picElement: p } = data
    const isGroup = this.chatType === ChatType.Group
    const result = isGroup
      ? await this.ctx.ntFileApi.uploadGroupImage(this.peerUid, p.sourcePath!, p.picWidth!, p.picHeight!, p.summary!, p.picSubType!)
      : await this.ctx.ntFileApi.uploadPrivateImage(this.peerUid, p.sourcePath!, p.picWidth!, p.picHeight!, p.summary!, p.picSubType!)
    this.outputElems.push({
      commonElem: {
        serviceType: 48,
        pbElem: result.msgInfo,
        businessType: isGroup ? 20 : 10,
      }
    })
  }

  private async [ElementType.Video](data: SendVideoElement) {
    const { videoElement: v } = data
    const isGroup = this.chatType === ChatType.Group
    const result = isGroup
      ? await this.ctx.ntFileApi.uploadGroupVideo(this.peerUid, v.filePath!, v.thumbPath!, v.fileTime!, v.thumbWidth!, v.thumbHeight!)
      : await this.ctx.ntFileApi.uploadPrivateVideo(this.peerUid, v.filePath!, v.thumbPath!, v.fileTime!, v.thumbWidth!, v.thumbHeight!)
    // 注意：视频消息发送后服务端不返回 sequence（field 11 缺失），是已知行为。
    // 真正的 seq 通过 OlPush 推送（server 转码完成后）异步到达。
    this.outputElems.push({
      commonElem: {
        serviceType: 48,
        pbElem: result.msgInfo,
        businessType: isGroup ? 21 : 11,
      }
    })
  }

  private async [ElementType.Ptt](data: SendPttElement) {
    const { pttElement: p } = data
    const isGroup = this.chatType === ChatType.Group
    const result = isGroup
      ? await this.ctx.ntFileApi.uploadGroupPtt(this.peerUid, p.filePath!, p.duration!)
      : await this.ctx.ntFileApi.uploadPrivatePtt(this.peerUid, p.filePath!, p.duration!)
    this.outputElems.push({
      commonElem: {
        serviceType: 48,
        pbElem: result.msgInfo,
        businessType: isGroup ? 22 : 12,
      }
    })
  }

  private async [ElementType.Ark](data: SendArkElement) {
    const { arkElement } = data
    this.outputElems.push({
      lightApp: {
        data: Buffer.concat([Buffer.from([0x01]), deflateSync(Buffer.from(arkElement.bytesData!, 'utf-8'))])
      }
    })
  }

  async build() {
    for (const element of this.inputElems) {
      const handler = this[element.elementType] as (data: SendMessageElement) => Promise<void>
      await handler.call(this, element)
    }
    return this.outputElems
  }
}
