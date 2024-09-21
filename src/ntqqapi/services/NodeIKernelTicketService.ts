import { GeneralCallResult } from './common'

export interface NodeIKernelTicketService {
  forceFetchClientKey(arg: string): Promise<GeneralCallResult & {
    url: string
    keyIndex: string
    clientKey: string
    expireTime: string
  }>
}
