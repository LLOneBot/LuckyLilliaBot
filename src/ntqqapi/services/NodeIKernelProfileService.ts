import { SimpleInfo, ProfileBizType, UserDetailInfo, UserDetailSource } from '../types'
import { GeneralCallResult } from './common'

export interface NodeIKernelProfileService {
  getUidByUin(callFrom: string, uin: string[]): Promise<Map<string, string>>

  getUinByUid(callFrom: string, uid: string[]): Promise<Map<string, string>>

  getCoreAndBaseInfo(callFrom: string, uids: string[]): Promise<Map<string, SimpleInfo>>

  fetchUserDetailInfo(callFrom: string, uid: string[], source: UserDetailSource, bizList: ProfileBizType[]): Promise<GeneralCallResult & {
    source: UserDetailSource
    detail: Map<string, UserDetailInfo>
  }>

  setHeader(path: string): Promise<GeneralCallResult>

  getUserDetailInfoWithBizInfo(uid: string, biz: unknown[]): Promise<GeneralCallResult>

  getUserDetailInfoByUin(uin: string): Promise<GeneralCallResult & { detail: UserDetailInfo }>

  modifyDesktopMiniProfile(profile: unknown): Promise<GeneralCallResult>

  getUserSimpleInfo(force: boolean, uids: string[]): Promise<GeneralCallResult>
}
