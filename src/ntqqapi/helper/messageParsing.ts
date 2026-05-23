import { InferProtoModel } from '@saltify/typeproto'
import { ElementType, MessageElement } from '../types'
import { Media, Msg } from '../proto'
import { unzipSync } from 'node:zlib'
import faceConfig from '../helper/face_config.json'

export function parseElements(elems: InferProtoModel<typeof Msg.Elem>[]): MessageElement[] {
  const result: MessageElement[] = []

  for (const elem of elems) {
    if (!elem) continue

    if (elem.text) {
      const textElem = elem.text
      const isAt = textElem.attr6Buf && textElem.attr6Buf.length > 0
      // attr6Buf 布局：[2B flag][2B reserved][2B text len][1B atType][4B target uin BE][2B reserved]
      let atTargetUin = 0
      if (isAt && textElem.attr6Buf!.length >= 11 && textElem.attr6Buf![6] !== 1) {
        atTargetUin = (textElem.attr6Buf as Buffer).readUInt32BE(7)
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

    // Old format C2C image
    /*if (elem.notOnlineImage) {
      const img = elem.notOnlineImage
      result.push({
        elementType: ElementType.Pic,
        elementId: '',
        extBufForUI: '',
        picElement: {
          fileName: img.filePath || '',
          fileSize: String(img.fileLen || 0),
          picWidth: img.picWidth || 0,
          picHeight: img.picHeight || 0,
          original: img.original === 1,
          md5HexStr: img.picMd5 ? Buffer.from(img.picMd5).toString('hex') : '',
          sourcePath: '',
          thumbPath: new Map(),
          picType: 0,
          picSubType: 0,
          fileUuid: img.resId || '',
          fileSubId: '',
          thumbFileSize: 0,
          originImageUrl: img.origUrl || '',
          thumbUrl: img.thumbUrl || '',
          bigUrl: img.bigUrl || '',
        },
      })
      continue
    }*/

    // Group image / animated face
    /*if (elem.customFace) {
      const cf = elem.customFace
      result.push({
        elementType: ElementType.Pic,
        elementId: '',
        extBufForUI: '',
        picElement: {
          fileName: cf.filePath || '',
          fileSize: String(cf.size || 0),
          picWidth: cf.width || 0,
          picHeight: cf.height || 0,
          original: false,
          md5HexStr: cf.md5 ? Buffer.from(cf.md5).toString('hex') : '',
          sourcePath: '',
          thumbPath: new Map(),
          picType: 0,
          picSubType: 0,
          fileUuid: '',
          fileSubId: '',
          thumbFileSize: 0,
          originImageUrl: cf.origUrl || '',
          thumbUrl: cf.thumbUrl || '',
          bigUrl: cf.bigUrl || '',
        },
      })
      continue
    }*/

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
      continue
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
      continue
    }

    if (elem.srcMsg) {
      result.push({
        elementType: ElementType.Reply,
        replyElement: {
          replyMsgSeq: elem.srcMsg.origSeqs?.[0] ?? 0,
          replyMsgTime: elem.srcMsg.time,
          senderUin: elem.srcMsg.senderUin,
        },
      })
      continue
    }

    // commonElem with serviceType=48 wraps multimedia (image/voice/video)
    if (elem.commonElem) {
      const svcType = elem.commonElem.serviceType
      const bizType = elem.commonElem.businessType
      const pbElem = elem.commonElem.pbElem

      if (svcType === 48 && pbElem) {
        const parsed = parseMsgInfoElement(pbElem, bizType)
        if (parsed) {
          result.push(parsed)
          continue
        }
      }
    }
  }

  return result
}

/**
 * Parse commonElem.pbElem (MsgInfo protobuf) for serviceType=48.
 * bizType: 10/20=image, 11/21=video, 12/22=voice
 */
function parseMsgInfoElement(pbElem: Buffer, bizType: number): MessageElement | null {
  try {
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
  } catch { }
  return null
}
