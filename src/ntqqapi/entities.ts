import ffmpeg from 'fluent-ffmpeg'
import faceConfig from './helper/face_config.json'
import pathLib from 'node:path'
import {
  AtType,
  ElementType,
  FaceIndex,
  PicType,
  SendArkElement,
  SendFaceElement,
  SendFileElement,
  SendMarketFaceElement,
  SendPicElement,
  SendPttElement,
  SendReplyElement,
  SendTextElement,
  SendVideoElement,
} from './types'
import { stat, writeFile, copyFile, unlink, access } from 'node:fs/promises'
import { calculateFileMD5 } from '../common/utils/file'
import { defaultVideoThumb, getVideoInfo } from '../common/utils/video'
import { encodeSilk } from '../common/utils/audio'
import { Context } from 'cordis'
import { isNullable } from 'cosmokit'

export namespace SendElement {
  export function text(content: string): SendTextElement {
    return {
      elementType: ElementType.Text,
      elementId: '',
      textElement: {
        content,
        atType: AtType.Unknown,
        atUid: '',
        atTinyId: '',
        atNtUid: '',
      },
    }
  }

  export function at(atUid: string, atNtUid: string, atType: AtType, display: string): SendTextElement {
    return {
      elementType: ElementType.Text,
      elementId: '',
      textElement: {
        content: display,
        atType,
        atUid,
        atTinyId: '',
        atNtUid,
      },
    }
  }

  export function reply(msgSeq: string, msgId: string, senderUin: string): SendReplyElement {
    return {
      elementType: ElementType.Reply,
      elementId: '',
      replyElement: {
        replayMsgSeq: msgSeq,
        replayMsgId: msgId,
        senderUin: senderUin,
        senderUinStr: senderUin,
      },
    }
  }

  export async function pic(ctx: Context, picPath: string, summary = '', subType: 0 | 1 = 0, isFlashPic?: boolean): Promise<SendPicElement> {
    const { md5, fileName, path, fileSize } = await ctx.ntFileApi.uploadFile(picPath, ElementType.Pic, subType)
    if (fileSize === 0) {
      throw '文件异常，大小为 0'
    }
    const imageSize = await ctx.ntFileApi.getImageSize(picPath)
    const picElement = {
      md5HexStr: md5,
      fileSize: fileSize.toString(),
      picWidth: imageSize.width,
      picHeight: imageSize.height,
      fileName: fileName,
      sourcePath: path,
      original: true,
      picType: imageSize.type === 'gif' ? PicType.GIF : PicType.JPEG,
      picSubType: subType,
      fileUuid: '',
      fileSubId: '',
      thumbFileSize: 0,
      summary,
      isFlashPic,
    }
    ctx.logger.info('图片信息', picElement)
    return {
      elementType: ElementType.Pic,
      elementId: '',
      picElement,
    }
  }

  export async function file(ctx: Context, filePath: string, fileName: string, folderId = ''): Promise<SendFileElement> {
    const fileSize = (await stat(filePath)).size.toString()
    if (fileSize === '0') {
      ctx.logger.warn(`文件${fileName}异常，大小为 0`)
      throw new Error('文件异常，大小为 0')
    }
    const element: SendFileElement = {
      elementType: ElementType.File,
      elementId: '',
      fileElement: {
        fileName,
        folderId,
        filePath,
        fileSize,
      },
    }
    return element
  }

  export async function video(ctx: Context, filePath: string, fileName = '', diyThumbPath = ''): Promise<SendVideoElement> {
    await access(filePath)
    const { fileName: _fileName, path, fileSize, md5 } = await ctx.ntFileApi.uploadFile(filePath, ElementType.Video)

    if (fileSize === 0) {
      throw new Error('文件异常，大小为 0')
    }
    const maxMB = 100
    if (fileSize > 1024 * 1024 * maxMB) {
      throw new Error(`视频过大，最大支持${maxMB}MB，当前文件大小${fileSize}B`)
    }
    const thumbDir = pathLib.dirname(path.replaceAll('\\', '/').replace(`/Ori/`, `/Thumb/`))
    let videoInfo = {
      width: 1920,
      height: 1080,
      time: 15,
      format: 'mp4',
      size: fileSize,
      filePath,
    }
    try {
      videoInfo = await getVideoInfo(ctx, path)
      ctx.logger.info('视频信息', videoInfo)
    } catch (e) {
      ctx.logger.info('获取视频信息失败', e)
    }
    const createThumb = new Promise<string>((resolve, reject) => {
      const thumbFileName = `${md5}_0.png`
      const thumbPath = pathLib.join(thumbDir, thumbFileName)
      ctx.logger.info('开始生成视频缩略图', filePath)
      let completed = false

      function useDefaultThumb() {
        if (completed) return
        ctx.logger.info('获取视频封面失败，使用默认封面')
        writeFile(thumbPath, defaultVideoThumb)
          .then(() => {
            resolve(thumbPath)
          })
          .catch(reject)
      }

      setTimeout(useDefaultThumb, 5000)
      ffmpeg(filePath)
        .on('error', () => {
          if (diyThumbPath) {
            copyFile(diyThumbPath, thumbPath)
              .then(() => {
                completed = true
                resolve(thumbPath)
              })
              .catch(reject)
          } else {
            useDefaultThumb()
          }
        })
        .screenshots({
          timestamps: [0],
          filename: thumbFileName,
          folder: thumbDir,
          size: videoInfo.width + 'x' + videoInfo.height,
        })
        .on('end', () => {
          ctx.logger.info('生成视频缩略图', thumbPath)
          completed = true
          resolve(thumbPath)
        })
    })
    const thumbPath = new Map()
    const _thumbPath = await createThumb
    ctx.logger.info('生成视频缩略图', _thumbPath)
    const thumbSize = (await stat(_thumbPath)).size
    thumbPath.set(0, _thumbPath)
    const thumbMd5 = await calculateFileMD5(_thumbPath)
    const element: SendVideoElement = {
      elementType: ElementType.Video,
      elementId: '',
      videoElement: {
        fileName: fileName || _fileName,
        filePath: path,
        videoMd5: md5,
        thumbMd5,
        fileTime: videoInfo.time,
        thumbPath: thumbPath,
        thumbSize,
        thumbWidth: videoInfo.width,
        thumbHeight: videoInfo.height,
        fileSize: String(fileSize),
      },
    }
    ctx.logger.info('videoElement', element)
    return element
  }

  export async function ptt(ctx: Context, pttPath: string): Promise<SendPttElement> {
    const { converted, path: silkPath, duration } = await encodeSilk(ctx, pttPath)
    const { md5, fileName, path, fileSize } = await ctx.ntFileApi.uploadFile(silkPath, ElementType.Ptt)
    if (fileSize === 0) {
      throw new Error('文件异常，大小为 0')
    }
    if (converted) {
      unlink(silkPath)
    }
    return {
      elementType: ElementType.Ptt,
      elementId: '',
      pttElement: {
        fileName: fileName,
        filePath: path,
        md5HexStr: md5,
        fileSize: String(fileSize),
        duration: duration,
        formatType: 1,
        voiceType: 1,
        voiceChangeType: 0,
        canConvert2Text: true,
        waveAmplitudes: [0, 18, 9, 23, 16, 17, 16, 15, 44, 17, 24, 20, 14, 15, 17],
        fileSubId: '',
        playState: 1,
        autoConvertText: 0,
      },
    }
  }

  export function face(faceId: number, faceType?: number): SendFaceElement {
    // 从face_config.json中获取表情名称
    const sysFaces = faceConfig.sysface
    const face = sysFaces.find(face => face.QSid === String(faceId))
    if (!faceType) {
      if (faceId < 222) {
        faceType = 1
      } else {
        faceType = 2
      }
      if (face?.AniStickerType) {
        faceType = 3
      }
    }
    return {
      elementType: ElementType.Face,
      elementId: '',
      faceElement: {
        faceIndex: faceId,
        faceType,
        faceText: face?.QDes,
        stickerId: face?.AniStickerId,
        stickerType: face?.AniStickerType,
        packId: face?.AniStickerPackId,
        sourceType: 1,
      },
    }
  }

  export function mface(emojiPackageId: number, emojiId: string, key: string, summary?: string): SendMarketFaceElement {
    return {
      elementType: ElementType.MarketFace,
      elementId: '',
      marketFaceElement: {
        imageWidth: 300,
        imageHeight: 300,
        emojiPackageId,
        emojiId,
        key,
        faceName: summary || '[商城表情]',
      },
    }
  }

  export function dice(resultId?: string | number): SendFaceElement {
    // 实际测试并不能控制结果
    // 随机1到6
    if (isNullable(resultId)) resultId = Math.floor(Math.random() * 6) + 1
    return {
      elementType: ElementType.Face,
      elementId: '',
      faceElement: {
        faceIndex: FaceIndex.Dice,
        faceType: 3,
        faceText: '[骰子]',
        packId: '1',
        stickerId: '33',
        sourceType: 1,
        stickerType: 2,
        resultId: resultId.toString(),
        surpriseId: '',
        // "randomType": 1,
      },
    }
  }

  // 猜拳(石头剪刀布)表情
  export function rps(resultId?: string | number): SendFaceElement {
    // 实际测试并不能控制结果
    if (isNullable(resultId)) resultId = Math.floor(Math.random() * 3) + 1
    return {
      elementType: ElementType.Face,
      elementId: '',
      faceElement: {
        faceIndex: FaceIndex.RPS,
        faceText: '[包剪锤]',
        faceType: 3,
        packId: '1',
        stickerId: '34',
        sourceType: 1,
        stickerType: 2,
        resultId: resultId.toString(),
        surpriseId: '',
        // "randomType": 1,
      },
    }
  }

  export function ark(data: string): SendArkElement {
    return {
      elementType: ElementType.Ark,
      elementId: '',
      arkElement: {
        bytesData: data,
        linkInfo: null,
        subElementType: null,
      },
    }
  }

  export function shake(): SendFaceElement {
    return {
      elementType: ElementType.Face,
      elementId: '',
      faceElement: {
        faceIndex: 1,
        faceType: 5,
        pokeType: 1,
      },
    }
  }
}
