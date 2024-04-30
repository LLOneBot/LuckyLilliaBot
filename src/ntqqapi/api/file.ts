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
  RawMessage,
} from '../types'
import path from 'path'
import fs from 'fs'
import { ReceiveCmdS } from '../hook'
import { log } from '../../common/utils'
import http from 'http'
import { sleep } from '../../common/utils'
import { hookApi } from '../external/moehook/hook'

let privateImageRKey = ''
let groupImageRKey = ''
let lastGetRKeyTime = 0
const rkeyExpireTime = 1000 * 60 * 30

export class NTQQFileApi {
  static async getFileType(filePath: string) {
    return await callNTQQApi<{ ext: string }>({
      className: NTQQApiClass.FS_API,
      methodName: NTQQApiMethod.FILE_TYPE,
      args: [filePath],
    })
  }

  static async getFileMd5(filePath: string) {
    return await callNTQQApi<string>({
      className: NTQQApiClass.FS_API,
      methodName: NTQQApiMethod.FILE_MD5,
      args: [filePath],
    })
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
  static async uploadFile(filePath: string, elementType: ElementType = ElementType.PIC, elementSubType: number = 0) {
    const md5 = await NTQQFileApi.getFileMd5(filePath)
    let ext = (await NTQQFileApi.getFileType(filePath))?.ext
    if (ext) {
      ext = '.' + ext
    } else {
      ext = ''
    }
    let fileName = `${path.basename(filePath)}`
    if (fileName.indexOf('.') === -1) {
      fileName += ext
    }
    const mediaPath = await callNTQQApi<string>({
      methodName: NTQQApiMethod.MEDIA_FILE_PATH,
      args: [
        {
          path_info: {
            md5HexStr: md5,
            fileName: fileName,
            elementType: elementType,
            elementSubType,
            thumbSize: 0,
            needCreate: true,
            downloadType: 1,
            file_uuid: '',
          },
        },
      ],
    })
    log('media path', mediaPath)
    await NTQQFileApi.copyFile(filePath, mediaPath)
    const fileSize = await NTQQFileApi.getFileSize(filePath)
    return {
      md5,
      fileName,
      path: mediaPath,
      fileSize,
      ext,
    }
  }

  static async downloadMedia(
    msgId: string,
    chatType: ChatType,
    peerUid: string,
    elementId: string,
    thumbPath: string,
    sourcePath: string,
    force: boolean = false,
  ) {
    // 用于下载收到的消息中的图片等
    if (sourcePath && fs.existsSync(sourcePath)) {
      if (force) {
        fs.unlinkSync(sourcePath)
      } else {
        return sourcePath
      }
    }
    const apiParams = [
      {
        getReq: {
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
        },
      },
      null,
    ]
    // log("需要下载media", sourcePath);
    await callNTQQApi({
      methodName: NTQQApiMethod.DOWNLOAD_MEDIA,
      args: apiParams,
      cbCmd: ReceiveCmdS.MEDIA_DOWNLOAD_COMPLETE,
      cmdCB: (payload: { notifyInfo: { filePath: string; msgId: string } }) => {
        log('media 下载完成判断', payload.notifyInfo.msgId, msgId)
        return payload.notifyInfo.msgId == msgId
      },
    })
    return sourcePath
  }

  static async getImageSize(filePath: string) {
    return await callNTQQApi<{ width: number; height: number }>({
      className: NTQQApiClass.FS_API,
      methodName: NTQQApiMethod.IMAGE_SIZE,
      args: [filePath],
    })
  }

  static async getImageUrl(msg: RawMessage) {
    const isPrivateImage = msg.chatType !== ChatType.group
    const msgElement = msg.elements.find((e) => !!e.picElement)
    if (!msgElement) {
      return ''
    }
    const url = msgElement.picElement.originImageUrl // 没有域名
    const md5HexStr = msgElement.picElement.md5HexStr
    const fileMd5 = msgElement.picElement.md5HexStr
    const fileUuid = msgElement.picElement.fileUuid
    if (url) {
      if (url.startsWith('/download')) {
        // console.log('rkey', rkey);
        if (url.includes('&rkey=')) {
          return IMAGE_HTTP_HOST_NT + url
        }

        if (!hookApi.isAvailable()) {
          log('hookApi is not available')
          return ''
        }

        const saveRKey = (rkey: string) => {
          if (isPrivateImage) {
            privateImageRKey = rkey
          } else {
            groupImageRKey = rkey
          }
          lastGetRKeyTime = Date.now()
        }

        const refreshRKey = async () => {
          log('获取图片rkey...')
          NTQQFileApi.downloadMedia(
            msg.msgId,
            msg.chatType,
            msg.peerUid,
            msgElement.elementId,
            '',
            msgElement.picElement.sourcePath,
            true,
          )
            .then()
            .catch(() => {})
          await sleep(1000)
          const _rkey = hookApi.getRKey()
          if (_rkey) {
            log('图片rkey获取成功', _rkey)
            saveRKey(_rkey)
            return _rkey
          }
        }

        const existsRKey = isPrivateImage ? privateImageRKey : groupImageRKey
        if (Date.now() - lastGetRKeyTime > rkeyExpireTime || !existsRKey) {
          // rkey过期
          const newRKey = await refreshRKey()
          if (newRKey) {
            return IMAGE_HTTP_HOST_NT + url + `${newRKey}`
          } else {
            log('图片rkey获取失败', url)
            return ''
          }
        }
        // 使用未过期的rkey
        if (existsRKey) {
          return IMAGE_HTTP_HOST_NT + url + `${existsRKey}`
        }
      } else {
        // 老的图片url，不需要rkey
        return IMAGE_HTTP_HOST + url
      }
    } else if (fileMd5 || md5HexStr) {
      // 没有url，需要自己拼接
      return `${IMAGE_HTTP_HOST}/gchatpic_new/0/0-0-${(fileMd5 || md5HexStr)!.toUpperCase()}/0`
    }
    log('图片url获取失败', msg)
    return ''
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
      timeoutSecond: 300,
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
