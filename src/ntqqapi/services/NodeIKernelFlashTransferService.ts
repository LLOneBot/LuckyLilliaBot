import { GeneralCallResult } from '@/ntqqapi/services/common'
import { FlashFileInfo, FlashFileListItem, FlashFileSetInfo } from '@/ntqqapi/types/flashfile'
import { Dict } from 'cosmokit'

export interface NodeIKernelFlashTransferService {
  createFlashTransferUploadTask(seq: number, createParam: {
    scene: number,  // 1
    name: string,
    uploaders: Array<{
      uin: string,
      nickname: string,
      uid: string,
      sendEntrance: string // 可为空字符串
    }>,
    permission: Dict, // 可为空对象
    coverPath: string,  // 可为空字符串
    paths: string[],
    excludePaths: string[],
    expireLeftTime: number,  // 默认为 0
    isNeedDelExif: boolean,
    coverOriginalInfos: Array<{
      path: string, // 可为空字符串
      thumbnailPath: string // 可为空字符串
    }>,
    uploadSceneType: number // 1
  }): Promise<GeneralCallResult & {
    seq: number,
    createFlashTransferResult: {
      fileSetId: string,
      shareLink: string,
      expireTime: string,
      expireLeftTime: string
    }
  }>

  startFileSetDownload(fileSetId: string, sceneType: number, option: { isIncludeCompressInnerFiles: boolean }): Promise<GeneralCallResult & {
    extraInfo: number
  }>

  getFileList(req: {
    seq: number
    fileSetId: string
    isUseCache: boolean
    sceneType: number
    reqInfos: {
      count: number
      paginationInfo: Uint8Array
      parentId: string
      reqIndexPath: string
      reqDepth: number
      filterCondition: {
        fileCategory: number
        filterType: number
      },
      sortConditions: { sortField: number, sortOrder: number }[]
      isNeedPhysicalInfoReady: boolean
    }[]
  }): Promise<{
    rsp: {
      seq: number,
      result: number,
      errMs: string,
      fileLists: FlashFileListItem[]
    }
  }>

  getFileSetIdByCode(code: string): Promise<GeneralCallResult & {
    fileSetId: string
  }>

  getFileSet(req: {
    seq: number
    fileSetId: string
    isUseCache: boolean
    isNoReqSvr: boolean
    sceneType: number
  }): Promise<GeneralCallResult & {
    seq: number
    fileSet: FlashFileSetInfo
    isCache: boolean
  }>

  createMergeShareTask(seq: number, filesInfo: {
    fileSetId: string,
    shareFiles: Array<FlashFileInfo>,
    createSetParam: {
      scene: number
      name: string
      uploaders: Array<{
        uin: string
        nickname: string
        uid: string
        sendEntrance: string
      }>
      permission: Dict
      coverPath: string
      paths: string[]
      excludePaths: string[]
      expireLeftTime: number
      isNeedDelDeviceInfo: boolean
      isNeedDelLocation: boolean
      coverOriginalInfos: Array<{
        path: string
        thumbnailPath: string
      }>
      uploadSceneType: number
    }
  }): GeneralCallResult & {
    seq: number
    mergeFlashTransferResult: {
      fileSetId: string
      shareLink: string
      expireTime: string
      expireLeftTime: string
      hasCloudFile: boolean
    }
  }
}
