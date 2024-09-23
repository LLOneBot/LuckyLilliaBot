import { SimpleInfo } from '../types'
import { GeneralCallResult } from './common'

export interface NodeIKernelProfileService {
  getUidByUin(callfrom: string, uin: Array<string>): Promise<Map<string, string>>

  getUinByUid(callfrom: string, uid: Array<string>): Promise<Map<string, string>>

  getCoreAndBaseInfo(callfrom: string, uids: string[]): Promise<Map<string, SimpleInfo>>

  fetchUserDetailInfo(trace: string, uids: string[], arg2: number, arg3: number[]): Promise<unknown>

  setHeader(arg: string): Promise<GeneralCallResult>

  getUserDetailInfoWithBizInfo(uid: string, biz: unknown[]): Promise<GeneralCallResult>

  getUserDetailInfoByUin(uin: string): Promise<unknown>
}
