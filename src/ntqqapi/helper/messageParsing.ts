import { InferProtoModel } from '@saltify/typeproto'
import { ElementType, MessageElement } from '../types'
import { Media, Msg } from '../proto'
import { unzipSync } from 'node:zlib'
import faceConfig from '../helper/face_config.json'
import { moveElement } from '@/common/utils'

export function parseElements(
  elems: InferProtoModel<typeof Msg.Elem>[],
  isGroup: boolean
): MessageElement[] {
  let result: MessageElement[] = []
  let skipIndex

  for (const [index, elem] of elems.entries()) {
    if (index === skipIndex) continue

    if (elem.text) {
      const textElem = elem.text
      const isAt = textElem.attr6Buf && textElem.attr6Buf.length > 0
      // attr6Buf 布局：[2B flag][2B reserved][2B text len][1B atType][4B target uin BE][2B reserved]
      let atTargetUin = 0
      if (isAt && textElem.attr6Buf!.length >= 11 && textElem.attr6Buf![6] !== 1) {
        if (elem.text.pbReserve) {
          const attr = Msg.TextResvAttr.decode(elem.text.pbReserve)
          // 引用消息会有两个 at，其中一个 atMemberUin 为 0
          if (attr.atType === 2 && attr.atMemberUin === 0) {
            skipIndex = index + 1 // 跳过附加的空格
            continue
          }
        }
        atTargetUin = textElem.attr6Buf!.readUInt32BE(7)
      }
      result.push({
        elementType: ElementType.Text,
        textElement: {
          content: textElem.str,
          atType: isAt ? (textElem.attr6Buf![6] === 1 ? 1 : 2) : 0,
          atUin: atTargetUin,
        },
      })
      continue
    }

    if (elem.face) {
      const faceIndex = elem.face.index
      const face = faceConfig.sysface.find(face => face.QSid === faceIndex.toString())
      result.push({
        elementType: ElementType.Face,
        faceElement: {
          faceIndex,
          faceType: 1,
          faceText: face?.QDes ?? '',
        },
      })
      continue
    }

    // Old(TIM) format C2C image
    if (elem.notOnlineImage) {
      const img = elem.notOnlineImage
      result.push({
        elementType: ElementType.Pic,
        picElement: {
          fileName: img.filePath,
          fileSize: img.fileLen,
          picWidth: img.picWidth,
          picHeight: img.picHeight,
          md5HexStr: img.picMd5.toString('hex'),
          sourcePath: '',
          picType: img.imgType,
          picSubType: img.bizType,
          fileUuid: img.resId.split('-')[1],
          originImageUrl: img.origUrl,
          summary: ''
        },
      })
      continue
    }

    // Old(TIM) format group image
    if (elem.customFace) {
      const cf = elem.customFace
      result.push({
        elementType: ElementType.Pic,
        picElement: {
          fileName: cf.filePath,
          fileSize: cf.size,
          picWidth: cf.width,
          picHeight: cf.height,
          md5HexStr: cf.md5.toString('hex'),
          sourcePath: '',
          picSubType: cf.bizType,
          fileUuid: cf.fileId.toString(),
          originImageUrl: cf.origUrl,
          picType: cf.imageType,
          summary: ''
        },
      })
      continue
    }

    // Market face / sticker
    if (elem.marketFace) {
      const mf = elem.marketFace
      result.push({
        elementType: ElementType.MarketFace,
        marketFaceElement: {
          emojiPackageId: mf.tabId ?? 0,
          imageWidth: mf.width ?? 0,
          imageHeight: mf.height ?? 0,
          faceName: mf.summary ?? '',
          emojiId: mf.faceId ? Buffer.from(mf.faceId).toString('hex') : '',
          key: mf.key ?? '',
        },
      })
      break
    }

    // Old format video（仅在没有 commonElem(serviceType=48,businessType=21|11) 视频时使用，
    // 否则会出现重复的 video 段）
    /*if (elem.videoFile) {
      const hasCommonVideo = elems.some((e: any) =>
        e?.commonElem?.serviceType === 48 && (e.commonElem.businessType === 21 || e.commonElem.businessType === 11))
      if (hasCommonVideo) continue
      const v = Msg.VideoFileMsg.decode(Buffer.from(elem.videoFile))
      result.push({
        elementType: ElementType.Video,
        elementId: '',
        extBufForUI: '',
        videoElement: {
          filePath: '',
          fileName: v.fileName || '',
          videoMd5: v.fileMd5 ? Buffer.from(v.fileMd5).toString('hex') : '',
          thumbMd5: v.thumbFileMd5 ? Buffer.from(v.thumbFileMd5).toString('hex') : '',
          fileTime: v.fileTime || 0,
          thumbSize: 0,
          fileFormat: v.fileFormat || 0,
          fileSize: String(v.fileSize || 0),
          thumbWidth: v.thumbWidth || 0,
          thumbHeight: v.thumbHeight || 0,
          busiType: 0,
          subBusiType: 0,
          thumbPath: new Map(),
          transferStatus: 0,
          progress: 0,
          invalidState: 0,
          fileUuid: v.fileUuid || '',
          fileSubId: '',
          fileBizId: 0,
          originVideoMd5: '',
          import_rich_media_context: null,
          sourceVideoCodecFormat: 0,
        },
      })
      continue
    }*/

    if (elem.richMsg) {
      // serviceId 35 = forward message, others are ark
      const isForward = elem.richMsg.serviceId === 35
      let template = ''
      try {
        const buf = elem.richMsg.template
        if (buf && buf.length > 1) {
          template = unzipSync(buf.subarray(1)).toString()
        }
      } catch {
        template = elem.richMsg.template?.toString() ?? ''
      }
      if (isForward) {
        const resid = template.match(/m_resid="([^"]+)"/)?.[1]
        const fileName = template.match(/m_fileName="([^"]+)"/)?.[1]
        result.push({
          elementType: ElementType.MultiForward,
          multiForwardMsgElement: {
            xmlContent: template,
            resId: resid ?? '',
            fileName: fileName ?? '',
            nodes: [],
            title: '',
            preview: [],
            summary: '',
            prompt: '',
          },
        })
      }/* else {
        result.push({
          elementType: ElementType.Ark,
          elementId: '',
          extBufForUI: '',
          arkElement: {
            bytesData: template,
            linkInfo: null,
            subElementType: null,
          },
        })
      }*/
      continue
    }

    if (elem.transElemInfo) {
      if (elem.transElemInfo.elemType === 24) {
        const buf = elem.transElemInfo.elemValue
        const length = buf.readInt16BE(1)
        const data = buf.subarray(3, 3 + length)
        const { inner } = Msg.GroupFileExtra.decode(data)
        result.push({
          elementType: ElementType.File,
          fileElement: {
            fileName: inner.info.fileName,
            fileSize: inner.info.fileSize,
            fileMd5: inner.info.fileMd5,
            fileUuid: inner.info.fileId,
            fileBizId: inner.info.busId,
            folderId: '',
            filePath: '',
            expireTime: 0,
          },
        })
        continue
      }
    }

    // @ mention extra info
    /*if (elem.extraInfo) {
      const last = result[result.length - 1]
      // If previous element is a Text @ mention, fill in nick/uin
      if (last?.textElement?.atType) {
        last.textElement.atUid = String(elem.extraInfo.uin || 0)
        if (elem.extraInfo.nick) {
          last.textElement.content = '@' + elem.extraInfo.nick
        }
      }
      continue
    }*/

    if (elem.lightApp) {
      let jsonStr = ''
      if (elem.lightApp.data && elem.lightApp.data.length > 1) {
        try {
          jsonStr = unzipSync(elem.lightApp.data.subarray(1)).toString()
        } catch {
          jsonStr = elem.lightApp.data.subarray(1).toString()
        }
      }
      result.push({
        elementType: ElementType.Ark,
        arkElement: {
          bytesData: jsonStr,
        },
      })
      break
    }

    if (elem.srcMsg) {
      result.push({
        elementType: ElementType.Reply,
        replyElement: {
          replyMsgSeq: isGroup ? elem.srcMsg.origSeqs[0] : (elem.srcMsg.attr.ntMsgSeq ?? 0),
          replyMsgTime: elem.srcMsg.time,
          senderUin: elem.srcMsg.senderUin,
          senderUid: elem.srcMsg.attr.senderUid,
          replyMsgClientSeq: isGroup ? 0 : elem.srcMsg.origSeqs[0],
        },
      })
      continue
    }

    // commonElem with serviceType=48 wraps multimedia (image/voice/video)
    if (elem.commonElem) {
      const svcType = elem.commonElem.serviceType
      const bizType = elem.commonElem.businessType
      const pbElem = elem.commonElem.pbElem

      if (svcType === 2) {
        result.push({
          elementType: ElementType.Face,
          faceElement: {
            faceIndex: bizType,
            faceType: 5,
            faceText: '',
            pokeType: 1,
          },
        })
        break
      } else if (svcType === 33) {
        const ext = Msg.QSmallFaceExtra.decode(pbElem)
        result.push({
          elementType: ElementType.Face,
          faceElement: {
            faceIndex: ext.faceId,
            faceType: 2,
            faceText: ext.text,
          },
        })
      } else if (svcType === 37) {
        // commonElem(serviceType=37) = LargeFaceExtra（dice / rps / 超级表情）
        const ext = Msg.LargeFaceExtra.decode(pbElem)
        const faceIndex = Number(ext.faceId ?? 0)
        const face = faceConfig.sysface.find(f => f.QSid === String(faceIndex))
        result.push({
          elementType: ElementType.Face,
          faceElement: {
            faceIndex,
            faceType: 3,
            faceText: face?.QDes ?? '',
            packId: ext.aniStickerPackId,
            stickerId: ext.aniStickerId,
            stickerType: ext.aniStickerType,
            resultId: ext.resultId !== undefined ? String(ext.resultId) : undefined,
          },
        })
      } else if (svcType === 45) {
        const ext = Msg.MarkdownExtra.decode(pbElem)
        result.push({
          elementType: ElementType.Markdown,
          markdownElement: {
            content: ext.content,
          },
        })
      } else if (svcType === 48) {
        const parsed = parseMsgInfoElement(pbElem, bizType)
        if (parsed) {
          result.push(parsed)
        }
      }
    }
  }

  if (isGroup) {
    // TIM 群聊的引用消息段前面有一个隐藏的 @，需要去掉
    if (result[0]?.textElement && result[2]?.replyElement) {
      result = result.slice(2)
    }
  } else {
    // TIM 私聊的引用消息段在后面，需要调整顺序
    const index = result.findIndex(e => e.replyElement)
    if (index !== -1 && index !== 0) {
      moveElement(result, index, 0)
    }
  }

  return result
}

/**
 * Parse commonElem.pbElem (MsgInfo protobuf) for serviceType=48.
 * bizType: 10/20=image, 11/21=video, 12/22=voice
 */
function parseMsgInfoElement(pbElem: Buffer, bizType: number): MessageElement | null {
  const msgInfo = Media.MsgInfo.decode(pbElem)
  const body = msgInfo.msgInfoBody[0]
  if (!body) return null

  const fileInfo = body.index.info
  const fileUuid = body.index.fileUuid
  const fileSize = fileInfo.fileSize
  const fileName = fileInfo.fileName
  const md5 = fileInfo.md5HexStr

  if (bizType === 10 || bizType === 20) {
    // Image
    const picInfo = body.pic
    let originImageUrl = ''
    if (picInfo?.urlPath) {
      originImageUrl = picInfo.urlPath
      if (picInfo.ext?.originalParam) {
        originImageUrl += picInfo.ext.originalParam
      }
    }
    return {
      elementType: ElementType.Pic,
      picElement: {
        fileName,
        fileSize,
        picWidth: fileInfo.width,
        picHeight: fileInfo.height,
        md5HexStr: md5,
        sourcePath: '',
        picType: fileInfo.fileType.picFormat,
        picSubType: msgInfo.extBizInfo.pic.bizType,
        fileUuid,
        originImageUrl,
        summary: msgInfo.extBizInfo.pic.summary
      },
    }
  } else if (bizType === 12 || bizType === 22) {
    // Voice
    return {
      elementType: ElementType.Ptt,
      pttElement: {
        fileName,
        filePath: '',
        md5HexStr: md5,
        fileSize,
        duration: fileInfo.time,
        formatType: fileInfo.fileType.pttFormat,
        fileUuid,
      },
    }
  } else if (bizType === 11 || bizType === 21) {
    // Video
    return {
      elementType: ElementType.Video,
      videoElement: {
        filePath: '',
        fileName,
        videoMd5: md5,
        fileTime: fileInfo?.time || 0,
        fileFormat: fileInfo?.fileType?.videoFormat || 0,
        fileSize,
        thumbWidth: 0,
        thumbHeight: 0,
        thumbPath: '',
        fileUuid,
      },
    }
  }
  return null
}
