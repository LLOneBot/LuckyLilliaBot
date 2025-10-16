import { GeneralCallResult } from './common'

export interface NodeIKernelTipOffService {
  getPskey(domains: string[], isForNewPCQQ: boolean): Promise<GeneralCallResult & { domainPskeyMap: Map<string, string> }>
}
