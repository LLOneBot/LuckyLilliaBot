import { GeneralCallResult } from './common'

export interface NodeIKernelRobotService {
  getRobotUinRange(req: {
    justFetchMsgConfig: string
    type: number
    version: number
    aioKeywordVersion: number
  }): Promise<GeneralCallResult & {
    response: {
      version: number
      robotUinRanges: {
        minUin: string
        maxUin: string
      }[]
    }
  }>
}
