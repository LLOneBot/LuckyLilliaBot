import { Oidb } from '@/ntqqapi/proto'
import type { PMHQBase } from '../base'

export function SystemMixin<T extends new (...args: any[]) => PMHQBase>(Base: T) {
  return class extends Base {
    async fetchPins() {
      const data = Oidb.Base.encode({
        command: 0x12b3,
        subCommand: 0,
        body: Buffer.alloc(0),
      })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x12b3_0', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.FetchPinsResp.decode(oidbRespBody)
    }
  }
}
