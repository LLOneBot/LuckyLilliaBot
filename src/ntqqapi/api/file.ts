import { NTMethod } from '../ntcall'
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
import { HighwayHttpSession, HighwayTcpSession } from '../helper/highway'
import { Media } from '../proto'

declare module 'cordis' {
  interface Context {
    ntFileApi: NTQQFileApi
  }
}

export class NTQQFileApi extends Service {
  static inject = ['logger', 'pmhq']

  rkeyManager: RkeyManager

  constructor(protected ctx: Context) {
    super(ctx, 'ntFileApi')
    this.rkeyManager = new RkeyManager(ctx, 'https://llob.linyuchen.net/rkey')
  }

  async getVideoUrl(fileUuid: string, isGroup: boolean) {
    if (isGroup) {
      const { download } = await this.ctx.pmhq.getGroupVideoUrl(fileUuid)
      return `https://${download!.info.domain}${download!.info.urlPath}${download!.rKeyParam}`
    } else {
      const { download } = await this.ctx.pmhq.getPrivateVideoUrl(fileUuid)
      return `https://${download!.info.domain}${download!.info.urlPath}${download!.rKeyParam}`
    }
  }

  async getPttUrl(fileUuid: string, isGroup: boolean) {
    if (isGroup) {
      const { download } = await this.ctx.pmhq.getGroupPttUrl(fileUuid)
      return `https://${download!.info.domain}${download!.info.urlPath}${download!.rKeyParam}`
    } else {
      const { download } = await this.ctx.pmhq.getPrivatePttUrl(fileUuid)
      return `https://${download!.info.domain}${download!.info.urlPath}${download!.rKeyParam}`
    }
  }

  async getRichMediaFilePath(md5HexStr: string, fileName: string, elementType: ElementType, elementSubType = 0) {
    return await this.ctx.pmhq.invoke(NTMethod.MEDIA_FILE_PATH, [
      {
        md5HexStr,
        fileName,
        elementType,
        elementSubType,
        thumbSize: 0,
        needCreate: true,
        downloadType: 1,
        file_uuid: '',
      },
    ])
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
    const url = originImageUrl  // 没有域名

    if (url) {
      const parsedUrl = new URL(IMAGE_HTTP_HOST + url) //临时解析拼接
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
        // 老的图片url，不需要rkey
        return IMAGE_HTTP_HOST + url
      }
    } else {
      // 没有url，需要自己拼接
      return `${IMAGE_HTTP_HOST}/gchatpic_new/0/0-0-${md5HexStr.toUpperCase()}/0`
    }
  }

  async ocrImage(imageUrl: string) {
    const res = await this.ctx.pmhq.imageOcr(imageUrl)
    if (res.retCode) {
      throw new Error(res.wording)
    }
    return res.ocrRspBody
  }

  async uploadFlashFile(title: string, filePaths: string[]) {
    return await this.ctx.pmhq.invoke('nodeIKernelFlashTransferService/createFlashTransferUploadTask',
      [
        new Date().getTime(),
        {
          'scene': 1,
          'name': title,
          'uploaders': [
            {
              'uin': selfInfo.uin,
              'nickname': selfInfo.nick,
              'uid': selfInfo.uid,
              'sendEntrance': '',
            },
          ],
          'permission': {},
          'coverPath': '',
          'paths': filePaths,
          'excludePaths': [],
          'expireLeftTime': 0,
          'isNeedDelExif': true,
          'coverOriginalInfos': [
            {
              'path': '',
              'thumbnailPath': '',
            },
          ],
          'uploadSceneType': 1,
        },
      ],
    )
  }

  async downloadFlashFile(fileSetId: string, sceneType: number = 1) {
    return await this.ctx.pmhq.invoke('nodeIKernelFlashTransferService/startFileSetDownload',
      [
        fileSetId,
        sceneType,
        { isIncludeCompressInnerFiles: false },
      ],
    )
  }

  flashFileListCache = new Map<string, FlashFileListItem[]>()

  async getFlashFileList(fileSetId: string, force = true) {
    if (!force) {
      const cachedList = this.flashFileListCache.get(fileSetId)
      if (cachedList) {
        return cachedList
      }
    }
    const res = await this.ctx.pmhq.invoke('nodeIKernelFlashTransferService/getFileList',
      [
        {
          seq: 0,
          fileSetId,
          isUseCache: false,
          sceneType: 1,
          reqInfos: [
            {
              count: 18,
              paginationInfo: new Uint8Array(),
              parentId: '',
              reqIndexPath: '',
              reqDepth: 1,
              filterCondition: {
                fileCategory: 0,
                filterType: 0
              },
              sortConditions: [
                {
                  sortField: 0,
                  sortOrder: 0
                }
              ],
              isNeedPhysicalInfoReady: false
            }
          ]
        },
      ],
    )
    if (res.rsp.result !== 0) {
      throw new Error(`获取闪传文件列表失败: ${res.rsp.errMs}`)
    }
    if (this.flashFileListCache.size > 100) {
      const oldestKey = this.flashFileListCache.keys().next().value!
      this.flashFileListCache.delete(oldestKey)
    }
    this.flashFileListCache.set(fileSetId, res.rsp.fileLists)
    return res.rsp.fileLists
  }

  async getFlashFileSetIdByCode(code: string) {
    // code 是 qfile.qq.com/q/ 后面的部分
    return await this.ctx.pmhq.invoke('nodeIKernelFlashTransferService/getFileSetIdByCode',
      [code],
    )
  }

  flashFileInfoCache = new Map<string, FlashFileSetInfo>()

  async getFlashFileInfo(fileSetId: string, force = true) {
    if (!force) {
      const cachedInfo = this.flashFileInfoCache.get(fileSetId)
      if (cachedInfo) {
        return cachedInfo
      }
    }
    const res = await this.ctx.pmhq.invoke('nodeIKernelFlashTransferService/getFileSet',
      [
        { seq: 0, fileSetId, isUseCache: false, isNoReqSvr: false, sceneType: 1 },
      ])
    if (res.result !== 0) {
      throw new Error(`获取闪传文件信息失败: ${res.errMsg}`)
    }
    if (this.flashFileInfoCache.size > 100) {
      const oldestKey = this.flashFileInfoCache.keys().next().value!
      this.flashFileInfoCache.delete(oldestKey)
    }
    this.flashFileInfoCache.set(fileSetId, res.fileSet)
    return res.fileSet
  }

  async reshareFlashFile(fileSetId: string) {
    const shareFiles = (await this.getFlashFileList(fileSetId)).flatMap(f => f.fileList)
    const fileNames = shareFiles.map(f => f.name)
    return await this.ctx.pmhq.invoke('nodeIKernelFlashTransferService/createMergeShareTask', [
      new Date().getTime(),
      {
        fileSetId,
        shareFiles,
        createSetParam: {
          scene: 1,
          name: fileNames.join(','),
          uploaders: [{
            uin: selfInfo.uin,
            uid: selfInfo.uid,
            nickname: selfInfo.nick,
            sendEntrance: ''
          }],
          permission: {},
          coverPath: '',
          paths: shareFiles.map(f => f.saveFilePath || ''),
          excludePaths: [],
          uploadSceneType: 1,
          expireLeftTime: 0,
          isNeedDelDeviceInfo: false,
          isNeedDelLocation: false,
          coverOriginalInfos: []
        }
      }
    ])
  }

  async uploadGroupVideo(groupCode: string, filePath: string, thumbPath: string) {
    const result = await this.ctx.pmhq.getGroupVideoUploadInfo(groupCode, filePath, thumbPath)
    const highwaySession = await this.ctx.pmhq.getHighwaySession()
    const maxBlockSize = 1024 * 1024
    if (result.ext.uKey) {
      const { index } = result.ext.msgInfoBody[0]
      result.ext.hash.fileSha1 = await calculateSha1StreamBytes(filePath)
      const trans = {
        uin: selfInfo.uin,
        cmd: 1005,
        readable: createReadStream(filePath, { highWaterMark: maxBlockSize }),
        sum: Buffer.from(index.info.md5HexStr, 'hex'),
        size: index.info.fileSize,
        ticket: highwaySession.sigSession,
        ext: Media.NTV2RichMediaHighwayExt.encode(result.ext),
        server: highwaySession.highwayHostAndPorts[1][0].host,
        port: highwaySession.highwayHostAndPorts[1][0].port
      }
      try {
        await new HighwayTcpSession(trans).upload()
      } catch {
        await new HighwayHttpSession(trans).upload()
      }
    }
    if (result.subExt.uKey) {
      const { index } = result.subExt.msgInfoBody[1]
      result.subExt.hash.fileSha1 = await calculateSha1StreamBytes(thumbPath)
      const trans = {
        uin: selfInfo.uin,
        cmd: 1006,
        readable: createReadStream(thumbPath, { highWaterMark: maxBlockSize }),
        sum: Buffer.from(index.info.md5HexStr, 'hex'),
        size: index.info.fileSize,
        ticket: highwaySession.sigSession,
        ext: Media.NTV2RichMediaHighwayExt.encode(result.subExt),
        server: highwaySession.highwayHostAndPorts[1][0].host,
        port: highwaySession.highwayHostAndPorts[1][0].port
      }
      try {
        await new HighwayTcpSession(trans).upload()
      } catch {
        await new HighwayHttpSession(trans).upload()
      }
    }
    return {
      msgInfo: result.info,
      compat: result.compat
    }
  }

  async uploadC2CVideo(peerUid: string, filePath: string, thumbPath: string) {
    const result = await this.ctx.pmhq.getC2CVideoUploadInfo(peerUid, filePath, thumbPath)
    const highwaySession = await this.ctx.pmhq.getHighwaySession()
    const maxBlockSize = 1024 * 1024
    if (result.ext.uKey) {
      const { index } = result.ext.msgInfoBody[0]
      result.ext.hash.fileSha1 = await calculateSha1StreamBytes(filePath)
      const trans = {
        uin: selfInfo.uin,
        cmd: 1001,
        readable: createReadStream(filePath, { highWaterMark: maxBlockSize }),
        sum: Buffer.from(index.info.md5HexStr, 'hex'),
        size: index.info.fileSize,
        ticket: highwaySession.sigSession,
        ext: Media.NTV2RichMediaHighwayExt.encode(result.ext),
        server: highwaySession.highwayHostAndPorts[1][0].host,
        port: highwaySession.highwayHostAndPorts[1][0].port
      }
      try {
        await new HighwayTcpSession(trans).upload()
      } catch {
        await new HighwayHttpSession(trans).upload()
      }
    }
    if (result.subExt.uKey) {
      const { index } = result.subExt.msgInfoBody[1]
      result.subExt.hash.fileSha1 = await calculateSha1StreamBytes(thumbPath)
      const trans = {
        uin: selfInfo.uin,
        cmd: 1002,
        readable: createReadStream(thumbPath, { highWaterMark: maxBlockSize }),
        sum: Buffer.from(index.info.md5HexStr, 'hex'),
        size: index.info.fileSize,
        ticket: highwaySession.sigSession,
        ext: Media.NTV2RichMediaHighwayExt.encode(result.subExt),
        server: highwaySession.highwayHostAndPorts[1][0].host,
        port: highwaySession.highwayHostAndPorts[1][0].port
      }
      try {
        await new HighwayTcpSession(trans).upload()
      } catch {
        await new HighwayHttpSession(trans).upload()
      }
    }
    return {
      msgInfo: result.info,
      compat: result.compat
    }
  }

  async uploadGroupFile(groupCode: string, filePath: string, fileName: string, parentFolderId = '/') {
    const result = await this.ctx.pmhq.getGroupFileUploadInfo(groupCode, filePath, fileName, parentFolderId)
    if (!result.fileExist) {
      const highwaySession = await this.ctx.pmhq.getHighwaySession()
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
      try {
        await new HighwayTcpSession(trans).upload()
      } catch {
        await new HighwayHttpSession(trans).upload()
      }
    }
    return {
      fileId: result.fileId,
      fileMd5: result.md5.toString('hex')
    }
  }

  async uploadC2CFile(peerUid: string, filePath: string, fileName: string) {
    const result = await this.ctx.pmhq.getC2CFileUploadInfo(peerUid, filePath, fileName)
    const highwaySession = await this.ctx.pmhq.getHighwaySession()
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
    try {
      await new HighwayTcpSession(trans).upload()
    } catch {
      await new HighwayHttpSession(trans).upload()
    }
    return {
      fileId: result.fileId,
      file10MMd5: result.md510MCheckSum,
      crcMedia: result.crcMedia
    }
  }

  async uploadGroupImage(groupCode: string, filePath: string) {
    const result = await this.ctx.pmhq.getGroupImageUploadInfo(groupCode, filePath)
    const highwaySession = await this.ctx.pmhq.getHighwaySession()
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
      try {
        await new HighwayTcpSession(trans).upload()
      } catch {
        await new HighwayHttpSession(trans).upload()
      }
    }
    return {
      msgInfo: result.info,
      compat: result.compat
    }
  }

  async uploadC2CImage(peerUid: string, filePath: string) {
    const result = await this.ctx.pmhq.getC2CImageUploadInfo(peerUid, filePath)
    const highwaySession = await this.ctx.pmhq.getHighwaySession()
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
      try {
        await new HighwayTcpSession(trans).upload()
      } catch {
        await new HighwayHttpSession(trans).upload()
      }
    }
    return {
      msgInfo: result.info,
      compat: result.compat
    }
  }
}
