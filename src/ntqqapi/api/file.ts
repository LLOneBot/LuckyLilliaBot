import { ChatType, IMAGE_HTTP_HOST, IMAGE_HTTP_HOST_NT } from '../types'
import path from 'node:path'
import { createReadStream, readFileSync } from 'node:fs'
import { RkeyManager } from '@/ntqqapi/helper/rkey'
import { calculateSha1StreamBytes, getSha1HexFromFile, getMd5HexFromFile } from '@/common/utils/file'
import { stat as fsStat } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { Service, Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { FlashFileListItem, FlashFileSetInfo } from '@/ntqqapi/types/flashfile'
import { HighwayHttpSession } from '../helper/highway'
import { Media } from '../proto'

const FLASH_TRANSFER_UPLOAD_URL = 'https://multimedia.qfile.qq.com/sliceupload'
const FLASH_TRANSFER_CHUNK_SIZE = 1024 * 1024
const FLASH_TRANSFER_APP_ID = 14901 // 闪传文件（封面用 14903）

/** 没秒传时分片传到 multimedia.qfile.qq.com/sliceupload, 每片带累计的 sha1 列表 */
async function flashTransferUpload(uKey: string, filePath: string, fileSize: number) {
  const fileBytes = readFileSync(filePath)
  const chunkCount = Math.ceil(fileSize / FLASH_TRANSFER_CHUNK_SIZE)
  // 每个 chunk 结尾处的累计 sha1, 最后一片就是整个文件的 sha1
  const sha1State: Buffer[] = []
  for (let i = 0; i < chunkCount; i++) {
    const accLen = i === chunkCount - 1 ? fileSize : (i + 1) * FLASH_TRANSFER_CHUNK_SIZE
    sha1State.push(createHash('sha1').update(fileBytes.subarray(0, accLen)).digest())
  }

  for (let i = 0; i < chunkCount; i++) {
    const start = i * FLASH_TRANSFER_CHUNK_SIZE
    const end = Math.min(fileSize, start + FLASH_TRANSFER_CHUNK_SIZE)
    const chunk = fileBytes.subarray(start, end)
    const payload = Media.FlashTransferUploadReq.encode({
      fieId1: 0,
      appId: FLASH_TRANSFER_APP_ID,
      fileId3: 2,
      body: {
        fieId1: Buffer.alloc(0),
        uKey,
        start,
        end: end - 1,
        sha1: createHash('sha1').update(chunk).digest(),
        sha1StateV: { state: sha1State },
        body: chunk,
      },
    })
    const resp = await fetch(FLASH_TRANSFER_UPLOAD_URL, {
      method: 'POST',
      headers: { 'Accept': '*/*', 'Connection': 'Keep-Alive' },
      body: Buffer.from(payload),
    })
    const respBytes = Buffer.from(await resp.arrayBuffer())
    const decoded = Media.FlashTransferUploadResp.decode(respBytes)
    if (decoded.status !== 'success') {
      throw new Error(`flashTransfer upload chunk ${i} failed: ${decoded.status}`)
    }
  }
}

declare module 'cordis' {
  interface Context {
    ntFileApi: NTFileApi
  }
}

export class NTFileApi extends Service {
  static inject = ['qqProtocol', 'ntUserApi']

  rkeyManager: RkeyManager

  constructor(protected ctx: Context) {
    super(ctx, 'ntFileApi')
    this.rkeyManager = new RkeyManager(ctx, 'https://llob.linyuchen.net/rkey')
  }

  async getVideoUrl(fileUuid: string, isGroup: boolean) {
    if (isGroup) {
      const { download } = await this.ctx.qqProtocol.getGroupVideoUrl(fileUuid)
      if (!download) return ''
      return `https://${download.info.domain}${download.info.urlPath}${download.rKeyParam}`
    } else {
      const { download } = await this.ctx.qqProtocol.getPrivateVideoUrl(fileUuid)
      if (!download) return ''
      return `https://${download.info.domain}${download.info.urlPath}${download.rKeyParam}`
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

  // 手表老式图只有 md5 和老式 uint32 fileId (存在 picElement.fileUuid), 用 NTV2 下载请求换带 rkey 的 URL。
  // peerUid: 群是 groupCode, 私聊是对方 uid
  private async resolveOldPicUrl(isGroup: boolean, peerUid: string, md5HexStr: string, fileUuid: string): Promise<string> {
    const info = { md5HexStr, fileType: { type: 1, picFormat: 1000 }, original: 1 }
    const resp = isGroup
      ? await this.ctx.qqProtocol.getGroupImageDownloadUrl(peerUid, info, fileUuid)
      : await this.ctx.qqProtocol.getC2CImageDownloadUrl(peerUid, info, fileUuid)
    const d = resp.download
    const urlPath = d?.info?.urlPath ?? ''
    if (!urlPath || /[?&]fileid=(&|$)/.test(urlPath)) {
      throw new Error(`NTV2 下载未解析出有效 fileid (fileUuid=${fileUuid})`)
    }
    const domain = d!.info!.domain || 'multimedia.nt.qq.com.cn'
    const base = domain.startsWith('http') ? domain : `https://${domain}`
    return base + urlPath + (d!.rKeyParam ?? '')
  }

  async getFileUrl(fileUuid: string, isGroup: boolean, receiverUid: string) {
    if (isGroup) {
      const { download } = await this.ctx.qqProtocol.getGroupFileUrl(+receiverUid, fileUuid)
      return {
        retCode: Number(download.retCode),
        retMsg: download.clientWording,
        url: `https://${download.downloadDns}/ftn_handler/${download.downloadUrl.toString('hex')}/?fname=`,
      }
    } else {
      const { body } = await this.ctx.qqProtocol.getPrivateFileUrl(receiverUid, fileUuid)
      const { download } = body.result.extra
      const { fileName } = body.metadata
      return {
        retCode: Number(body.retCode),
        retMsg: body.state,
        url: `https://${download.downloadDns}/ftn_handler/${download.downloadUrl.toString('hex')}/?fname=${encodeURIComponent(fileName)}`
      }
    }
  }

  // opts 只在 originImageUrl 为空 (手表老式图) 时用来现取 URL
  async getImageUrl(originImageUrl: string, md5HexStr: string, opts?: { fileUuid?: string, isGroup?: boolean, peerUid?: string }) {
    const url = originImageUrl
    if (url) {
      if (url.startsWith('http')) {
        return url
      }
      const parsedUrl = new URL(IMAGE_HTTP_HOST + url)
      const imageAppid = parsedUrl.searchParams.get('appid')
      const isNTPic = imageAppid && ['1406', '1407'].includes(imageAppid)
      if (isNTPic) {
        const embeddedRkey = parsedUrl.searchParams.get('rkey')
        if (embeddedRkey) {
          return IMAGE_HTTP_HOST_NT + url
        }
        const rkeyData = await this.rkeyManager.getRkey()
        const rkey = imageAppid === '1406' ? rkeyData.private_rkey : rkeyData.group_rkey
        return IMAGE_HTTP_HOST_NT + url + rkey
      }
      if (url.startsWith('/offpic_new/')) {
        return `${IMAGE_HTTP_HOST}/gchatpic_new/0/0-0-${md5HexStr.toUpperCase()}/0`
      }
      return IMAGE_HTTP_HOST + url
    }
    if (opts?.fileUuid && opts.peerUid) {
      try {
        return await this.resolveOldPicUrl(opts.isGroup ?? false, opts.peerUid, md5HexStr, opts.fileUuid)
      } catch (e) {
        this.ctx.logger.warn('[image-url] 手表老式图现取失败, 回退 md5:', (e as Error).message)
      }
    }
    return `${IMAGE_HTTP_HOST}/gchatpic_new/0/0-0-${md5HexStr.toUpperCase()}/0`
  }

  async ocrImage(imageUrl: string) {
    return await this.ctx.qqProtocol.imageOcr(imageUrl)
  }

  async uploadFlashFile(title: string, filePaths: string[]): Promise<any> {
    if (filePaths.length === 0) throw new Error('uploadFlashFile: filePaths empty')
    type FileMeta = { path: string, name: string, size: number, sha1: string, md5: string, fileUuid: string }
    const files: FileMeta[] = []
    let totalSize = 0
    for (const p of filePaths) {
      const st = await fsStat(p)
      const sha1 = await getSha1HexFromFile(p)
      const md5 = await getMd5HexFromFile(p)
      files.push({ path: p, name: path.basename(p), size: st.size, sha1, md5, fileUuid: randomUUID() })
      totalSize += st.size
    }
    // uploaderNick 必须是真实昵称: 拿 uin 充数会被 prepFlashFileSet 拒 (errorCode=100200)
    if (!selfInfo.nick) {
      await this.ctx.ntUserApi.getSelfNick(true).catch(() => { })
    }
    const uploaderNick = selfInfo.nick || 'QQ用户'
    const fset = await this.ctx.qqProtocol.createFlashFileSet({
      title,
      totalFileCount: files.length,
      totalFileSize: totalSize,
      uploaderUin: selfInfo.uin,
      uploaderNick,
      uploaderUid: selfInfo.uid,
    })
    const fileSetId = fset.fileSetId
    for (const f of files) {
      await this.ctx.qqProtocol.registerFlashFile(fileSetId, {
        fileUuid: f.fileUuid, name: f.name, fileSize: f.size,
        sha1Hex: f.sha1, md5Hex: f.md5,
      })
    }
    await this.ctx.qqProtocol.prepFlashFileSet(fileSetId)
    // 只做 field103=22 的通用文件模式: 图片的 field103=24 要 NT 内部分配的 md5+ext 文件名, 复现不了
    let reqId = 0
    type DownloadInfo = { name: string, size: number, url: string, expire: number }
    const downloads: DownloadInfo[] = []
    for (const f of files) {
      const pre = await this.ctx.qqProtocol.flashFileUploadPreflight({
        fileSize: f.size, sha1Hex: f.sha1, name: f.name, requestId: ++reqId, field103: 22,
      })
      if (pre.uKey) {
        await flashTransferUpload(pre.uKey, f.path, f.size)
      }
      if (!pre.token) {
        throw new Error(`uploadFlashFile: preflight 没有返回 token (file ${f.name})`)
      }
      await this.ctx.qqProtocol.flashFileUploadCommit({
        fileSize: f.size, sha1Hex: f.sha1, name: f.name,
        token: pre.token, time: pre.time, ttl: pre.ttl, requestId: ++reqId, field103: 22,
        fileSetId, fileUuid: f.fileUuid,
      })
      // 必须现在拿 URL: 事后 list 拿不到 fileId / sha1, 没法重建。preflight 的 token 当 fileId 用。
      // 不传 sha1 / md5: 有的 server 会把 sha1 当 string 解析, 报 invalid UTF-8
      const dl = await this.ctx.qqProtocol.flashFileDownloadUrl({
        fileSetId,
        fileUuid: f.fileUuid,
        fileName: f.name,
        fileSize: f.size,
        fileId: pre.token,
        requestId: ++reqId,
      })
      downloads.push({ name: f.name, size: f.size, url: dl.fullUrl, expire: dl.ttl })
    }
    // 跟 Windows QQ 一样上传完 finalize, 虽然调了之后 list 照样不返回 sha1 / md5
    await this.ctx.qqProtocol.downloadFlashFile(fileSetId, 6).catch(() => { })
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
      // 签名链接, 1 小时过期; 过期后只能用 share_link 走浏览器
      downloads,
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
        sha1Hex: f.sha1Hex ?? '',
        md5Hex: f.md5Hex ?? '',
        // commit token, 0x12a9_200 拿 URL 时当 fileId 用
        fileId: f.historyToken?.token ?? '',
      })),
      isEnd: true,
      isCache: false,
    }]
  }

  async getFlashFileSetIdByCode(code: string): Promise<{ result: number, errMsg: string, fileSetId: string }> {
    const fileSetId = await this.ctx.qqProtocol.getFlashFileSetIdByCode(code)
    return { result: 0, errMsg: '', fileSetId }
  }

  /**
   * 用法: getFlashFileSetIdByCode -> getFlashFileList -> 把选中文件的 fileUuid / name / fileSize 传进来。
   * 签名 URL 1 小时过期。不需要 0x93d1_1 / 0x93e1_0 / 0x93d9_1, 那些只用来更新 Windows QQ 的界面
   */
  async getFlashFileDownloadUrl(opts: {
    fileSetId: string,
    fileUuid: string,
    fileName: string,
    fileSize?: number,
    fileSha1Hex?: string,
    fileMd5Hex?: string,
    fileId?: string,  // preflight 返回的 token
  }): Promise<{ host: string, path: string, port: number, rkey: string, ttl: number, fullUrl: string }> {
    const requestId = Math.floor(Math.random() * 0x7fffffff) + 1
    return await this.ctx.qqProtocol.flashFileDownloadUrl({
      fileSetId: opts.fileSetId,
      fileUuid: opts.fileUuid,
      fileName: opts.fileName,
      fileSize: opts.fileSize,
      fileSha1: opts.fileSha1Hex ? Buffer.from(opts.fileSha1Hex, 'hex') : undefined,
      fileMd5: opts.fileMd5Hex ? Buffer.from(opts.fileMd5Hex, 'hex') : undefined,
      fileId: opts.fileId,
      requestId,
    })
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

  /**
   * 跟 Windows QQ 的"重新分享"一样, 拿新的 share_link (14 天有效)。自己的 fileSet 在 list 里拿不到 sha1 / md5,
   * 要逐个文件走 0x93e5_4, 再按上传流程建新 fileSet, 靠秒传完成。老 fileSet 必须还没过期
   */
  async reshareFlashFile(fileSetId: string): Promise<any> {
    const sourceFiles = await this.ctx.qqProtocol.getFlashFileList(fileSetId)
    if (sourceFiles.length === 0) throw new Error('reshareFlashFile: 源 fileSet 无文件')
    // 拿不到 title 就用第一个文件名
    const sourceInfo = await this.ctx.qqProtocol.getFlashFileInfo(fileSetId).catch(() => null)
    type FullEntry = { fileUuid: string, name: string, fileSize: number, sha1Hex?: string, md5Hex?: string }
    const reusable: FullEntry[] = []
    for (const f of sourceFiles as any[]) {
      const fileUuid = f.fileUuid as string | undefined
      if (!fileUuid) continue
      const full = await this.ctx.qqProtocol.getFlashFileEntryFull(fileSetId, fileUuid).catch(() => null) as any
      if (!full) continue
      // 没有 sha1 的 (封面占位等) 没法秒传
      if (!full.sha1Hex || !full.fileSize) continue
      reusable.push({
        fileUuid,
        name: full.name ?? f.name ?? '',
        fileSize: full.fileSize ?? f.fileSize ?? 0,
        sha1Hex: full.sha1Hex,
        md5Hex: full.md5Hex,
      })
    }
    if (reusable.length === 0) throw new Error('reshareFlashFile: 源 fileSet 没有可秒传的文件 (0x93e5_4 没返 sha1)')
    const totalSize = reusable.reduce((s, f) => s + (f.fileSize ?? 0), 0)
    // 同 uploadFlashFile, uploaderNick 必须是真实昵称
    if (!selfInfo.nick) {
      await this.ctx.ntUserApi.getSelfNick(true).catch(() => { })
    }
    const uploaderNick = selfInfo.nick || 'QQ用户'
    const fset = await this.ctx.qqProtocol.createFlashFileSet({
      title: sourceInfo?.title ?? reusable[0].name ?? '',
      totalFileCount: reusable.length,
      totalFileSize: totalSize,
      uploaderUin: selfInfo.uin,
      uploaderNick,
      uploaderUid: selfInfo.uid,
    })
    const newFileSetId = fset.fileSetId
    const newFileUuids = reusable.map(() => randomUUID())
    for (let i = 0; i < reusable.length; i++) {
      const f = reusable[i]
      await this.ctx.qqProtocol.registerFlashFile(newFileSetId, {
        fileUuid: newFileUuids[i],
        name: f.name,
        fileSize: f.fileSize,
        sha1Hex: f.sha1Hex,
        md5Hex: f.md5Hex,
      })
    }
    await this.ctx.qqProtocol.prepFlashFileSet(newFileSetId)
    let reqId = 0
    for (let i = 0; i < reusable.length; i++) {
      const f = reusable[i]
      const sha1Hex = f.sha1Hex ?? ''
      const fileName = f.name ?? ''
      const pre = await this.ctx.qqProtocol.flashFileUploadPreflight({
        fileSize: f.fileSize ?? 0, sha1Hex, name: fileName, requestId: ++reqId, field103: 22,
      })
      if (pre.uKey) {
        throw new Error(`reshareFlashFile: 源文件不再在服务端缓存中（非秒传命中），无法重新分享`)
      }
      if (!pre.token) {
        throw new Error(`reshareFlashFile: preflight 没有返回 token (file ${fileName})`)
      }
      await this.ctx.qqProtocol.flashFileUploadCommit({
        fileSize: f.fileSize ?? 0, sha1Hex, name: fileName,
        token: pre.token, time: pre.time, ttl: pre.ttl, requestId: ++reqId, field103: 22,
        fileSetId: newFileSetId, fileUuid: newFileUuids[i],
      })
    }
    await this.ctx.qqProtocol.downloadFlashFile(newFileSetId, 6).catch(() => { })
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

  async uploadGroupVideo(groupCode: string, filePath: string, thumbPath: string, duration: number, width: number, height: number) {
    const result = await this.ctx.qqProtocol.getGroupVideoUploadInfo(groupCode, filePath, thumbPath, duration, width, height)
    {
      const idxMain = result.ext?.msgInfoBody?.[0]?.index
      const idxThumb = result.subExt?.msgInfoBody?.[1]?.index
      this.ctx.logger.debug(`uploadGroupVideo main fileUuid=${idxMain?.fileUuid?.slice(0, 60)}... mainUKey=${result.ext?.uKey ? 'set' : 'EMPTY'}\n`
        + `thumb fileUuid=${idxThumb?.fileUuid?.slice(0, 60)}... thumbUKey=${result.subExt?.uKey ? 'set' : 'EMPTY'}`)
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
        server: highwaySession.highwayHostAndPorts[1]
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
        server: highwaySession.highwayHostAndPorts[1]
      }
      await new HighwayHttpSession(trans).upload()
    }
    return {
      msgInfo: result.info,
      compat: result.compat
    }
  }

  async uploadPrivateVideo(chatType: ChatType, peerUid: string, filePath: string, thumbPath: string, duration: number, width: number, height: number) {
    const result = await this.ctx.qqProtocol.getC2CVideoUploadInfo(chatType, peerUid, filePath, thumbPath, duration, width, height)
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
        server: highwaySession.highwayHostAndPorts[1]
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
        server: highwaySession.highwayHostAndPorts[1]
      }
      await new HighwayHttpSession(trans).upload()
    }
    return {
      msgInfo: result.info,
      compat: result.compat
    }
  }

  async uploadGroupFile(groupCode: number, filePath: string, fileName: string, parentFolderId = '/') {
    let result = await this.ctx.qqProtocol.getGroupFileUploadInfo(groupCode, filePath, fileName, parentFolderId, 102)
    if (result.retCode === -403n) {
      // 永久空间不足，改发临时文件
      result = await this.ctx.qqProtocol.getGroupFileUploadInfo(groupCode, filePath, fileName, parentFolderId, 104)
    }
    if (!result.fileExist) {
      const highwaySession = await this.ctx.qqProtocol.getHighwaySession()
      const ext = Media.FileUploadExt.encode({
        unknown1: 100,
        unknown2: 1,
        entry: {
          busiBuff: {
            senderUin: +selfInfo.uin,
            receiverUin: groupCode,
            groupCode: groupCode
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
                host: result.uploadIp
              },
              port: result.uploadPort
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
        server: highwaySession.highwayHostAndPorts[1]
      }
      await new HighwayHttpSession(trans).upload()
    }
    return {
      fileId: result.fileId,
      fileSize: result.fileSize,
      fileMd5: result.md5.toString('hex'),
      busId: result.busId
    }
  }

  async uploadPrivateFile(chatType: ChatType, peerUid: string, filePath: string, fileName: string) {
    const result = await this.ctx.qqProtocol.getC2CFileUploadInfo(chatType, peerUid, filePath, fileName)
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
      server: highwaySession.highwayHostAndPorts[1]
    }
    await new HighwayHttpSession(trans).upload()
    return {
      fileId: result.fileId,
      file10MMd5: result.md510MCheckSum,
      fileSize: result.fileSize,
      crcMedia: result.crcMedia
    }
  }

  async uploadGroupImage(groupCode: string, filePath: string, width: number, height: number, summary: string, bizType: number) {
    const result = await this.ctx.qqProtocol.getGroupImageUploadInfo(groupCode, filePath, width, height, summary, bizType)
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
        server: highwaySession.highwayHostAndPorts[1]
      }
      await new HighwayHttpSession(trans).upload()
    }
    return {
      msgInfo: result.info,
      compat: result.compat
    }
  }

  async uploadPrivateImage(chatType: ChatType, peerUid: string, filePath: string, width: number, height: number, summary: string, bizType: number) {
    const result = await this.ctx.qqProtocol.getC2CImageUploadInfo(chatType, peerUid, filePath, width, height, summary, bizType)
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
        server: highwaySession.highwayHostAndPorts[1]
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
        server: highwaySession.highwayHostAndPorts[1]
      }
      await new HighwayHttpSession(trans).upload()
    }
    return { msgInfo: result.info, compat: result.compat }
  }

  async uploadPrivatePtt(chatType: ChatType, peerUid: string, filePath: string, duration: number) {
    const result = await this.ctx.qqProtocol.getC2CPttUploadInfo(chatType, peerUid, filePath, duration)
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
        server: highwaySession.highwayHostAndPorts[1]
      }
      await new HighwayHttpSession(trans).upload()
    }
    return { msgInfo: result.info, compat: result.compat }
  }

  async getRKey() {
    const { result } = await this.ctx.qqProtocol.getRKey()
    return {
      privateRKey: result.rkeyItems[0].rkey!,
      groupRKey: result.rkeyItems[1].rkey!,
      expiredTime: result.rkeyItems[0].createTime! + result.rkeyItems[0].ttlSec!,
    }
  }
}
