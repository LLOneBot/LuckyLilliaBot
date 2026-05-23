import { Oidb } from '@/ntqqapi/proto'
import type { PMHQBase } from '../base'

export function FriendMixin<T extends new (...args: any[]) => PMHQBase>(Base: T) {
  return class extends Base {
    async sendFriendPoke(friendUin: number, toUin: number) {
      const body = Oidb.SendPokeReq.encode({
        toUin,
        friendUin,
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

    async setFriendRequest(targetUid: string, accept: number) {
      const body = Oidb.SetFriendRequestReq.encode({
        targetUid,
        accept,
      })
      const data = Oidb.Base.encode({
        command: 0xb5d,
        subCommand: 44,
        body,
      })
      await this.httpSendPB('OidbSvcTrpcTcp.0xb5d_44', data)
    }

    async setFilteredFriendRequestReq(selfUid: string, requestUid: string) {
      const body = Oidb.SetFilteredFriendRequestReq.encode({
        selfUid,
        requestUid,
      })
      const data = Oidb.Base.encode({
        command: 0xd72,
        subCommand: 0,
        body,
      })
      await this.httpSendPB('OidbSvcTrpcTcp.0xd72_0', data)
    }

    async fetchFriends() {
      const body = Oidb.IncPullReq.encode({
        reqCount: 500,
        flag: 1,
        requestBiz: [{
          bizType: 1,
          bizData: {
            extBusi: [102, 103, 20002, 20009, 20031, 20037, 27394]
          }
        }]
      })
      const data = Oidb.Base.encode({
        command: 0xfd4,
        subCommand: 1,
        body,
      })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0xfd4_1', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.IncPullResp.decode(oidbRespBody)
    }

    async getFriendRecommendContactArk(uin: number) {
      const body = Oidb.GetFriendRecommendContactArkReq.encode({
        uin,
        phoneNumber: '-',
        jumpUrl: `mqqapi://card/show_pslcard?src_type=internal&source=sharecard&version=1&uin=${uin}`,
      })
      const data = Oidb.Base.encode({
        command: 0x12b6,
        subCommand: 0,
        body,
      })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x12b6_0', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.GetFriendRecommendContactArkResp.decode(oidbRespBody)
    }
  }
}
