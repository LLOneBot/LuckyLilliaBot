import { GeneralCallResult } from './common'

export interface NodeIKernelTicketService {
  forceFetchClientKey(url: string): Promise<GeneralCallResult & {
    url: string
    keyIndex: string
    clientKey: string
    expireTime: string
  }>
}
