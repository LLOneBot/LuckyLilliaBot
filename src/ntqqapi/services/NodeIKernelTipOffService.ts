import { GeneralCallResult } from './common'

export interface NodeIKernelTipOffService {
  getPskey(domainList: string[], nocache: boolean): Promise<GeneralCallResult & { domainPskeyMap: Map<string, string> }>
}
