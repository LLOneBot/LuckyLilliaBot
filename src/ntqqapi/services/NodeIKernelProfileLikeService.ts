import { BuddyProfileLikeReq } from '../types'
import { GeneralCallResult } from './common'
import { Dict } from 'cosmokit'

export interface NodeIKernelProfileLikeService {
  setBuddyProfileLike(...args: unknown[]): { result: number, errMsg: string, succCounts: number }

  getBuddyProfileLike(req: BuddyProfileLikeReq): Promise<GeneralCallResult & {
    info: {
      userLikeInfos: {
        uid: string
        time: string
        favoriteInfo: {
          total_count: number
          last_time: number
          today_count: number
          userInfos: Dict[]
        }
        voteInfo: Dict
      }[]
      friendMaxVotes: number
      start: number
    }
  }>
}
