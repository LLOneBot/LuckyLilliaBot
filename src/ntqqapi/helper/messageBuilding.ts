import { InferProtoModelInput } from '@saltify/typeproto'
import { ChatType, ElementType, FaceType, SendArkElement, SendFaceElement, SendMarketFaceElement, SendMessageElement, SendMultiForwardMsgElement, SendPicElement, SendPttElement, SendReplyElement, SendTextElement, SendVideoElement } from '../types'
import { Msg } from '../proto'
import { Context } from 'cordis'
import { deflateSync } from 'node:zlib'

export class MessageBuilding {
  private ctx: Context
  private inputElems: SendMessageElement[]
  private outputElems: InferProtoModelInput<typeof Msg.Elem>[]
  private chatType: ChatType
  private peerUid: string
  private nestedForwardTrace: Map<string, InferProtoModelInput<typeof Msg.Message>[]>

  constructor(
    ctx: Context,
    elements: SendMessageElement[],
    chatType: ChatType,
    peerUid: string,
    nestedForwardTrace = new Map(),
  ) {
    this.ctx = ctx
    this.inputElems = elements
    this.outputElems = []
    this.chatType = chatType
    this.peerUid = peerUid
    this.nestedForwardTrace = nestedForwardTrace
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
    // dice / rps / 其他 sticker 类（faceType=3，stickerType=2）：QQ NT 协议要把它打包成
    // commonElem(serviceType=37, LargeFaceExtra)，否则 server 收下后接收方只看到一个普通 face id
    // —— 这是 dice/rps 测试一直跑不过的根因。
    if (faceElement.stickerType && faceElement.stickerId) {
      const f = faceElement
      const pbElem = Msg.LargeFaceExtra.encode({
        aniStickerPackId: f.packId ? String(f.packId) : '1',
        aniStickerId: String(f.stickerId),
        faceId: faceElement.faceIndex,
        aniStickerType: f.stickerType ?? 2,
        resultId: f.resultId ? +f.resultId : undefined,
      })
      this.outputElems.push({
        commonElem: {
          serviceType: 37,
          pbElem,
          businessType: f.stickerType ?? 1,
        },
      })
      return
    }
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
    // 有了 srcMsg，不需要提供 elems
    /**let elems
    if (replyElement.elements.length > 0) {
      // 把锚点的 elements 转成简化的 text Msg.Elem 列表内联进 srcMsg.elems。
      // 复杂段（image/video/face/...）退化成占位文本，至少让 client 渲染时
      // 不再显示 "[原消息已过期]" —— 跟 server 端对 mention 段做的归一化是一样的思路。
      const elemBytes = []
      for (const el of replyElement.elements) {
        let str, face
        if (el.elementType === ElementType.Text) {
          str = el.textElement!.content
        } else if (el.elementType === ElementType.Pic) {
          str = el.picElement!.summary || '[图片]'
        } else if (el.elementType === ElementType.Video) {
          str = '[视频]'
        } else if (el.elementType === ElementType.Ptt) {
          str = '[语音]'
        } else if (el.elementType === ElementType.Face) {
          const { faceType, faceIndex, faceText } = el.faceElement!
          if (faceType === FaceType.Old || faceType === FaceType.Normal) {
            face = faceIndex
          } else {
            str = faceText
          }
        } else if (el.elementType === ElementType.MarketFace) {
          str = el.marketFaceElement!.faceName
        } else if (el.elementType === ElementType.Ark) {
          const match = el.arkElement!.bytesData!.match(/"prompt"\s*:\s*"([^"]*)"/)
          str = match?.[1] ?? ''
        } else if (el.elementType === ElementType.MultiForward) {
          str = '[合并转发]'
        }
        if (str !== undefined) {
          elemBytes.push(Msg.Elem.encode({ text: { str } }))
        } else if (face !== undefined) {
          elemBytes.push(Msg.Elem.encode({ face: { index: face } }))
        }
      }
      if (elemBytes.length > 0) {
        elems = elemBytes
      }
    }*/
    this.outputElems.push({
      srcMsg: {
        origSeqs: [replyElement.replyMsgClientSeq || replyElement.replyMsgSeq],
        senderUin: replyElement.senderUin,
        time: replyElement.replyMsgTime,
        attr: {
          ntMsgSeq: replyElement.replyMsgClientSeq ? replyElement.replyMsgSeq : undefined
        },
        srcMsg: replyElement.srcMsg
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

  private async [ElementType.MultiForward](data: SendMultiForwardMsgElement) {
    const { multiForwardMsgElement } = data
    const messages: InferProtoModelInput<typeof Msg.Message>[] = []
    let seq = Math.trunc(Math.random() * 65430)
    const preview = multiForwardMsgElement.preview ?? []
    const needGeneratePreview = preview.length === 0
    const isGroup = this.chatType === ChatType.Group
    for (const node of multiForwardMsgElement.nodes!) {
      if (needGeneratePreview && preview.length < 4) {
        const content = node.elements.reduce((acc, curr) => {
          let preview
          if (curr.elementType === ElementType.Text) {
            preview = curr.textElement.content.slice(0, 70)
          } else if (curr.elementType === ElementType.Face) {
            preview = curr.faceElement.faceText
          } else if (curr.elementType === ElementType.MarketFace) {
            preview = curr.marketFaceElement.faceName
          } else if (curr.elementType === ElementType.Pic) {
            preview = curr.picElement.summary || '[图片]'
          } else if (curr.elementType === ElementType.Video) {
            preview = '[视频]'
          } else if (curr.elementType === ElementType.Ptt) {
            preview = '[语音]'
          } else if (curr.elementType === ElementType.Ark) {
            const match = curr.arkElement.bytesData!.match(/"prompt"\s*:\s*"([^"]*)"/)
            preview = match?.[1] ?? ''
          } else if (curr.elementType === ElementType.MultiForward) {
            preview = '[合并转发]'
          } else if (curr.elementType === ElementType.Reply) {
            preview = ''
          }
          return acc + preview
        }, '')
        preview.push(`${node.senderName}: ${content}`)
      }
      const elems = await new MessageBuilding(
        this.ctx,
        node.elements,
        this.chatType,
        this.peerUid,
        this.nestedForwardTrace,
      ).build()
      messages.push({
        routingHead: {
          fromUin: node.senderUin,
          c2c: isGroup ? undefined : {
            name: node.senderName
          },
          group: isGroup ? {
            groupCode: 284840486,
            groupCard: node.senderName
          } : undefined
        },
        contentHead: {
          msgType: isGroup ? 82 : 9,
          random: Math.floor(Math.random() * 4294967290),
          // bcb23ea3 把 contentHead.msgSeq 改名成 groupMsgSeqOrC2cClientSeq（字段编号 5 不变）；
          // 合并转发节点这里塞的是节点在转发包内的本地递增 seq。
          groupMsgSeqOrC2cClientSeq: seq,
          msgTime: node.msgTime ?? Math.trunc(Date.now() / 1000),
          pkgNum: 1,
          pkgIndex: 0,
          divSeq: 0,
          forward: {
            field1: 0,
            field2: 0,
            field3: 0,
            field4: '',
            avatar: ''
          }
        },
        body: {
          richText: {
            elems
          }
        }
      })
      seq++
    }
    const items = [{
      fileName: 'MultiMsg',
      buffer: {
        msg: messages
      }
    }]
    for (const [key, value] of this.nestedForwardTrace) {
      items.push({
        fileName: key,
        buffer: {
          msg: value
        }
      })
    }
    const resid = await this.ctx.ntMsgApi.uploadForwardMsgs(this.peerUid, isGroup, items)
    const id = crypto.randomUUID()
    this.nestedForwardTrace.set(id, messages)
    const prompt = multiForwardMsgElement.prompt ?? '[聊天记录]'
    const content = JSON.stringify({
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
        filename: id,
        tsum: 0,
      }),
      meta: {
        detail: {
          news: preview.map(e => ({ text: e })),
          resid,
          source: multiForwardMsgElement.title ?? isGroup ? '群聊的聊天记录' : '聊天记录',
          summary: multiForwardMsgElement.summary ?? `查看${multiForwardMsgElement.nodes!.length}条转发消息`,
          uniseq: id,
        }
      },
      prompt,
      ver: '0.0.0.5',
      view: 'contact'
    })
    this.outputElems.push({
      lightApp: {
        data: Buffer.concat([Buffer.from([1]), deflateSync(Buffer.from(content, 'utf-8'))])
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
