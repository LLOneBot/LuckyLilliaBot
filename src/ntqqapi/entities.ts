import faceConfig from './helper/face_config.json'
import pathLib from 'node:path'
import {
  AtType,
  ElementType,
  FaceIndex,
  SendArkElement,
  SendFaceElement,
  SendMarketFaceElement,
  SendPicElement,
  SendPttElement,
  SendReplyElement,
  SendTextElement,
  SendVideoElement,
} from './types'
import { stat, copyFile, unlink, mkdir } from 'node:fs/promises'
import { getImageSize, getMd5HexFromFile } from '../common/utils/file'
import { createThumb, getVideoInfo } from '../common/utils/video'
import { encodeSilk } from '../common/utils/audio'
import { Context } from 'cordis'
import { isNullable, noop } from 'cosmokit'
import { TEMP_DIR } from '@/common/globalVars'

export namespace SendElement {
  export function text(content: string): SendTextElement {
    return {
      elementType: ElementType.Text,
      textElement: {
        content,
        atType: AtType.Unknown,
        atUin: 0
      },
    }
  }

  export function at(atUin: number, atType: AtType, display: string): SendTextElement {
    return {
      elementType: ElementType.Text,
      textElement: {
        content: display,
        atType,
        atUin
      },
    }
  }

  export function reply(msgSeq: number, senderUin: number, msgTime: number): SendReplyElement {
    return {
      elementType: ElementType.Reply,
      replyElement: {
        replyMsgSeq: msgSeq,
        senderUin,
        replyMsgTime: msgTime,
      },
    }
  }

  export async function pic(ctx: Context, picPath: string, summary = '', subType = 0): Promise<SendPicElement> {
    const fileSize = (await stat(picPath)).size
    if (fileSize === 0) {
      throw new Error(`文件异常，大小为 0: ${picPath}`)
    }
    const size = await getImageSize(picPath)
    return {
      elementType: ElementType.Pic,
      picElement: {
        picWidth: size.width,
        picHeight: size.height,
        sourcePath: picPath,
        picSubType: subType,
        summary,
      },
    }
  }

  export async function video(ctx: Context, filePath: string, diyThumbPath?: string): Promise<SendVideoElement> {
    const fileSize = (await stat(filePath)).size
    if (fileSize === 0) {
      throw new Error(`文件异常，大小为 0: ${filePath}`)
    }
    const maxMB = 1024
    if (fileSize > 1024 * 1024 * maxMB) {
      throw new Error(`视频过大，最大支持${maxMB}MB，当前文件大小${fileSize}B`)
    }
    let videoInfo = {
      width: 1920,
      height: 1080,
      time: 15,
      format: 'mp4',
      size: fileSize,
      filePath,
    }
    try {
      videoInfo = await getVideoInfo(filePath)
      ctx.logger.info('视频信息', videoInfo)
    } catch (e) {
      ctx.logger.info('获取视频信息失败', e)
    }
    const md5 = await getMd5HexFromFile(filePath)
    const thumbDir = TEMP_DIR
    const thumbFilePath = pathLib.join(thumbDir, `${md5}_0.png`)
    await mkdir(thumbDir, { recursive: true })
    if (diyThumbPath) {
      await copyFile(diyThumbPath, thumbFilePath)
    } else {
      const path = await createThumb(ctx, videoInfo.filePath)
      await copyFile(path, thumbFilePath)
      unlink(path).catch(noop)
    }
    const element: SendVideoElement = {
      elementType: ElementType.Video,
      videoElement: {
        filePath,
        fileTime: Math.trunc(videoInfo.time),
        thumbPath: thumbFilePath,
        thumbWidth: videoInfo.width,
        thumbHeight: videoInfo.height,
      },
    }
    ctx.logger.info('videoElement', element)
    return element
  }

  export async function ptt(ctx: Context, pttPath: string): Promise<SendPttElement> {
    const { converted, path: silkPath, duration } = await encodeSilk(ctx, pttPath)
    const fileSize = (await stat(silkPath)).size
    if (fileSize === 0) {
      throw new Error(`文件异常，大小为 0: ${silkPath}`)
    }
    return {
      elementType: ElementType.Ptt,
      pttElement: {
        filePath: silkPath,
        duration: duration,
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
      } else if (faceId < 100000) {
        faceType = 2
      }
      else {
        faceType = 4
      }
      if (face?.AniStickerType) {
        faceType = 3
      }
    }
    return {
      elementType: ElementType.Face,
      faceElement: {
        faceIndex: faceId,
        faceType,
        faceText: face?.QDes ?? '',
        stickerId: face?.AniStickerId,
        stickerType: face?.AniStickerType,
        packId: face?.AniStickerPackId,
      },
    }
  }

  export function mface(emojiPackageId: number, emojiId: string, key: string, summary?: string): SendMarketFaceElement {
    return {
      elementType: ElementType.MarketFace,
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
      faceElement: {
        faceIndex: FaceIndex.Dice,
        faceType: 3,
        faceText: '[骰子]',
        packId: '1',
        stickerId: '33',
        stickerType: 2,
        resultId: resultId.toString(),
      },
    }
  }

  // 猜拳(石头剪刀布)表情
  export function rps(resultId?: string | number): SendFaceElement {
    // 实际测试并不能控制结果
    if (isNullable(resultId)) resultId = Math.floor(Math.random() * 3) + 1
    return {
      elementType: ElementType.Face,
      faceElement: {
        faceIndex: FaceIndex.RPS,
        faceText: '[包剪锤]',
        faceType: 3,
        packId: '1',
        stickerId: '34',
        stickerType: 2,
        resultId: resultId.toString(),
      },
    }
  }

  export function ark(data: string): SendArkElement {
    return {
      elementType: ElementType.Ark,
      arkElement: {
        bytesData: data,
      },
    }
  }

  export function shake(): SendFaceElement {
    return {
      elementType: ElementType.Face,
      faceElement: {
        faceIndex: 1,
        faceType: 5,
        faceText: '',
        pokeType: 1,
      },
    }
  }
}
