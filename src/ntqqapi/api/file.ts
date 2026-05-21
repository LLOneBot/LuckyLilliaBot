import {
  ElementType,
  IMAGE_HTTP_HOST,
  IMAGE_HTTP_HOST_NT,
} from '../types'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { RkeyManager } from '@/ntqqapi/helper/rkey'
import { calculateSha1StreamBytes, getFileType, getMd5HexFromFile, getSha1HexFromFile } from '@/common/utils/file'
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

  async uploadFlashFile(title: string, filePaths: string[]): Promise<any> {
    if (filePaths.length === 0) throw new Error('uploadFlashFile: filePaths empty')
    const fs = await import('node:fs/promises')
    const pathMod = await import('node:path')
    const cryptoMod = await import('node:crypto')
    type FileMeta = { path: string, name: string, size: number, sha1: string, fileUuid: string }
    const files: FileMeta[] = []
    let totalSize = 0
    for (const p of filePaths) {
      const stat = await fs.stat(p)
      const sha1 = await getSha1HexFromFile(p)
      files.push({ path: p, name: pathMod.basename(p), size: stat.size, sha1, fileUuid: cryptoMod.randomUUID() })
      totalSize += stat.size
    }
    // 1. 创建 fileSet
    const fset = await this.ctx.qqProtocol.createFlashFileSet({
      title,
      totalFileCount: files.length,
      totalFileSize: totalSize,
      uploaderUin: selfInfo.uin,
      uploaderNick: selfInfo.nick || selfInfo.uin,
      uploaderUid: selfInfo.uid,
    })
    const fileSetId = fset.fileSetId
    // 2. 注册每个文件
    for (const f of files) {
      await this.ctx.qqProtocol.registerFlashFile(fileSetId, { fileUuid: f.fileUuid, name: f.name, fileSize: f.size })
    }
    // 3. prep
    await this.ctx.qqProtocol.prepFlashFileSet(fileSetId)
    // 4. preflight + commit per file（仅支持秒传命中场景）
    // 注：LLBot 对图片文件会先做一遍 field103=24 的"图像模式"上传（需要 NT 内部
    // 分配的 md5+ext 文件名），无法可靠复现；这里只做 field103=22 的通用文件模式。
    let reqId = 0
    for (const f of files) {
      const pre = await this.ctx.qqProtocol.flashFileUploadPreflight({
        fileSize: f.size, sha1Hex: f.sha1, name: f.name, requestId: ++reqId, field103: 22,
      })
      if (pre.uKey) {
        throw new Error(`uploadFlashFile: file ${f.name} 不在服务端缓存中（非秒传命中），highway 上传暂未实现`)
      }
      if (!pre.token) {
        throw new Error(`uploadFlashFile: preflight 没有返回 token (file ${f.name})`)
      }
      await this.ctx.qqProtocol.flashFileUploadCommit({
        fileSize: f.size, sha1Hex: f.sha1, name: f.name,
        token: pre.token, time: pre.time, ttl: pre.ttl, requestId: ++reqId, field103: 22,
      })
    }
    // 5. finalize
    await this.ctx.qqProtocol.downloadFlashFile(fileSetId, 6).catch(() => {})
    return {
      result: 0,
      errMsg: '',
      seq: 0,
      createFlashTransferResult: {
        fileSetId,
        shareLink: fset.shareLink,
        expireTime: String(fset.expireTime),
        expireLeftTime: String(fset.expireLeftTime),
      },
    }
  }

  async downloadFlashFile(fileSetId: string, sceneType: number = 6): Promise<{ result: number, errMsg: string }> {
    await this.ctx.qqProtocol.downloadFlashFile(fileSetId, sceneType)
    return { result: 0, errMsg: '' }
  }

  flashFileListCache = new Map<string, FlashFileListItem[]>()

  async getFlashFileList(fileSetId: string, _force = true): Promise<FlashFileListItem[]> {
    const files = await this.ctx.qqProtocol.getFlashFileList(fileSetId)
    return [{
      fileList: files.map((f: any) => ({
        fileSetId: f.fileSetId,
        cliFileId: f.fileUuid,
        fileType: f.field5 ?? 0,
        name: f.name ?? '',
        fileSize: String(f.fileSize ?? 0),
        status: 2,
        uploadStatus: 3,
        downloadStatus: 0,
        filePhysicalSize: String(f.fileSize ?? 0),
        physical: { id: f.fileUuid, status: 2, localPath: '' },
      })),
      isEnd: true,
      isCache: false,
    }]
  }

  async getFlashFileSetIdByCode(code: string): Promise<{ result: number, errMsg: string, fileSetId: string }> {
    const fileSetId = await this.ctx.qqProtocol.getFlashFileSetIdByCode(code)
    return { result: 0, errMsg: '', fileSetId }
  }

  flashFileInfoCache = new Map<string, FlashFileSetInfo>()

  async getFlashFileInfo(fileSetId: string, _force = true): Promise<FlashFileSetInfo> {
    const info = await this.ctx.qqProtocol.getFlashFileInfo(fileSetId)
    if (!info) throw new Error('getFlashFileInfo: empty response')
    return {
      fileSetId: info.fileSetId,
      name: info.title ?? '',
      totalFileCount: '1',
      totalFileSize: String(info.totalSize ?? 0),
      shareInfo: { shareLink: info.shareInfo?.url ?? '', extractionCode: '' },
      uploaders: [],
      uploadInfo: { totalUploadedFileSize: String(info.totalSize ?? 0), successCount: 1, failedCount: 0 },
      expireTime: String(info.expireTime ?? 0),
      expireLeftTime: Math.max(0, (info.expireTime ?? 0) - Math.floor(Date.now() / 1000)),
      status: 2,
      uploadStatus: 4,
      downloadStatus: 0,
    } as FlashFileSetInfo
  }

  async reshareFlashFile(fileSetId: string): Promise<any> {
    const cryptoMod = await import('node:crypto')
    const sourceFiles = await this.ctx.qqProtocol.getFlashFileList(fileSetId)
    if (sourceFiles.length === 0) throw new Error('reshareFlashFile: 源 fileSet 无文件')
    const sourceInfo = await this.ctx.qqProtocol.getFlashFileInfo(fileSetId)
    if (!sourceInfo) throw new Error('reshareFlashFile: 无法获取源 fileSet 信息')
    const totalSize = sourceFiles.reduce((s: number, f: any) => s + (f.fileSize ?? 0), 0)
    // 1. 创建新 fileSet
    const fset = await this.ctx.qqProtocol.createFlashFileSet({
      title: sourceInfo.title ?? '',
      totalFileCount: sourceFiles.length,
      totalFileSize: totalSize,
      uploaderUin: selfInfo.uin,
      uploaderNick: selfInfo.nick || selfInfo.uin,
      uploaderUid: selfInfo.uid,
    })
    const newFileSetId = fset.fileSetId
    // 2. 注册每个文件（用源文件的元信息）+ prep + 秒传 commit
    for (const f of sourceFiles as any[]) {
      await this.ctx.qqProtocol.registerFlashFile(newFileSetId, {
        fileUuid: cryptoMod.randomUUID(),
        name: f.name ?? '',
        fileSize: f.fileSize ?? 0,
      })
    }
    await this.ctx.qqProtocol.prepFlashFileSet(newFileSetId)
    let reqId = 0
    for (const f of sourceFiles as any[]) {
      const sha1Hex = f.download?.sha1 ?? ''
      const pre = await this.ctx.qqProtocol.flashFileUploadPreflight({
        fileSize: f.fileSize ?? 0, sha1Hex, name: f.name ?? '', requestId: ++reqId, field103: 22,
      })
      if (pre.uKey) {
        throw new Error(`reshareFlashFile: 源文件不再在服务端缓存中（非秒传命中），无法重新分享`)
      }
      if (!pre.token) {
        throw new Error(`reshareFlashFile: preflight 没有返回 token (file ${f.name})`)
      }
      await this.ctx.qqProtocol.flashFileUploadCommit({
        fileSize: f.fileSize ?? 0, sha1Hex, name: f.name ?? '',
        token: pre.token, time: pre.time, ttl: pre.ttl, requestId: ++reqId, field103: 22,
      })
    }
    await this.ctx.qqProtocol.downloadFlashFile(newFileSetId, 6).catch(() => {})
    return {
      result: 0,
      errMsg: '',
      createFlashTransferResult: {
        fileSetId: newFileSetId,
        shareLink: fset.shareLink,
        expireTime: String(fset.expireTime),
        expireLeftTime: String(fset.expireLeftTime),
      },
    }
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
    // 上传完成后必须 feed（0x6d9_4），否则文件只在群文件区里、群聊消息里看不到
    const random = Math.floor(Math.random() * 0xffffffff)
    await this.ctx.qqProtocol.feedGroupFile(+groupCode, result.fileId, random)
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
      fileSize: result.fileSize,
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
