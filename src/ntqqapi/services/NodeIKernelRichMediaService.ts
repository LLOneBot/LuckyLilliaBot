import { GetFileListParam, Peer } from '../types'
import { GeneralCallResult } from './common'

export interface NodeIKernelRichMediaService {
  getVideoPlayUrlV2(peer: Peer, msgId: string, elemId: string, videoCodecFormat: number, exParams: { downSourceType: number, triggerType: number }): Promise<GeneralCallResult & {
    urlResult: {
      v4IpUrl: []
      v6IpUrl: []
      domainUrl: {
        url: string
        isHttps: boolean
        httpsDomain: string
      }[]
      videoCodecFormat: number
    }
  }>

  deleteGroupFolder(groupCode: string, folderId: string): Promise<GeneralCallResult & { groupFileCommonResult: { retCode: number, retMsg: string, clientWording: string } }>

  createGroupFolder(groupCode: string, folderName: string): Promise<GeneralCallResult & { resultWithGroupItem: { result: unknown, groupItem: unknown[] } }>

  getGroupFileList(groupCode: string, params: GetFileListParam): Promise<GeneralCallResult & {
    groupSpaceResult: {
      retCode: number
      retMsg: string
      clientWording: string
      totalSpace: number
      usedSpace: number
      allUpload: boolean
    }
  }>

  moveGroupFile(arg1: unknown, arg2: unknown, arg3: unknown, arg4: unknown, arg5: unknown): unknown

  deleteGroupFile(groupCode: string, params: Array<number>, files: Array<string>): Promise<GeneralCallResult & {
    transGroupFileResult: {
      result: unknown
      successFileIdList: Array<unknown>
      failFileIdList: Array<unknown>
    }
  }>
}

