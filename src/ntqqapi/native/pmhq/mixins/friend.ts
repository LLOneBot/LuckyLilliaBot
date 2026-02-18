import { Oidb } from '@/ntqqapi/proto'
import type { PMHQBase } from '../base'

export function FriendMixin<T extends new (...args: any[]) => PMHQBase>(Base: T) {
  return class extends Base {
    async sendFriendPoke(uin: number) {
      const body = Oidb.SendPokeReq.encode({
        toUin: uin,
        friendUin: uin,
      })
      const data = Oidb.Base.encode({
        command: 0xed3,
        subCommand: 1,
        body,
      })
      return await this.wsSendPB('OidbSvcTrpcTcp.0xed3_1', data)
    }

    async getPrivateFileUrl(receiverUid: string, fileUuid: string) {
      const body = Oidb.GetPrivateFileReq.encode({
        subCommand: 1200,
        field2: 1,
        body: {
          receiverUid,
          fileUuid,
          type: 2,
          t2: 0,
        },
        field101: 3,
        field102: 103,
        field200: 1,
        field99999: Buffer.from([0xc0, 0x85, 0x2c, 0x01]),
      })
      const data = Oidb.Base.encode({
        command: 0xe37,
        subCommand: 1200,
        body,
      })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0xe37_1200', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const file = Oidb.GetPrivateFileResp.decode(oidbRespBody)
      const { download } = file.body.result.extra
      const { fileName } = file.body.metadata
      return {
        state: file.body.state,
        url: `https://${download.downloadDns}/ftn_handler/${download.downloadUrl.toString('hex')}/?fname=${encodeURIComponent(fileName)}`
      }
    }
  }
}
