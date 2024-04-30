import {
  AtType,
  ElementType,
  FaceIndex,
  FaceType,
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
import { promises as fs } from 'node:fs'
import ffmpeg from 'fluent-ffmpeg'
import { NTQQFileApi } from './api/file'
import { calculateFileMD5, isGIF } from '../common/utils/file'
import { log } from '../common/utils/log'
import { defaultVideoThumb, getVideoInfo } from '../common/utils/video'
import { encodeSilk } from '../common/utils/audio'
import { isNull } from '../common/utils'

export class SendMsgElementConstructor {
  static poke(groupCode: string, uin: string) {
    return null
  }

  static text(content: string): SendTextElement {
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

  static at(atUid: string, atNtUid: string, atType: AtType, atName: string): SendTextElement {
    return {
      elementType: ElementType.TEXT,
      elementId: '',
      textElement: {
        content: `@${atName}`,
        atType,
        atUid,
        atTinyId: '',
        atNtUid,
      },
    }
  }

  static reply(msgSeq: string, msgId: string, senderUin: string, senderUinStr: string): SendReplyElement {
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

  static async pic(picPath: string, summary: string = '', subType: 0 | 1 = 0): Promise<SendPicElement> {
    const { md5, fileName, path, fileSize } = await NTQQFileApi.uploadFile(picPath, ElementType.PIC, subType)
    if (fileSize === 0) {
      throw '文件异常，大小为0'
    }
    const imageSize = await NTQQFileApi.getImageSize(picPath)
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
    log('图片信息', picElement)
    return {
      elementType: ElementType.PIC,
      elementId: '',
      picElement,
    }
  }

  static async file(filePath: string, fileName: string = ''): Promise<SendFileElement> {
    const { md5, fileName: _fileName, path, fileSize } = await NTQQFileApi.uploadFile(filePath, ElementType.FILE)
    if (fileSize === 0) {
      throw '文件异常，大小为0'
    }
    let element: SendFileElement = {
      elementType: ElementType.FILE,
      elementId: '',
      fileElement: {
        fileName: fileName || _fileName,
        filePath: path,
        fileSize: fileSize.toString(),
      },
    }

    return element
  }

  static async video(filePath: string, fileName: string = '', diyThumbPath: string = ''): Promise<SendVideoElement> {
    let { fileName: _fileName, path, fileSize, md5 } = await NTQQFileApi.uploadFile(filePath, ElementType.VIDEO)
    if (fileSize === 0) {
      throw '文件异常，大小为0'
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
      videoInfo = await getVideoInfo(path)
      log('视频信息', videoInfo)
    } catch (e) {
      log('获取视频信息失败', e)
    }
    const createThumb = new Promise<string>((resolve, reject) => {
      const thumbFileName = `${md5}_0.png`
      const thumbPath = pathLib.join(thumbDir, thumbFileName)
      log('开始生成视频缩略图', filePath)
      let completed = false

      function useDefaultThumb() {
        if (completed) return
        log('获取视频封面失败，使用默认封面')
        fs.writeFile(thumbPath, defaultVideoThumb)
          .then(() => {
            resolve(thumbPath)
          })
          .catch(reject)
      }

      setTimeout(useDefaultThumb, 5000)
      ffmpeg(filePath)
        .on('end', () => {})
        .on('error', (err) => {
          if (diyThumbPath) {
            fs.copyFile(diyThumbPath, thumbPath)
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
          log('生成视频缩略图', thumbPath)
          completed = true
          resolve(thumbPath)
        })
    })
    let thumbPath = new Map()
    const _thumbPath = await createThumb
    log('生成缩略图', _thumbPath)
    const thumbSize = (await fs.stat(_thumbPath)).size
    // log("生成缩略图", _thumbPath)
    thumbPath.set(0, _thumbPath)
    const thumbMd5 = await calculateFileMD5(_thumbPath)
    let element: SendVideoElement = {
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
    log('videoElement', element)
    return element
  }

  static async ptt(pttPath: string): Promise<SendPttElement> {
    const { converted, path: silkPath, duration } = await encodeSilk(pttPath)
    if (!silkPath) {
      throw '语音转换失败, 请检查语音文件是否正常'
    }
    // log("生成语音", silkPath, duration);
    const { md5, fileName, path, fileSize } = await NTQQFileApi.uploadFile(silkPath, ElementType.PTT)
    if (fileSize === 0) {
      throw '文件异常，大小为0'
    }
    if (converted) {
      fs.unlink(silkPath).then()
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

  static face(faceId: number): SendFaceElement {
    faceId = parseInt(faceId.toString())
    return {
      elementType: ElementType.FACE,
      elementId: '',
      faceElement: {
        faceIndex: faceId,
        faceType: faceId < 222 ? FaceType.normal : FaceType.normal2,
      },
    }
  }

  static mface(emojiPackageId: number, emojiId: string, key: string): SendMarketFaceElement {
    return {
      elementType: ElementType.MFACE,
      marketFaceElement: {
        emojiPackageId,
        emojiId,
        key,
      },
    }
  }

  static dice(resultId: number | null): SendFaceElement {
    // 实际测试并不能控制结果

    // 随机1到6
    if (isNull(resultId)) resultId = Math.floor(Math.random() * 6) + 1
    return {
      elementType: ElementType.FACE,
      elementId: '',
      faceElement: {
        faceIndex: FaceIndex.dice,
        faceType: FaceType.dice,
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
  static rps(resultId: number | null): SendFaceElement {
    // 实际测试并不能控制结果
    if (isNull(resultId)) resultId = Math.floor(Math.random() * 3) + 1
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

  static ark(data: string): SendArkElement {
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
