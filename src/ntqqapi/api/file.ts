import {callNTQQApi, GeneralCallResult, NTQQApiClass, NTQQApiMethod} from "../ntcall";
import {
  CacheFileList,
  CacheFileListItem,
  CacheFileType,
  CacheScanResult,
  ChatCacheList,
  ChatCacheListItemBasic,
  ChatType,
  ElementType, IMAGE_HTTP_HOST, IMAGE_HTTP_HOST_NT, RawMessage
} from "../types";
import path from "path";
import fs from "fs";
import {ReceiveCmdS} from "../hook";
import {log} from "../../common/utils/log";
import http from "http";
import {sleep} from "../../common/utils";
import {hookApi} from "../external/moehook/hook";

export class NTQQFileApi {
  static async getFileType(filePath: string) {
    return await callNTQQApi<{ ext: string }>({
      className: NTQQApiClass.FS_API, methodName: NTQQApiMethod.FILE_TYPE, args: [filePath]
    })
  }

  static async getFileMd5(filePath: string) {
    return await callNTQQApi<string>({
      className: NTQQApiClass.FS_API,
      methodName: NTQQApiMethod.FILE_MD5,
      args: [filePath]
    })
  }

  static async copyFile(filePath: string, destPath: string) {
    return await callNTQQApi<string>({
      className: NTQQApiClass.FS_API,
      methodName: NTQQApiMethod.FILE_COPY,
      args: [{
        fromPath: filePath,
        toPath: destPath
      }]
    })
  }

  static async getFileSize(filePath: string) {
    return await callNTQQApi<number>({
      className: NTQQApiClass.FS_API, methodName: NTQQApiMethod.FILE_SIZE, args: [filePath]
    })
  }

  // 上传文件到QQ的文件夹
  static async uploadFile(filePath: string, elementType: ElementType = ElementType.PIC, elementSubType: number = 0) {
    const md5 = await NTQQFileApi.getFileMd5(filePath);
    let ext = (await NTQQFileApi.getFileType(filePath))?.ext
    if (ext) {
      ext = "." + ext
    } else {
      ext = ""
    }
    let fileName = `${path.basename(filePath)}`;
    if (fileName.indexOf(".") === -1) {
      fileName += ext;
    }
    const mediaPath = await callNTQQApi<string>({
      methodName: NTQQApiMethod.MEDIA_FILE_PATH,
      args: [{
        path_info: {
          md5HexStr: md5,
          fileName: fileName,
          elementType: elementType,
          elementSubType,
          thumbSize: 0,
          needCreate: true,
          downloadType: 1,
          file_uuid: ""
        }
      }]
    })
    log("media path", mediaPath)
    await NTQQFileApi.copyFile(filePath, mediaPath);
    const fileSize = await NTQQFileApi.getFileSize(filePath);
    return {
      md5,
      fileName,
      path: mediaPath,
      fileSize,
      ext
    }
  }

  static async downloadMedia(msgId: string, chatType: ChatType, peerUid: string, elementId: string, thumbPath: string, sourcePath: string, force: boolean = false) {
    // 用于下载收到的消息中的图片等
    if (sourcePath && fs.existsSync(sourcePath)) {
      if (force){
        fs.unlinkSync(sourcePath)
      }
      else{
        return sourcePath
      }
    }
    const apiParams = [
      {
        getReq: {
          fileModelId: "0",
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
      cmdCB: (payload: { notifyInfo: { filePath: string, msgId: string } }) => {
        log("media 下载完成判断", payload.notifyInfo.msgId, msgId);
        return payload.notifyInfo.msgId == msgId;
      }
    })
    return sourcePath
  }

  static async getImageSize(filePath: string) {
    return await callNTQQApi<{ width: number, height: number }>({
      className: NTQQApiClass.FS_API, methodName: NTQQApiMethod.IMAGE_SIZE, args: [filePath]
    })
  }

  static async getImageUrl(msg: RawMessage) {
    const msgElement = msg.elements.find(e => !!e.picElement);
    if (!msgElement) {
      return '';
    }
    const url = msgElement.picElement.originImageUrl;  // 没有域名
    const md5HexStr = msgElement.picElement.md5HexStr;
    const fileMd5 = msgElement.picElement.md5HexStr;
    const fileUuid = msgElement.picElement.fileUuid;
    let imageUrl = '';
    // let currentRKey = "CAQSKAB6JWENi5LMk0kc62l8Pm3Jn1dsLZHyRLAnNmHGoZ3y_gDZPqZt-64"
    if (url) {
      if (url.startsWith('/download')) {
        // console.log('rkey', rkey);
        if (url.includes('&rkey=')) {
          imageUrl = IMAGE_HTTP_HOST_NT + url;
        } else {
          if (!hookApi.isAvailable()) {
            log('hookApi is not available');
            return '';
          }
          let rkey = hookApi.getRKey();
          const refreshRKey = async () => {
            log('正在获取图片rkey...');
            NTQQFileApi.downloadMedia(msg.msgId, msg.chatType, msg.peerUid, msgElement.elementId, '', msgElement.picElement.sourcePath, true).then().catch(() => {
            });
            await sleep(300);
            rkey = hookApi.getRKey();
            if (rkey) {
              log('图片rkey获取成功', rkey);
            }
          };
          if (!rkey) {
            // 下载一次图片获取rkey
            try {
              await refreshRKey();
            } catch (e) {
              log('获取图片rkey失败', e);
              return '';
            }
          }
          imageUrl = IMAGE_HTTP_HOST_NT + url + `${rkey}`;
          // 调用head请求获取图片rkey是否正常
          const checkUrl = new Promise((resolve, reject) => {
            const uri = new URL(imageUrl);
            const options = {
              method: 'GET',
              host: uri.host,
              path: uri.pathname + uri.search,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
                'Accept': '*/*',
                'Range': 'bytes=0-0'
              }
            };
            const req = http.request(options, (res) => {
              console.log(`Check rkey status: ${res.statusCode}`);
              console.log(`Check rkey headers: ${JSON.stringify(res.headers)}`);
              if (res.statusCode == 200 || res.statusCode === 206) {
                // console.log('The image URL is accessible.');
                resolve('ok');
              } else {
                reject('The image URL is not accessible.');
              }
            });

            req.setTimeout(3000, () => {
              req.destroy();
              reject('Check rkey request timed out');
            });

            req.on('error', (e) => {
              console.error(`Problem with rkey request: ${e.message}`);
              reject(e.message);
            });
            req.end();
          });
          try {
            const start = Date.now();
            await checkUrl;
            const end = Date.now();
            console.log('Check rkey request time:', end - start);
          } catch (e) {
            try {
              await refreshRKey();
              imageUrl = IMAGE_HTTP_HOST_NT + url + `${rkey}`;
            } catch (e) {
              log('获取rkey失败', e);
            }
          }
        }
      } else {
        imageUrl = IMAGE_HTTP_HOST + url;
      }
    } else if (fileMd5 || md5HexStr) {
      imageUrl = `${IMAGE_HTTP_HOST}/gchatpic_new/0/0-0-${(fileMd5 || md5HexStr)!.toUpperCase()}/0`;
    }

    return imageUrl;
  }

}

export class NTQQFileCacheApi {
  static async setCacheSilentScan(isSilent: boolean = true) {
    return await callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.CACHE_SET_SILENCE,
      args: [{
        isSilent
      }, null]
    });
  }

  static getCacheSessionPathList() {
    return callNTQQApi<{
      key: string,
      value: string
    }[]>({
      className: NTQQApiClass.OS_API,
      methodName: NTQQApiMethod.CACHE_PATH_SESSION,
    });
  }

  static clearCache(cacheKeys: Array<string> = ['tmp', 'hotUpdate']) {
    return callNTQQApi<any>({ // TODO: 目前还不知道真正的返回值是什么
      methodName: NTQQApiMethod.CACHE_CLEAR,
      args: [{
        keys: cacheKeys
      }, null]
    });
  }

  static addCacheScannedPaths(pathMap: object = {}) {
    return callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.CACHE_ADD_SCANNED_PATH,
      args: [{
        pathMap: {...pathMap},
      }, null]
    });
  }

  static scanCache() {
    callNTQQApi<GeneralCallResult>({
      methodName: ReceiveCmdS.CACHE_SCAN_FINISH,
      classNameIsRegister: true,
    }).then();
    return callNTQQApi<CacheScanResult>({
      methodName: NTQQApiMethod.CACHE_SCAN,
      args: [null, null],
      timeoutSecond: 300,
    });
  }

  static getHotUpdateCachePath() {
    return callNTQQApi<string>({
      className: NTQQApiClass.HOTUPDATE_API,
      methodName: NTQQApiMethod.CACHE_PATH_HOT_UPDATE
    });
  }

  static getDesktopTmpPath() {
    return callNTQQApi<string>({
      className: NTQQApiClass.BUSINESS_API,
      methodName: NTQQApiMethod.CACHE_PATH_DESKTOP_TEMP
    });
  }

  static getChatCacheList(type: ChatType, pageSize: number = 1000, pageIndex: number = 0) {
    return new Promise<ChatCacheList>((res, rej) => {
      callNTQQApi<ChatCacheList>({
        methodName: NTQQApiMethod.CACHE_CHAT_GET,
        args: [{
          chatType: type,
          pageSize,
          order: 1,
          pageIndex
        }, null]
      }).then(list => res(list))
        .catch(e => rej(e));
    });
  }

  static getFileCacheInfo(fileType: CacheFileType, pageSize: number = 1000, lastRecord?: CacheFileListItem) {
    const _lastRecord = lastRecord ? lastRecord : {fileType: fileType};

    return callNTQQApi<CacheFileList>({
      methodName: NTQQApiMethod.CACHE_FILE_GET,
      args: [{
        fileType: fileType,
        restart: true,
        pageSize: pageSize,
        order: 1,
        lastRecord: _lastRecord,
      }, null]
    })
  }

  static async clearChatCache(chats: ChatCacheListItemBasic[] = [], fileKeys: string[] = []) {
    return await callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.CACHE_CHAT_CLEAR,
      args: [{
        chats,
        fileKeys
      }, null]
    });
  }

}