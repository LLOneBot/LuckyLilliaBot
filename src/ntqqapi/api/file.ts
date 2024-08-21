import { callNTQQApi, GeneralCallResult, NTQQApiClass, NTQQApiMethod } from '../ntcall'
import {
  CacheFileList,
  CacheFileListItem,
  CacheFileType,
  CacheScanResult,
  ChatCacheList,
  ChatCacheListItemBasic,
  ChatType,
  ElementType,
  IMAGE_HTTP_HOST,
  IMAGE_HTTP_HOST_NT,
  PicElement,
} from '../types'
import path from 'node:path'
import fs from 'node:fs'
import { ReceiveCmdS } from '../hook'
import { log, TEMP_DIR } from '@/common/utils'
import { rkeyManager } from '@/ntqqapi/api/rkey'
import { getSession } from '@/ntqqapi/wrapper'
import { Peer } from '@/ntqqapi/types/msg'
import { calculateFileMD5 } from '@/common/utils/file'
import { fileTypeFromFile } from 'file-type'
import fsPromise from 'node:fs/promises'
import { NTEventDispatch } from '@/common/utils/EventTask'
import { OnRichMediaDownloadCompleteParams } from '@/ntqqapi/listeners'
import { NodeIKernelSearchService } from '@/ntqqapi/services'
import { Time } from 'cosmokit'

export class NTQQFileApi {
  static async getVideoUrl(peer: Peer, msgId: string, elementId: string): Promise<string> {
    const session = getSession()
    return (await session?.getRichMediaService().getVideoPlayUrlV2(peer,
      msgId,
      elementId,
      0,
      { downSourceType: 1, triggerType: 1 }))?.urlResult?.domainUrl[0]?.url!
  }

  static async getFileType(filePath: string) {
    return fileTypeFromFile(filePath)
  }

  static async copyFile(filePath: string, destPath: string) {
    return await callNTQQApi<string>({
      className: NTQQApiClass.FS_API,
      methodName: NTQQApiMethod.FILE_COPY,
      args: [
        {
          fromPath: filePath,
          toPath: destPath,
        },
      ],
    })
  }

  static async getFileSize(filePath: string) {
    return await callNTQQApi<number>({
      className: NTQQApiClass.FS_API,
      methodName: NTQQApiMethod.FILE_SIZE,
      args: [filePath],
    })
  }

  // 上传文件到QQ的文件夹
  static async uploadFile(filePath: string, elementType: ElementType = ElementType.PIC, elementSubType = 0) {
    const fileMd5 = await calculateFileMD5(filePath)
    let ext = (await NTQQFileApi.getFileType(filePath))?.ext || ''
    if (ext) {
      ext = '.' + ext
    }
    let fileName = `${path.basename(filePath)}`
    if (fileName.indexOf('.') === -1) {
      fileName += ext
    }
    const session = getSession()
    const mediaPath = session?.getMsgService().getRichMediaFilePathForGuild({
      md5HexStr: fileMd5,
      fileName: fileName,
      elementType: elementType,
      elementSubType,
      thumbSize: 0,
      needCreate: true,
      downloadType: 1,
      file_uuid: ''
    })
    await fsPromise.copyFile(filePath, mediaPath!)
    const fileSize = (await fsPromise.stat(filePath)).size
    return {
      md5: fileMd5,
      fileName,
      path: mediaPath!,
      fileSize,
      ext
    }
  }

  static async downloadMedia(
    msgId: string,
    chatType: ChatType,
    peerUid: string,
    elementId: string,
    thumbPath: string,
    sourcePath: string,
    timeout = 1000 * 60 * 2,
    force = false
  ) {
    // 用于下载收到的消息中的图片等
    if (sourcePath && fs.existsSync(sourcePath)) {
      if (force) {
        try {
          await fsPromise.unlink(sourcePath)
        } catch (e) {
          //
        }
      } else {
        return sourcePath
      }
    }
    const data = await NTEventDispatch.CallNormalEvent<
      (
        params: {
          fileModelId: string,
          downloadSourceType: number,
          triggerType: number,
          msgId: string,
          chatType: ChatType,
          peerUid: string,
          elementId: string,
          thumbSize: number,
          downloadType: number,
          filePath: string
        }) => Promise<unknown>,
      (fileTransNotifyInfo: OnRichMediaDownloadCompleteParams) => void
    >(
      'NodeIKernelMsgService/downloadRichMedia',
      'NodeIKernelMsgListener/onRichMediaDownloadComplete',
      1,
      timeout,
      (arg: OnRichMediaDownloadCompleteParams) => {
        if (arg.msgId === msgId) {
          return true
        }
        return false
      },
      {
        fileModelId: '0',
        downloadSourceType: 0,
        triggerType: 1,
        msgId: msgId,
        chatType: chatType,
        peerUid: peerUid,
        elementId: elementId,
        thumbSize: 0,
        downloadType: 1,
        filePath: thumbPath
      }
    )
    let filePath = data[1].filePath
    if (filePath.startsWith('\\')) {
      const downloadPath = TEMP_DIR
      filePath = path.join(downloadPath, filePath)
      // 下载路径是下载文件夹的相对路径
    }
    return filePath
  }

  static async getImageSize(filePath: string) {
    return await callNTQQApi<{ width: number; height: number }>({
      className: NTQQApiClass.FS_API,
      methodName: NTQQApiMethod.IMAGE_SIZE,
      args: [filePath],
    })
  }

  static async getImageUrl(element: PicElement) {
    if (!element) {
      return ''
    }
    const url: string = element.originImageUrl!  // 没有域名
    const md5HexStr = element.md5HexStr
    const fileMd5 = element.md5HexStr

    if (url) {
      const UrlParse = new URL(IMAGE_HTTP_HOST + url) //临时解析拼接
      const imageAppid = UrlParse.searchParams.get('appid')
      const isNewPic = imageAppid && ['1406', '1407'].includes(imageAppid)
      if (isNewPic) {
        let UrlRkey = UrlParse.searchParams.get('rkey')
        if (UrlRkey) {
          return IMAGE_HTTP_HOST_NT + url
        }
        const rkeyData = await rkeyManager.getRkey()
        UrlRkey = imageAppid === '1406' ? rkeyData.private_rkey : rkeyData.group_rkey
        return IMAGE_HTTP_HOST_NT + url + `${UrlRkey}`
      } else {
        // 老的图片url，不需要rkey
        return IMAGE_HTTP_HOST + url
      }
    } else if (fileMd5 || md5HexStr) {
      // 没有url，需要自己拼接
      return `${IMAGE_HTTP_HOST}/gchatpic_new/0/0-0-${(fileMd5 || md5HexStr)!.toUpperCase()}/0`
    }
    log('图片url获取失败', element)
    return ''
  }

  // forked from https://github.com/NapNeko/NapCatQQ/blob/6f6b258f22d7563f15d84e7172c4d4cbb547f47e/src/core/src/apis/file.ts#L149
  static async addFileCache(peer: Peer, msgId: string, msgSeq: string, senderUid: string, elemId: string, elemType: string, fileSize: string, fileName: string) {
    let GroupData: any[] | undefined
    let BuddyData: any[] | undefined
    if (peer.chatType === ChatType.group) {
      GroupData =
        [{
          groupCode: peer.peerUid,
          isConf: false,
          hasModifyConfGroupFace: true,
          hasModifyConfGroupName: true,
          groupName: 'LLOneBot.Cached',
          remark: 'LLOneBot.Cached',
        }];
    } else if (peer.chatType === ChatType.friend) {
      BuddyData = [{
        category_name: 'LLOneBot.Cached',
        peerUid: peer.peerUid,
        peerUin: peer.peerUid,
        remark: 'LLOneBot.Cached',
      }]
    } else {
      return undefined
    }

    const session = getSession()
    return session?.getSearchService().addSearchHistory({
      type: 4,
      contactList: [],
      id: -1,
      groupInfos: [],
      msgs: [],
      fileInfos: [
        {
          chatType: peer.chatType,
          buddyChatInfo: BuddyData || [],
          discussChatInfo: [],
          groupChatInfo: GroupData || [],
          dataLineChatInfo: [],
          tmpChatInfo: [],
          msgId: msgId,
          msgSeq: msgSeq,
          msgTime: Math.floor(Date.now() / 1000).toString(),
          senderUid: senderUid,
          senderNick: 'LLOneBot.Cached',
          senderRemark: 'LLOneBot.Cached',
          senderCard: 'LLOneBot.Cached',
          elemId: elemId,
          elemType: elemType,
          fileSize: fileSize,
          filePath: '',
          fileName: fileName,
          hits: [{
            start: 12,
            end: 14,
          }],
        },
      ],
    })
  }

  static async searchfile(keys: string[]) {
    type EventType = NodeIKernelSearchService['searchFileWithKeywords']

    interface OnListener {
      searchId: string,
      hasMore: boolean,
      resultItems: {
        chatType: ChatType,
        buddyChatInfo: any[],
        discussChatInfo: any[],
        groupChatInfo:
        {
          groupCode: string,
          isConf: boolean,
          hasModifyConfGroupFace: boolean,
          hasModifyConfGroupName: boolean,
          groupName: string,
          remark: string
        }[],
        dataLineChatInfo: any[],
        tmpChatInfo: any[],
        msgId: string,
        msgSeq: string,
        msgTime: string,
        senderUid: string,
        senderNick: string,
        senderRemark: string,
        senderCard: string,
        elemId: string,
        elemType: number,
        fileSize: string,
        filePath: string,
        fileName: string,
        hits:
        {
          start: number,
          end: number
        }[]
      }[]
    }

    const Event = NTEventDispatch.createEventFunction<EventType>('NodeIKernelSearchService/searchFileWithKeywords')
    let id = ''
    const Listener = NTEventDispatch.RegisterListen<(params: OnListener) => void>
      (
        'NodeIKernelSearchListener/onSearchFileKeywordsResult',
        1,
        20000,
        (params) => id !== '' && params.searchId == id,
      )
    id = await Event!(keys, 12)
    const [ret] = await Listener
    return ret
  }
}

export class NTQQFileCacheApi {
  static async setCacheSilentScan(isSilent: boolean = true) {
    return await callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.CACHE_SET_SILENCE,
      args: [
        {
          isSilent,
        },
        null,
      ],
    })
  }

  static getCacheSessionPathList() {
    return callNTQQApi<
      {
        key: string
        value: string
      }[]
    >({
      className: NTQQApiClass.OS_API,
      methodName: NTQQApiMethod.CACHE_PATH_SESSION,
    })
  }

  static clearCache(cacheKeys: Array<string> = ['tmp', 'hotUpdate']) {
    return callNTQQApi<any>({
      // TODO: 目前还不知道真正的返回值是什么
      methodName: NTQQApiMethod.CACHE_CLEAR,
      args: [
        {
          keys: cacheKeys,
        },
        null,
      ],
    })
  }

  static addCacheScannedPaths(pathMap: object = {}) {
    return callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.CACHE_ADD_SCANNED_PATH,
      args: [
        {
          pathMap: { ...pathMap },
        },
        null,
      ],
    })
  }

  static scanCache() {
    callNTQQApi<GeneralCallResult>({
      methodName: ReceiveCmdS.CACHE_SCAN_FINISH,
      classNameIsRegister: true,
    }).then()
    return callNTQQApi<CacheScanResult>({
      methodName: NTQQApiMethod.CACHE_SCAN,
      args: [null, null],
      timeout: 300 * Time.second,
    })
  }

  static getHotUpdateCachePath() {
    return callNTQQApi<string>({
      className: NTQQApiClass.HOTUPDATE_API,
      methodName: NTQQApiMethod.CACHE_PATH_HOT_UPDATE,
    })
  }

  static getDesktopTmpPath() {
    return callNTQQApi<string>({
      className: NTQQApiClass.BUSINESS_API,
      methodName: NTQQApiMethod.CACHE_PATH_DESKTOP_TEMP,
    })
  }

  static getChatCacheList(type: ChatType, pageSize: number = 1000, pageIndex: number = 0) {
    return new Promise<ChatCacheList>((res, rej) => {
      callNTQQApi<ChatCacheList>({
        methodName: NTQQApiMethod.CACHE_CHAT_GET,
        args: [
          {
            chatType: type,
            pageSize,
            order: 1,
            pageIndex,
          },
          null,
        ],
      })
        .then((list) => res(list))
        .catch((e) => rej(e))
    })
  }

  static getFileCacheInfo(fileType: CacheFileType, pageSize: number = 1000, lastRecord?: CacheFileListItem) {
    const _lastRecord = lastRecord ? lastRecord : { fileType: fileType }

    return callNTQQApi<CacheFileList>({
      methodName: NTQQApiMethod.CACHE_FILE_GET,
      args: [
        {
          fileType: fileType,
          restart: true,
          pageSize: pageSize,
          order: 1,
          lastRecord: _lastRecord,
        },
        null,
      ],
    })
  }

  static async clearChatCache(chats: ChatCacheListItemBasic[] = [], fileKeys: string[] = []) {
    return await callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.CACHE_CHAT_CLEAR,
      args: [
        {
          chats,
          fileKeys,
        },
        null,
      ],
    })
  }
}
