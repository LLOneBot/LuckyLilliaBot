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

/**
 * 闪传非秒传命中分支：分片上传到 multimedia.qfile.qq.com/sliceupload。
 * 每片要带累计 sha1 列表（chunkSha1[0..i]）。
 */
async function flashTransferUpload(uKey: string, filePath: string, fileSize: number) {
  const fileBytes = readFileSync(filePath)
  const chunkCount = Math.ceil(fileSize / FLASH_TRANSFER_CHUNK_SIZE)
  // 预先计算每个 chunk 边界处的累计 sha1（从文件头到 chunk 结尾）。最后一片直接用整文件 sha1。
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

  async getFileUrl(fileUuid: string, isGroup: boolean, groupCode?: number) {
    if (isGroup) {
      const { download } = await this.ctx.qqProtocol.getGroupFileUrl(groupCode!, fileUuid)
      return {
        retCode: Number(download.retCode),
        retMsg: download.clientWording,
        url: `https://${download.downloadDns}/ftn_handler/${download.downloadUrl.toString('hex')}/?fname=`,
      }
    } else {
      const { body } = await this.ctx.qqProtocol.getPrivateFileUrl(fileUuid)
      const { download } = body.result.extra
      const { fileName } = body.metadata
      return {
        retCode: Number(body.retCode),
        retMsg: body.state,
        url: `https://${download.downloadDns}/ftn_handler/${download.downloadUrl.toString('hex')}/?fname=${encodeURIComponent(fileName)}`
      }
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
    // 1. 创建 fileSet。uploaderNick 必须是真实昵称——若 selfInfo.nick 还没填则
    //    去群成员列表里抓一次（fetchSelfInfo 内部缓存）。直接用 uin 当 nick 会被服务器
    //    后续的 prepFlashFileSet 拒掉（errorCode=100200 "加载失败"）。
    if (!selfInfo.nick) {
      await this.ctx.ntUserApi.getSelfNick(true).catch(() => { })
    }
    // 还是空的话用占位符——至少不要把 uin 当 nick 上送
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
    // 2. 注册每个文件 (sha1/md5 必传——不传 server 端 fileSet entry 不带这俩,
    //    后续 list 永远拿不到，reshare/跨账号下载都会失败)
    for (const f of files) {
      await this.ctx.qqProtocol.registerFlashFile(fileSetId, {
        fileUuid: f.fileUuid, name: f.name, fileSize: f.size,
        sha1Hex: f.sha1, md5Hex: f.md5,
      })
    }
    // 3. prep
    await this.ctx.qqProtocol.prepFlashFileSet(fileSetId)
    // 4. preflight + commit per file（仅支持秒传命中场景）
    // 注：LLBot 对图片文件会先做一遍 field103=24 的"图像模式"上传（需要 NT 内部
    // 分配的 md5+ext 文件名），无法可靠复现；这里只做 field103=22 的通用文件模式。
    let reqId = 0
    type DownloadInfo = { name: string, size: number, url: string, expire: number }
    const downloads: DownloadInfo[] = []
    for (const f of files) {
      const pre = await this.ctx.qqProtocol.flashFileUploadPreflight({
        fileSize: f.size, sha1Hex: f.sha1, name: f.name, requestId: ++reqId, field103: 22,
      })
      if (pre.uKey) {
        // 非秒传命中：走 multimedia.qfile.qq.com/sliceupload 分片上传
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
      // 立刻拿 download URL：preflight 给的 token 在这里当 fileId 用，server 拼 URL
      // 时填进 fileid= 参数。Linux QQ 的 list 拿不到 fileId/sha1，所以必须在 upload
      // 流程里一步到位拿 URL，事后没法重建。
      // sha1/md5 不传也行（server 用 fileId 定位文件就够），传了反而某些 server 端会
      // 把 sha1 当 string 解析报 invalid UTF-8（proto 是 bytes，但 server impl 用 string）。
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
    // 5. finalize: 把 fileSet 状态推到 server 端 (sceneType=6)。Windows QQ 抓包看完成
    //    上传后必调；bot 之前漏了。注：实测调了之后 server 还是不给 list/0x93e5_4 返
    //    sha1/md5/historyToken (Linux QQ session 限制)，但仍跟齐 Windows QQ 流程。
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
      // 上传一步到位拿到的每个文件 download URL（multimedia.qfile.qq.com 短期签名链接，
      // 1 小时过期）。直接 https.get 可下；过期后只能上层用 share_link 走浏览器入口。
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
        // 102 字符 base64 commit token，作为 0x12a9_200 download 的 fileId 入参，
        // server 拼出来的 URL 里 fileid= 字段就是这个值
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

  /** 闪传：拿单个文件的 HTTPS 下载 URL（NTV2 0x12a9_200）。
   * 用法：`getFlashFileSetIdByCode(code)` → fileSetId → `getFlashFileList(fileSetId)` 拿到
   * file 列表 → 选中文件后从 `file.fileUuid` / `file.name` / `file.fileSize` 喂进来。
   * 返回带签名的 multimedia.qfile.qq.com URL，1 小时过期。
   *
   * server 用 (fileSetId, fileUuid) 真正定位文件，不依赖 download.info.fileId 那个 token —
   * 那个 token 是 Windows 客户端从老 commit cache 里翻出来的，传不传都行。
   *
   * 不需要：0x93d1_1 (registerDownload) / 0x93e1_0 (progress polling) /
   * 0x93d9_1 (download complete) — 那些是 Windows QQ UI 用来更新自己界面的，bot 上层
   * 拿到 URL 直接 https.get 就行。 */
  async getFlashFileDownloadUrl(opts: {
    fileSetId: string,
    fileUuid: string,
    fileName: string,
    fileSize?: number,
    fileSha1Hex?: string,
    fileMd5Hex?: string,
    fileId?: string,  // base64 token (from preflight resp.fastUploadInfo.summary.fileSummary.token)
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

  /** 闪传：基于已有 fileSet 重新分享，拿到全新 share_link + 14 天有效期。
   *
   * 跟 Windows QQ 客户端"重新分享"按钮一样的事——抓包确认 Windows QQ 也是这个流程，
   * 但有个我之前漏的关键步骤 0x93e5_4：取每个老文件的完整元数据 (含 sha1/md5/historyToken)。
   *
   * 为啥需要 0x93e5_4：list (0x93d4_1) 对 bot 自己 own 的 fileSet 即使 field3=2
   * 也只返 name/size/uuid，sha1/md5/historyToken 全空——这是 server 端 ownership
   * 限制 (大概 server 觉得 client 自己的文件 client 自己有数据)。0x93e5_4 没这限制，
   * 对自己的 fileSet 也返完整字段，所以重新分享必经它。
   *
   * 流程：
   *   fileSetId → 0x93d4_1 (list) → 拿每个文件的 fileUuid (基础字段)
   *   for fileUuid in fileSet:
   *     → 0x93e5_4 → 完整 entry (sha1Hex/md5Hex/historyToken/name/size)
   *   → 0x93cf_1 createFlashFileSet (新 fileSetId + 新 share_link)
   *   → 0x93d0_1 registerFlashFile per file (带 sha1/md5)
   *   → 0x93db_1 prepFlashFileSet
   *   → 0x12a9_100 preflight (用 0x93e5_4 拿到的 sha1) → server 秒传命中
   *   → 0x12a9_103 commit
   *   → 0x93d1_1 finalize
   *
   * 限制：老 fileSet 必须没过期。 */
  async reshareFlashFile(fileSetId: string): Promise<any> {
    const sourceFiles = await this.ctx.qqProtocol.getFlashFileList(fileSetId)
    if (sourceFiles.length === 0) throw new Error('reshareFlashFile: 源 fileSet 无文件')
    // info 拿 title — 拿不到（fileSet 已过期等）就用首文件名兜底，不让重新分享因为这个失败
    const sourceInfo = await this.ctx.qqProtocol.getFlashFileInfo(fileSetId).catch(() => null)
    // 用 0x93e5_4 给每个文件取完整元数据 (含 sha1/md5)，list 自己 own 的 fileSet 不返这些字段
    type FullEntry = { fileUuid: string, name: string, fileSize: number, sha1Hex?: string, md5Hex?: string }
    const reusable: FullEntry[] = []
    for (const f of sourceFiles as any[]) {
      const fileUuid = f.fileUuid as string | undefined
      if (!fileUuid) continue
      const full = await this.ctx.qqProtocol.getFlashFileEntryFull(fileSetId, fileUuid).catch(() => null) as any
      if (!full) continue
      // 跳过没 sha1 的 entry（封面占位等，size=1712 的默认头像那种），server 没法秒传它们
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
    // uploaderNick 必须真实昵称——若 selfInfo.nick 还没填则去抓一次 (跟 uploadFlashFile 一致)
    if (!selfInfo.nick) {
      await this.ctx.ntUserApi.getSelfNick(true).catch(() => { })
    }
    const uploaderNick = selfInfo.nick || 'QQ用户'
    // 1. 创建新 fileSet
    const fset = await this.ctx.qqProtocol.createFlashFileSet({
      title: sourceInfo?.title ?? reusable[0].name ?? '',
      totalFileCount: reusable.length,
      totalFileSize: totalSize,
      uploaderUin: selfInfo.uin,
      uploaderNick,
      uploaderUid: selfInfo.uid,
    })
    const newFileSetId = fset.fileSetId
    // 2. 注册每个文件（用源文件的元信息）+ prep + 秒传 commit
    // newFileUuid per file 在 register/commit 都要用上，所以先生成存起来
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
    const result = await this.ctx.qqProtocol.getGroupFileUploadInfo(groupCode, filePath, fileName, parentFolderId)
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
        server: highwaySession.highwayHostAndPorts[1]
      }
      await new HighwayHttpSession(trans).upload()
    }
    return {
      fileId: result.fileId,
      fileSize: result.fileSize,
      fileMd5: result.md5.toString('hex')
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
