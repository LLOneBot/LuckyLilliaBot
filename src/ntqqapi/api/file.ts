import { invoke, NTMethod } from '../ntcall'
import { GeneralCallResult } from '../services'
import {
  CacheFileList,
  CacheFileListItem,
  CacheFileType,
  CacheScanResult,
  ChatCacheListItemBasic,
  ChatType,
  ElementType,
  IMAGE_HTTP_HOST,
  IMAGE_HTTP_HOST_NT,
  PicElement,
} from '../types'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { ReceiveCmdS } from '../hook'
import { RkeyManager } from '@/ntqqapi/helper/rkey'
import { RichMediaDownloadCompleteNotify, RichMediaUploadCompleteNotify, RMBizType, Peer } from '@/ntqqapi/types/msg'
import { calculateFileMD5, getFileType, getImageSize } from '@/common/utils/file'
import { copyFile, stat, unlink } from 'node:fs/promises'
import { Time } from 'cosmokit'
import { Service, Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { FlashFileListItem, FlashFileSetInfo } from '@/ntqqapi/types/flashfile'

declare module 'cordis' {
  interface Context {
    ntFileApi: NTQQFileApi
    ntFileCacheApi: NTQQFileCacheApi
  }
}

export class NTQQFileApi extends Service {
  rkeyManager: RkeyManager

  constructor(protected ctx: Context) {
    super(ctx, 'ntFileApi', true)
    this.rkeyManager = new RkeyManager(ctx, 'https://llob.linyuchen.net/rkey')
  }

  async getVideoUrlByPacket(fileUuid: string, isGroup: boolean) {
    if (isGroup) {
      return await this.ctx.get('app')!.pmhq.getGroupVideoUrl(fileUuid)
    } else {
      return await this.ctx.get('app')!.pmhq.getPrivateVideoUrl(fileUuid)
    }
  }

  async getPttUrl(fileUuid: string, isGroup: boolean) {
    if (isGroup) {
      return await this.ctx.get('app')!.pmhq.getGroupPttUrl(fileUuid)
    } else {
      return await this.ctx.get('app')!.pmhq.getPrivatePttUrl(fileUuid)
    }
  }

  async getVideoUrl(peer: Peer, msgId: string, elementId: string) {
    try {
      const data = await invoke('nodeIKernelRichMediaService/getVideoPlayUrlV2', [
        peer,
        msgId,
        elementId,
        0, // video code format, 0: H264, 1: H265 ?
        {
          downSourceType: 1,
          triggerType: 0,  // 是否下载到本地
        },
      ])
      if (data.result !== 0) {
        this.ctx.logger.warn('getVideoUrl', data)
      }
      return data.urlResult.domainUrl[0]?.url ?? ''
    } catch (e) {
      this.ctx.logger.warn('getVideoUrl error', e)
      return ''
    }
  }

  async getFileType(filePath: string) {
    return await getFileType(filePath)
  }

  async getRichMediaFilePath(md5HexStr: string, fileName: string, elementType: ElementType, elementSubType = 0) {
    return await invoke(NTMethod.MEDIA_FILE_PATH, [
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
    const fileMd5 = await calculateFileMD5(filePath)
    let fileName = path.basename(filePath)
    if (!fileName.includes('.')) {
      const ext = (await this.getFileType(filePath))?.ext
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

  async downloadMedia(
    msgId: string,
    chatType: ChatType,
    peerUid: string,
    elementId: string,
    thumbPath = '',
    sourcePath = '',
    timeout = 1000 * 60 * 30,
    force = false,
  ) {
    // 用于下载收到的消息中的图片等
    if (sourcePath && existsSync(sourcePath)) {
      if (force) {
        unlink(sourcePath).then().catch(e => {
        })
      } else {
        return sourcePath
      }
    }
    const data = await invoke<RichMediaDownloadCompleteNotify>(
      'nodeIKernelMsgService/downloadRichMedia',
      [{
        fileModelId: '0',
        downloadSourceType: 0,
        triggerType: 1,
        msgId: msgId,
        chatType: chatType,
        peerUid: peerUid,
        elementId: elementId,
        thumbSize: 0,
        downloadType: 1,
        filePath: thumbPath,
      }],
      {
        resultCmd: ReceiveCmdS.MEDIA_DOWNLOAD_COMPLETE,
        resultCb: payload => payload.msgId === msgId,
        timeout,
      },
    )
    return data.filePath
  }

  async getImageSize(filePath: string): Promise<{ type: string, width: number, height: number }> {
    const fileType = await getFileType(filePath)
    const size = await getImageSize(filePath)
    return {
      type: fileType.ext,
      ...size,
    }
  }

  async getImageUrl(element: PicElement) {
    const url = element.originImageUrl  // 没有域名
    const md5HexStr = element.md5HexStr

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

  async downloadFileForModelId(peer: Peer, fileModelId: string, timeout = 2 * Time.minute) {
    const data = await invoke<RichMediaDownloadCompleteNotify>(
      'nodeIKernelRichMediaService/downloadFileForModelId',
      [
        peer,
        [fileModelId],
        '', // savePath
      ],
      {
        resultCmd: ReceiveCmdS.MEDIA_DOWNLOAD_COMPLETE,
        resultCb: payload => payload.fileModelId === fileModelId,
        timeout,
      },
    )
    return data.filePath
  }

  async ocrImage(path: string) {
    return await invoke(
      'nodeIKernelNodeMiscService/wantWinScreenOCR',
      [
        path,
      ],
      {
        timeout: 2 * Time.minute,
      },
    )
  }

  async uploadRMFileWithoutMsg(filePath: string, bizType: RMBizType, peerUid: string) {
    const data = await invoke<RichMediaUploadCompleteNotify>(
      'nodeIKernelRichMediaService/uploadRMFileWithoutMsg',
      [
        {
          filePath,
          bizType,
          peerUid,
          useNTV2: true,
        },
      ],
      {
        resultCmd: ReceiveCmdS.MEDIA_UPLOAD_COMPLETE,
        resultCb: payload => payload.filePath === filePath,
        timeout: 10 * Time.second,
      },
    )
    return data
  }

  async uploadFlashFile(title: string, filePaths: string[]) {
    return await invoke('nodeIKernelFlashTransferService/createFlashTransferUploadTask',
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
    return await invoke('nodeIKernelFlashTransferService/startFileSetDownload',
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
    const res = await invoke('nodeIKernelFlashTransferService/getFileList',
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
    return await invoke('nodeIKernelFlashTransferService/getFileSetIdByCode',
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
    const res = await invoke('nodeIKernelFlashTransferService/getFileSet',
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
}

export class NTQQFileCacheApi extends Service {
  constructor(protected ctx: Context) {
    super(ctx, 'ntFileCacheApi', true)
  }

  async setCacheSilentScan(isSilent: boolean = true) {
    return await invoke<GeneralCallResult>(NTMethod.CACHE_SET_SILENCE, [{ isSilent }])
  }

  getCacheSessionPathList() {
    // return invoke<Array<{
    //   key: string
    //   value: string
    // }>>(NTMethod.CACHE_PATH_SESSION, [])
  }

  scanCache() {
    invoke<GeneralCallResult>(ReceiveCmdS.CACHE_SCAN_FINISH, [])
    return invoke<CacheScanResult>(NTMethod.CACHE_SCAN, [], { timeout: 300 * Time.second })
  }

  getHotUpdateCachePath() {
    // return invoke<string>(NTMethod.CACHE_PATH_HOT_UPDATE, [])
  }

  getDesktopTmpPath() {
    // return invoke<string>(NTMethod.CACHE_PATH_DESKTOP_TEMP, [])
  }

  getFileCacheInfo(fileType: CacheFileType, pageSize: number = 1000, lastRecord?: CacheFileListItem) {
    const _lastRecord = lastRecord ? lastRecord : { fileType: fileType }

    return invoke<CacheFileList>(NTMethod.CACHE_FILE_GET, [{
      fileType: fileType,
      restart: true,
      pageSize: pageSize,
      order: 1,
      lastRecord: _lastRecord,
    }])
  }

  async clearChatCache(chats: ChatCacheListItemBasic[] = [], fileKeys: string[] = []) {
    return await invoke<GeneralCallResult>(NTMethod.CACHE_CHAT_CLEAR, [{
      chats,
      fileKeys,
    }])
  }
}

