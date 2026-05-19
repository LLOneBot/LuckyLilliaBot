import {
  ElementType,
  IMAGE_HTTP_HOST,
  IMAGE_HTTP_HOST_NT,
} from '../types'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { RkeyManager } from '@/ntqqapi/helper/rkey'
import { calculateSha1StreamBytes, getFileType, getMd5HexFromFile } from '@/common/utils/file'
import { copyFile } from 'node:fs/promises'
import { Service, Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { FlashFileListItem, FlashFileSetInfo } from '@/ntqqapi/types/flashfile'
import { HighwayHttpSession } from '../helper/highway'
import { Media } from '../proto'

declare module 'cordis' {
  interface Context {
    ntFileApi: NTQQFileApi
  }
}

export class NTQQFileApi extends Service {
  static inject = ['logger', 'qqProtocol']

  rkeyManager: RkeyManager

  constructor(protected ctx: Context) {
    super(ctx, 'ntFileApi')
    this.rkeyManager = new RkeyManager(ctx, 'https://llob.linyuchen.net/rkey')
  }

  async getVideoUrl(fileUuid: string, isGroup: boolean) {
    if (isGroup) {
      const { download } = await this.ctx.qqProtocol.getGroupVideoUrl(fileUuid)
      return `https://${download!.info.domain}${download!.info.urlPath}${download!.rKeyParam}`
    } else {
      const { download } = await this.ctx.qqProtocol.getPrivateVideoUrl(fileUuid)
      return `https://${download!.info.domain}${download!.info.urlPath}${download!.rKeyParam}`
    }
  }

  async getPttUrl(fileUuid: string, isGroup: boolean) {
    if (isGroup) {
      const { download } = await this.ctx.qqProtocol.getGroupPttUrl(fileUuid)
      return `https://${download!.info.domain}${download!.info.urlPath}${download!.rKeyParam}`
    } else {
      const { download } = await this.ctx.qqProtocol.getPrivatePttUrl(fileUuid)
      return `https://${download!.info.domain}${download!.info.urlPath}${download!.rKeyParam}`
    }
  }

  async getRichMediaFilePath(_md5HexStr: string, fileName: string, _elementType: ElementType, _elementSubType = 0) {
    // 直连模式：在系统临时目录下创建路径
    const os = await import('node:os')
    const fs = await import('node:fs/promises')
    const dir = path.join(os.tmpdir(), 'lucky-lillia-media')
    await fs.mkdir(dir, { recursive: true })
    return path.join(dir, fileName)
  }

  /** 上传文件到 QQ 的文件夹 */
  async uploadFile(filePath: string, elementType = ElementType.Pic, elementSubType = 0) {
    const fileMd5 = await getMd5HexFromFile(filePath)
    let fileName = path.basename(filePath)
    if (!fileName.includes('.')) {
      const ext = (await getFileType(filePath))?.ext
      fileName += ext ? '.' + ext : ''
    }
    const mediaPath = await this.getRichMediaFilePath(fileMd5, fileName, elementType, elementSubType)
    await copyFile(filePath, mediaPath)
    return {
      md5: fileMd5,
      fileName,
      path: mediaPath,
    }
  }

  async getImageUrl(originImageUrl: string, md5HexStr: string) {
    const url = originImageUrl

    if (url) {
      const parsedUrl = new URL(IMAGE_HTTP_HOST + url)
      const imageAppid = parsedUrl.searchParams.get('appid')
      const isNTPic = imageAppid && ['1406', '1407'].includes(imageAppid)
      if (isNTPic) {
        let rkey = parsedUrl.searchParams.get('rkey')
        if (rkey) {
          return IMAGE_HTTP_HOST_NT + url
        }
        const rkeyData = await this.rkeyManager.getRkey()
        rkey = imageAppid === '1406' ? rkeyData.private_rkey : rkeyData.group_rkey
        return IMAGE_HTTP_HOST_NT + url + rkey
      } else if (url.startsWith('/offpic_new/')) {
        return `${IMAGE_HTTP_HOST}/gchatpic_new/0/0-0-${md5HexStr.toUpperCase()}/0`
      } else {
        return IMAGE_HTTP_HOST + url
      }
    } else {
      return `${IMAGE_HTTP_HOST}/gchatpic_new/0/0-0-${md5HexStr.toUpperCase()}/0`
    }
  }

  async ocrImage(imageUrl: string) {
    const res = await this.ctx.qqProtocol.imageOcr(imageUrl)
    if (res.retCode) {
      throw new Error(res.wording)
    }
    return res.ocrRspBody
  }

  async uploadFlashFile(_title: string, _filePaths: string[]): Promise<any> {
    throw new Error('uploadFlashFile 暂未实现 (直连模式)')
  }

  async downloadFlashFile(_fileSetId: string, _sceneType: number = 1): Promise<any> {
    throw new Error('downloadFlashFile 暂未实现 (直连模式)')
  }

  flashFileListCache = new Map<string, FlashFileListItem[]>()

  async getFlashFileList(_fileSetId: string, _force = true): Promise<FlashFileListItem[]> {
    throw new Error('getFlashFileList 暂未实现 (直连模式)')
  }

  async getFlashFileSetIdByCode(_code: string): Promise<any> {
    throw new Error('getFlashFileSetIdByCode 暂未实现 (直连模式)')
  }

  flashFileInfoCache = new Map<string, FlashFileSetInfo>()

  async getFlashFileInfo(_fileSetId: string, _force = true): Promise<FlashFileSetInfo> {
    throw new Error('getFlashFileInfo 暂未实现 (直连模式)')
  }

  async reshareFlashFile(_fileSetId: string): Promise<any> {
    throw new Error('reshareFlashFile 暂未实现 (直连模式)')
  }

  async uploadGroupVideo(groupCode: string, filePath: string, thumbPath: string, duration: number = 0, width: number = 0, height: number = 0) {
    const result = await this.ctx.qqProtocol.getGroupVideoUploadInfo(groupCode, filePath, thumbPath, duration, width, height)
    if (process.env.DEBUG_VIDEO_UPLOAD) {
      const idxMain = result.ext?.msgInfoBody?.[0]?.index
      const idxThumb = result.subExt?.msgInfoBody?.[1]?.index
      console.log(`[uploadGroupVideo] main fileUuid=${idxMain?.fileUuid?.slice(0, 60)}... mainUKey=${result.ext?.uKey ? 'set' : 'EMPTY'}`)
      console.log(`[uploadGroupVideo] thumb fileUuid=${idxThumb?.fileUuid?.slice(0, 60)}... thumbUKey=${result.subExt?.uKey ? 'set' : 'EMPTY'}`)
    }
    const highwaySession = await this.ctx.qqProtocol.getHighwaySession()
    const maxBlockSize = 1024 * 1024
    if (result.ext.uKey) {
      const { index } = result.ext.msgInfoBody[0]
      result.ext.hash.fileSha1 = await calculateSha1StreamBytes(filePath)
      const trans = {
        uin: selfInfo.uin,
        cmd: 1005,  // group video main
        readable: createReadStream(filePath, { highWaterMark: maxBlockSize }),
        sum: Buffer.from(index.info.md5HexStr, 'hex'),
        size: index.info.fileSize,
        ticket: highwaySession.sigSession,
        ext: Media.NTV2RichMediaHighwayExt.encode(result.ext),
        server: highwaySession.highwayHostAndPorts[1][0].host,
        port: highwaySession.highwayHostAndPorts[1][0].port
      }
      await new HighwayHttpSession(trans).upload()
    }
    if (result.subExt.uKey) {
      const { index } = result.subExt.msgInfoBody[1]
      result.subExt.hash.fileSha1 = await calculateSha1StreamBytes(thumbPath)
      const trans = {
        uin: selfInfo.uin,
        cmd: 1006,  // group video thumb
        readable: createReadStream(thumbPath, { highWaterMark: maxBlockSize }),
        sum: Buffer.from(index.info.md5HexStr, 'hex'),
        size: index.info.fileSize,
        ticket: highwaySession.sigSession,
        ext: Media.NTV2RichMediaHighwayExt.encode(result.subExt),
        server: highwaySession.highwayHostAndPorts[1][0].host,
        port: highwaySession.highwayHostAndPorts[1][0].port
      }
      await new HighwayHttpSession(trans).upload()
    }
    return {
      msgInfo: result.info,
      compat: result.compat
    }
  }

  async uploadC2CVideo(peerUid: string, filePath: string, thumbPath: string, duration: number = 0, width: number = 0, height: number = 0) {
    const result = await this.ctx.qqProtocol.getC2CVideoUploadInfo(peerUid, filePath, thumbPath, duration, width, height)
    const highwaySession = await this.ctx.qqProtocol.getHighwaySession()
    const maxBlockSize = 1024 * 1024
    if (result.ext.uKey) {
      const { index } = result.ext.msgInfoBody[0]
      result.ext.hash.fileSha1 = await calculateSha1StreamBytes(filePath)
      const trans = {
        uin: selfInfo.uin,
        cmd: 1001,  // c2c video main
        readable: createReadStream(filePath, { highWaterMark: maxBlockSize }),
        sum: Buffer.from(index.info.md5HexStr, 'hex'),
        size: index.info.fileSize,
        ticket: highwaySession.sigSession,
        ext: Media.NTV2RichMediaHighwayExt.encode(result.ext),
        server: highwaySession.highwayHostAndPorts[1][0].host,
        port: highwaySession.highwayHostAndPorts[1][0].port
      }
      await new HighwayHttpSession(trans).upload()
    }
    if (result.subExt.uKey) {
      const { index } = result.subExt.msgInfoBody[1]
      result.subExt.hash.fileSha1 = await calculateSha1StreamBytes(thumbPath)
      const trans = {
        uin: selfInfo.uin,
        cmd: 1002,  // c2c video thumb
        readable: createReadStream(thumbPath, { highWaterMark: maxBlockSize }),
        sum: Buffer.from(index.info.md5HexStr, 'hex'),
        size: index.info.fileSize,
        ticket: highwaySession.sigSession,
        ext: Media.NTV2RichMediaHighwayExt.encode(result.subExt),
        server: highwaySession.highwayHostAndPorts[1][0].host,
        port: highwaySession.highwayHostAndPorts[1][0].port
      }
      await new HighwayHttpSession(trans).upload()
    }
    return {
      msgInfo: result.info,
      compat: result.compat
    }
  }

  async uploadGroupFile(groupCode: string, filePath: string, fileName: string, parentFolderId = '/') {
    const result = await this.ctx.qqProtocol.getGroupFileUploadInfo(groupCode, filePath, fileName, parentFolderId)
    if (!result.fileExist) {
      const highwaySession = await this.ctx.qqProtocol.getHighwaySession()
      const ext = Media.FileUploadExt.encode({
        unknown1: 100,
        unknown2: 1,
        entry: {
          busiBuff: {
            senderUin: +selfInfo.uin,
            receiverUin: +groupCode,
            groupCode: +groupCode
          },
          fileEntry: {
            fileSize: result.fileSize,
            md5: result.md5,
            checkKey: result.checkKey,
            fileId: result.fileId,
            uploadKey: result.fileKey
          },
          clientInfo: {
            clientType: 3,
            appId: '100',
            terminalType: 3,
            clientVer: '1.1.1',
            unknown: 4
          },
          fileNameInfo: {
            fileName
          },
          host: {
            hosts: [{
              url: {
                unknown: 1,
                host: result.addr.ip
              },
              port: result.addr.port
            }]
          }
        }
      })
      const maxBlockSize = 1024 * 1024
      const trans = {
        uin: selfInfo.uin,
        cmd: 71,
        readable: createReadStream(filePath, { highWaterMark: maxBlockSize }),
        sum: result.md5,
        size: result.fileSize,
        ticket: highwaySession.sigSession,
        ext,
        server: highwaySession.highwayHostAndPorts[1][0].host,
        port: highwaySession.highwayHostAndPorts[1][0].port
      }
      await new HighwayHttpSession(trans).upload()
    }
    return {
      fileId: result.fileId,
      fileMd5: result.md5.toString('hex')
    }
  }

  async uploadC2CFile(peerUid: string, filePath: string, fileName: string) {
    const result = await this.ctx.qqProtocol.getC2CFileUploadInfo(peerUid, filePath, fileName)
    const highwaySession = await this.ctx.qqProtocol.getHighwaySession()
    const ext = Media.FileUploadExt.encode({
      unknown1: 100,
      unknown2: 1,
      entry: {
        busiBuff: {
          senderUin: +selfInfo.uin
        },
        fileEntry: {
          fileSize: result.fileSize,
          md5: result.md5CheckSum,
          checkKey: result.sha1CheckSum,
          md510M: result.md510MCheckSum,
          sha3: result.sha3CheckSum,
          fileId: result.fileId,
          uploadKey: result.uploadKey
        },
        clientInfo: {
          clientType: 3,
          appId: '100',
          terminalType: 3,
          clientVer: '1.1.1',
          unknown: 4
        },
        fileNameInfo: {
          fileName
        },
        host: {
          hosts: result.rtpMediaPlatformUploadAddress.map(([ip, port]) => ({
            url: {
              unknown: 1,
              host: ip
            },
            port
          }))
        }
      },
      unknown200: 1,
    })
    const maxBlockSize = 1024 * 1024
    const trans = {
      uin: selfInfo.uin,
      cmd: 95,
      readable: createReadStream(filePath, { highWaterMark: maxBlockSize }),
      sum: result.md5CheckSum,
      size: result.fileSize,
      ticket: highwaySession.sigSession,
      ext,
      server: highwaySession.highwayHostAndPorts[1][0].host,
      port: highwaySession.highwayHostAndPorts[1][0].port
    }
    await new HighwayHttpSession(trans).upload()
    return {
      fileId: result.fileId,
      file10MMd5: result.md510MCheckSum,
      crcMedia: result.crcMedia
    }
  }

  async uploadGroupImage(groupCode: string, filePath: string) {
    const result = await this.ctx.qqProtocol.getGroupImageUploadInfo(groupCode, filePath)
    const highwaySession = await this.ctx.qqProtocol.getHighwaySession()
    const maxBlockSize = 1024 * 1024
    if (result.ext.uKey) {
      const { index } = result.ext.msgInfoBody[0]
      const trans = {
        uin: selfInfo.uin,
        cmd: 1004,
        readable: createReadStream(filePath, { highWaterMark: maxBlockSize }),
        sum: Buffer.from(index.info.md5HexStr, 'hex'),
        size: index.info.fileSize,
        ticket: highwaySession.sigSession,
        ext: Media.NTV2RichMediaHighwayExt.encode(result.ext),
        server: highwaySession.highwayHostAndPorts[1][0].host,
        port: highwaySession.highwayHostAndPorts[1][0].port
      }
      await new HighwayHttpSession(trans).upload()
    }
    return {
      msgInfo: result.info,
      compat: result.compat
    }
  }

  async uploadC2CImage(peerUid: string, filePath: string) {
    const result = await this.ctx.qqProtocol.getC2CImageUploadInfo(peerUid, filePath)
    const highwaySession = await this.ctx.qqProtocol.getHighwaySession()
    const maxBlockSize = 1024 * 1024
    if (result.ext.uKey) {
      const { index } = result.ext.msgInfoBody[0]
      const trans = {
        uin: selfInfo.uin,
        cmd: 1003,
        readable: createReadStream(filePath, { highWaterMark: maxBlockSize }),
        sum: Buffer.from(index.info.md5HexStr, 'hex'),
        size: index.info.fileSize,
        ticket: highwaySession.sigSession,
        ext: Media.NTV2RichMediaHighwayExt.encode(result.ext),
        server: highwaySession.highwayHostAndPorts[1][0].host,
        port: highwaySession.highwayHostAndPorts[1][0].port
      }
      await new HighwayHttpSession(trans).upload()
    }
    return {
      msgInfo: result.info,
      compat: result.compat
    }
  }

  async uploadGroupPtt(groupCode: string, filePath: string, duration: number) {
    const result = await this.ctx.qqProtocol.getGroupPttUploadInfo(groupCode, filePath, duration)
    const highwaySession = await this.ctx.qqProtocol.getHighwaySession()
    const maxBlockSize = 1024 * 1024
    if (result.ext.uKey) {
      const { index } = result.ext.msgInfoBody[0]
      const trans = {
        uin: selfInfo.uin,
        cmd: 1008,
        readable: createReadStream(filePath, { highWaterMark: maxBlockSize }),
        sum: Buffer.from(index.info.md5HexStr, 'hex'),
        size: index.info.fileSize,
        ticket: highwaySession.sigSession,
        ext: Media.NTV2RichMediaHighwayExt.encode(result.ext),
        server: highwaySession.highwayHostAndPorts[1][0].host,
        port: highwaySession.highwayHostAndPorts[1][0].port
      }
      await new HighwayHttpSession(trans).upload()
    }
    return { msgInfo: result.info, compat: result.compat }
  }

  async uploadC2CPtt(peerUid: string, filePath: string, duration: number) {
    const result = await this.ctx.qqProtocol.getC2CPttUploadInfo(peerUid, filePath, duration)
    const highwaySession = await this.ctx.qqProtocol.getHighwaySession()
    const maxBlockSize = 1024 * 1024
    if (result.ext.uKey) {
      const { index } = result.ext.msgInfoBody[0]
      const trans = {
        uin: selfInfo.uin,
        cmd: 1007,
        readable: createReadStream(filePath, { highWaterMark: maxBlockSize }),
        sum: Buffer.from(index.info.md5HexStr, 'hex'),
        size: index.info.fileSize,
        ticket: highwaySession.sigSession,
        ext: Media.NTV2RichMediaHighwayExt.encode(result.ext),
        server: highwaySession.highwayHostAndPorts[1][0].host,
        port: highwaySession.highwayHostAndPorts[1][0].port
      }
      await new HighwayHttpSession(trans).upload()
    }
    return { msgInfo: result.info, compat: result.compat }
  }
}
