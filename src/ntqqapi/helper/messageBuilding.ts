import { InferProtoModelInput } from '@saltify/typeproto'
import { ChatType, ElementType, SendArkElement, SendFaceElement, SendFileElement, SendMarketFaceElement, SendMessageElement, SendMultiForwardMsgElement, SendPicElement, SendPttElement, SendReplyElement, SendTextElement, SendVideoElement } from '../types'
import { Msg } from '../proto'
import { Context } from 'cordis'
import { deflateSync } from 'node:zlib'

export class MessageBuilding {
  private ctx: Context
  private inputElems: SendMessageElement[]
  private outputElems: InferProtoModelInput<typeof Msg.Elem>[]
  private chatType: ChatType
  private peerUid: string
  private nestedForwardTrace: Map<string, Buffer[]>
  private content?: Buffer
  private isInsideForward: boolean

  constructor(
    ctx: Context,
    elements: SendMessageElement[],
    chatType: ChatType,
    peerUid: string,
    nestedForwardTrace = new Map(),
    isInsideForward = false,
  ) {
    this.ctx = ctx
    this.inputElems = elements
    this.outputElems = []
    this.chatType = chatType
    this.peerUid = peerUid
    this.nestedForwardTrace = nestedForwardTrace
    this.isInsideForward = isInsideForward
  }

  private async [ElementType.Text](data: SendTextElement) {
    const { textElement } = data
    if (textElement.atType === 1 /* AtType.All */) {
      const attr6 = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x05, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
      this.outputElems.push({ text: { str: textElement.content, attr6Buf: attr6 } })
    } else if (textElement.atType === 2 /* AtType.One */) {
      const attr6Buf = Buffer.alloc(20)
      attr6Buf.writeUInt16BE(0x0001, 0)
      attr6Buf.writeUInt16BE(0x0000, 2)
      attr6Buf.writeUInt16BE((textElement.content).length, 4)
      attr6Buf.writeUInt8(0x00, 6)
      attr6Buf.writeUInt32BE(textElement.atUin, 7)
      attr6Buf.writeUInt16BE(0x0000, 11)
      this.outputElems.push({ text: { str: textElement.content, attr6Buf } })
    } else {
      this.outputElems.push({ text: { str: textElement.content } })
    }
  }

  private async [ElementType.Face](data: SendFaceElement) {
    const { faceElement } = data
    if (faceElement.faceType === 5) {
      const f = faceElement
      const pbElem = Msg.PokeExtra.encode({
        type: f.faceIndex,
      })
      this.outputElems.push({
        commonElem: {
          serviceType: 2,
          pbElem,
          businessType: f.faceIndex,
        },
      })
    } else if (faceElement.faceType === 3 && this.inputElems.length === 1) {
      // 腾讯协议约束：超级大表情 LargeFaceExtra（dice / rps / 超级表情等）必须作为单体消息独立发送（消息段数组长度为 1），
      // 此时才视为合法的大表情调用，构造 serviceType: 37；若在图文混排等情况（消息段数组的长度 > 1）中强传 37，腾讯服务端会拒收并报错 retcode: 1200。
      const f = faceElement
      const pbElem = Msg.LargeFaceExtra.encode({
        aniStickerPackId: f.packId ? String(f.packId) : '1',
        aniStickerId: String(f.stickerId),
        faceId: faceElement.faceIndex,
        aniStickerType: f.stickerType ?? 2,
        // LargeFaceExtra.resultId 是 string (proto f6), FaceElement.resultId 本来也是 string ——
        // 原来的 + 会把它转成 number 再交给 string encoder.
        resultId: f.resultId || undefined,
      })
      this.outputElems.push({
        commonElem: {
          serviceType: 37,
          pbElem,
          businessType: f.stickerType ?? 1,
        },
      })
    } else if (faceElement.faceType === 2 || faceElement.faceType === 3) {
      // 1. faceType === 2: 原生小黄豆扩展表情。
      // 2. faceType === 3: 虽然具有成为大表情的潜质，但由于与其他文字/图片等消息段混排（未通过上方 length === 1 的独立发送检验），
      //    因此对齐官方 QQ 客户端行为，委屈其降级为小表情形态（serviceType: 33 / QSmallFaceExtra）打包进消息段数组，确保混排消息完整送达且不截断。
      const f = faceElement
      const pbElem = Msg.QSmallFaceExtra.encode({
        faceId: f.faceIndex,
        text: f.faceText,
        compatText: f.faceText
      })
      this.outputElems.push({
        commonElem: {
          serviceType: 33,
          pbElem,
          businessType: f.stickerType ?? 1,
        },
      })
    } else {
      this.outputElems.push({ face: { index: faceElement.faceIndex } })
    }
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
    let srcMsg = replyElement.srcMsg
    if (srcMsg) {
      const decoded = Msg.Message.decode(srcMsg)
      const { elems } = decoded.body!.richText
      const indexToExclude: number[] = []
      for (const [index, elem] of elems.entries()) {
        if (elem.text) {
          const textElem = elem.text
          const isAt = textElem.attr6Buf && textElem.attr6Buf.length > 0
          // attr6Buf 布局：[2B flag][2B reserved][2B text len][1B atType][4B target uin BE][2B reserved]
          if (isAt && textElem.attr6Buf!.length >= 11 && textElem.attr6Buf![6] !== 1) {
            if (elem.text.pbReserve) {
              const attr = Msg.TextResvAttr.decode(elem.text.pbReserve)
              // 引用消息会有两个 at，其中一个 atMemberUin 为 0
              if (attr.atType === 2 && attr.atMemberUin === 0) {
                // 移除第一个 at 以及附带的空格，不然被引用的消息内容会显示有两个 at
                indexToExclude.push(index, index + 1)
                break
              }
            }
          }
        }
      }
      if (indexToExclude.length > 0) {
        decoded.body!.richText.elems = elems.filter((_, index) => {
          return !indexToExclude.includes(index)
        })
        srcMsg = Msg.Message.encode(decoded)
      }
    }
    this.outputElems.push({
      srcMsg: {
        origSeqs: [replyElement.replyMsgClientSeq || replyElement.replyMsgSeq],
        senderUin: replyElement.senderUin,
        time: replyElement.replyMsgTime,
        attr: {
          senderUid: replyElement.senderUid,
          ntMsgSeq: replyElement.replyMsgClientSeq ? replyElement.replyMsgSeq : undefined
        },
        srcMsg
      }
    })
    if (this.chatType === ChatType.Group && !this.isInsideForward) {
      const attr6Buf = Buffer.alloc(20)
      attr6Buf.writeUInt16BE(0x0001, 0)
      attr6Buf.writeUInt16BE(0x0000, 2)
      attr6Buf.writeUInt16BE('@'.length, 4)
      attr6Buf.writeUInt8(0x00, 6)
      attr6Buf.writeUInt32BE(replyElement.senderUin, 7)
      attr6Buf.writeUInt16BE(0x0000, 11)
      const pbReserve = Msg.TextResvAttr.encode({
        atType: 2,
        atMemberUin: 0,
        atMemberUid: replyElement.senderUid
      })
      this.outputElems.push({
        text: {
          str: '@',
          attr6Buf,
          pbReserve
        }
      }, {
        text: {
          str: ' '
        }
      })
    }
  }

  private async [ElementType.Pic](data: SendPicElement) {
    const { picElement: p } = data
    const isGroup = this.chatType === ChatType.Group
    const result = isGroup
      ? await this.ctx.ntFileApi.uploadGroupImage(this.peerUid, p.sourcePath!, p.picWidth!, p.picHeight!, p.summary!, p.picSubType!)
      : await this.ctx.ntFileApi.uploadPrivateImage(this.chatType, this.peerUid, p.sourcePath!, p.picWidth!, p.picHeight!, p.summary!, p.picSubType!)
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
      : await this.ctx.ntFileApi.uploadPrivateVideo(this.chatType, this.peerUid, v.filePath!, v.thumbPath!, v.fileTime!, v.thumbWidth!, v.thumbHeight!)
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
      : await this.ctx.ntFileApi.uploadPrivatePtt(this.chatType, this.peerUid, p.filePath!, p.duration!)
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
    const messages: Buffer[] = []
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
          } else if (curr.elementType === ElementType.File) {
            preview = `[文件] ${curr.fileElement.fileName}`
          }
          return acc + preview
        }, '')
        preview.push(`${node.senderName}: ${content}`)
      }
      const { elems, content } = await new MessageBuilding(
        this.ctx,
        node.elements,
        this.chatType,
        this.peerUid,
        this.nestedForwardTrace,
        true,
      ).build()
      if (node.msgStyle) {
        let font = node.msgStyle.fontId === 0
          ? 0x10000n
          : BigInt((node.msgStyle.fontId >> 8) | (node.msgStyle.fontId << 8) & 0xFFFF) | 0x20000n
        if (node.msgStyle.isCsFontEffectEnabled) {
          font |= 1n << 24n
        }
        elems.push({
          elemFlags2: {
            colorTextId: BigInt(node.msgStyle.bubbleId)
          }
        }, {
          generalFlags: {
            bubbleDiyTextId: node.msgStyle.bubbleDiyTextId,
            pendantId: BigInt(node.msgStyle.pendantId),
            pbReserve: Msg.MessageStyleExtra.encode({
              font,
              fontEffectId: node.msgStyle.fontEffectId
            })
          }
        })
      }
      messages.push(Msg.Message.encode({
        routingHead: {
          fromUin: node.senderUin,
          c2c: isGroup ? undefined : {
            name: node.senderName
          },
          group: isGroup ? {
            groupCode: 284840486,
            groupCard: node.senderName,
            groupCardType: 2
          } : undefined
        },
        contentHead: {
          msgType: isGroup ? 82 : 9,
          random: Math.floor(Math.random() * 4294967290),
          // bcb23ea3 把 contentHead.msgSeq 改名成 groupMsgSeqOrC2cClientSeq（字段编号 5 不变）；
          // 合并转发节点这里塞的是节点在转发包内的本地递增 seq。
          groupMsgSeqOrC2cClientSeq: node.msgSeq,
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
          },
          msgContent: content
        }
      }))
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

  private async [ElementType.File](data: SendFileElement) {
    const fileName = data.fileElement.fileName!
    if (this.chatType === ChatType.Group) {
      const uploaded = await this.ctx.ntFileApi.uploadGroupFile(+this.peerUid, data.fileElement.filePath!, fileName)
      const extra = Msg.GroupFileExtra.encode({
        field1: 6,
        fileName,
        inner: {
          info: {
            busId: uploaded.busId,
            fileId: uploaded.fileId,
            fileSize: uploaded.fileSize,
            fileName,
            fileMd5: uploaded.fileMd5,
          },
        },
      })
      const lenBuf = Buffer.alloc(2)
      lenBuf.writeUInt16BE(extra.length)
      this.outputElems.push({
        transElemInfo: {
          elemType: 24,
          elemValue: Buffer.concat([Buffer.from([0x01]), lenBuf, extra]),
        }
      })
    } else {
      const uploaded = await this.ctx.ntFileApi.uploadPrivateFile(this.chatType, this.peerUid, data.fileElement.filePath!, fileName)
      const extra = Msg.FileExtra.encode({
        file: {
          fileType: 0,
          fileUuid: uploaded.fileId,
          fileMd5: uploaded.file10MMd5,
          fileName,
          fileSize: uploaded.fileSize,
          subCmd: 1,
          dangerLevel: 0,
          expireTime: Math.floor((Date.now() / 1000) + 7 * 24 * 60 * 60),
          fileIdCrcMedia: uploaded.crcMedia
        }
      })
      this.content = extra
    }
  }

  async build() {
    for (const element of this.inputElems) {
      const handler = this[element.elementType] as (data: SendMessageElement) => Promise<void>
      await handler.call(this, element)
    }
    return {
      elems: this.outputElems,
      content: this.content
    }
  }
}
