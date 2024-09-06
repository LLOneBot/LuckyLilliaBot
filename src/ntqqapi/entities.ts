import ffmpeg from 'fluent-ffmpeg'
import faceConfig from './helper/face_config.json'
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
import { stat, writeFile, copyFile, unlink } from 'node:fs/promises'
import { calculateFileMD5, isGIF } from '../common/utils/file'
import { defaultVideoThumb, getVideoInfo } from '../common/utils/video'
import { encodeSilk } from '../common/utils/audio'
import { Context } from 'cordis'
import { isNullable } from 'cosmokit'

//export const mFaceCache = new Map<string, string>() // emojiId -> faceName

export namespace SendElementEntities {
  export function text(content: string): SendTextElement {
    return {
      elementType: ElementType.TEXT,
      elementId: '',
      textElement: {
        content,
        atType: AtType.notAt,
        atUid: '',
        atTinyId: '',
        atNtUid: '',
      },
    }
  }

  export function at(atUid: string, atNtUid: string, atType: AtType, display: string): SendTextElement {
    return {
      elementType: ElementType.TEXT,
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

  export function reply(msgSeq: string, msgId: string, senderUin: string, senderUinStr: string): SendReplyElement {
    return {
      elementType: ElementType.REPLY,
      elementId: '',
      replyElement: {
        replayMsgSeq: msgSeq, // raw.msgSeq
        replayMsgId: msgId, // raw.msgId
        senderUin: senderUin,
        senderUinStr: senderUinStr,
      },
    }
  }

  export async function pic(ctx: Context, picPath: string, summary: string = '', subType: 0 | 1 = 0): Promise<SendPicElement> {
    const { md5, fileName, path, fileSize } = await ctx.ntFileApi.uploadFile(picPath, ElementType.PIC, subType)
    if (fileSize === 0) {
      throw '文件异常，大小为0'
    }
    const maxMB = 30;
    if (fileSize > 1024 * 1024 * 30) {
      throw `图片过大，最大支持${maxMB}MB，当前文件大小${fileSize}B`
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
      picType: isGIF(picPath) ? PicType.gif : PicType.jpg,
      picSubType: subType,
      fileUuid: '',
      fileSubId: '',
      thumbFileSize: 0,
      summary,
    }
    ctx.logger.info('图片信息', picElement)
    return {
      elementType: ElementType.PIC,
      elementId: '',
      picElement,
    }
  }

  export async function file(ctx: Context, filePath: string, fileName = '', folderId = ''): Promise<SendFileElement> {
    const { fileName: _fileName, path, fileSize } = await ctx.ntFileApi.uploadFile(filePath, ElementType.FILE)
    if (fileSize === 0) {
      throw '文件异常，大小为 0'
    }
    const element: SendFileElement = {
      elementType: ElementType.FILE,
      elementId: '',
      fileElement: {
        fileName: fileName || _fileName,
        folderId: folderId,
        filePath: path!,
        fileSize: fileSize.toString(),
      },
    }
    return element
  }

  export async function video(ctx: Context, filePath: string, fileName = '', diyThumbPath = ''): Promise<SendVideoElement> {
    try {
      await stat(filePath)
    } catch (e) {
      throw `文件${filePath}异常，不存在`
    }
    ctx.logger.info('复制视频到QQ目录', filePath)
    const { fileName: _fileName, path, fileSize, md5 } = await ctx.ntFileApi.uploadFile(filePath, ElementType.VIDEO)

    ctx.logger.info('复制视频到QQ目录完成', path)
    if (fileSize === 0) {
      throw '文件异常，大小为0'
    }
    const maxMB = 100;
    if (fileSize > 1024 * 1024 * maxMB) {
      throw `视频过大，最大支持${maxMB}MB，当前文件大小${fileSize}B`
    }
    const pathLib = require('path')
    let thumbDir = path.replace(`${pathLib.sep}Ori${pathLib.sep}`, `${pathLib.sep}Thumb${pathLib.sep}`)
    thumbDir = pathLib.dirname(thumbDir)
    // log("thumb 目录", thumb)
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
    // log("生成缩略图", _thumbPath)
    thumbPath.set(0, _thumbPath)
    const thumbMd5 = await calculateFileMD5(_thumbPath)
    const element: SendVideoElement = {
      elementType: ElementType.VIDEO,
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
        fileSize: '' + fileSize,
        // fileUuid: "",
        // transferStatus: 0,
        // progress: 0,
        // invalidState: 0,
        // fileSubId: "",
        // fileBizId: null,
        // originVideoMd5: "",
        // fileFormat: 2,
        // import_rich_media_context: null,
        // sourceVideoCodecFormat: 2
      },
    }
    ctx.logger.info('videoElement', element)
    return element
  }

  export async function ptt(ctx: Context, pttPath: string): Promise<SendPttElement> {
    const { converted, path: silkPath, duration } = await encodeSilk(ctx, pttPath)
    if (!silkPath) {
      throw '语音转换失败, 请检查语音文件是否正常'
    }
    // log("生成语音", silkPath, duration);
    const { md5, fileName, path, fileSize } = await ctx.ntFileApi.uploadFile(silkPath, ElementType.PTT)
    if (fileSize === 0) {
      throw '文件异常，大小为0'
    }
    if (converted) {
      unlink(silkPath)
    }
    return {
      elementType: ElementType.PTT,
      elementId: '',
      pttElement: {
        fileName: fileName,
        filePath: path,
        md5HexStr: md5,
        fileSize: fileSize,
        // duration: Math.max(1, Math.round(fileSize / 1024 / 3)), // 一秒钟大概是3kb大小, 小于1秒的按1秒算
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

  export function face(faceId: number): SendFaceElement {
    // 从face_config.json中获取表情名称
    const sysFaces = faceConfig.sysface
    const emojiFaces = faceConfig.emoji
    const face = sysFaces.find((face) => face.QSid === faceId.toString())
    faceId = parseInt(faceId.toString())
    // let faceType = parseInt(faceId.toString().substring(0, 1));
    let faceType = 1
    if (faceId >= 222) {
      faceType = 2
    }
    if (face?.AniStickerType) {
      faceType = 3;
    }
    return {
      elementType: ElementType.FACE,
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
      elementType: ElementType.MFACE,
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
      elementType: ElementType.FACE,
      elementId: '',
      faceElement: {
        faceIndex: FaceIndex.dice,
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
      elementType: ElementType.FACE,
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
      elementType: ElementType.ARK,
      elementId: '',
      arkElement: {
        bytesData: data,
        linkInfo: null,
        subElementType: null,
      },
    }
  }
}
