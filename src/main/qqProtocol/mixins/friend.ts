import { Action, Oidb } from '@/ntqqapi/proto'
import { selfInfo } from '@/common/globalVars'
import type { QQProtocolBase } from '../base'

export function FriendMixin<T extends new (...args: any[]) => QQProtocolBase>(Base: T) {
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
      return await this.sendPB('OidbSvcTrpcTcp.0xed3_1', data)
    }

    /**
     * 取私聊文件下载 url。field 10 是 query 发起者自己的 uid（PMHQ 抓包验过）。
     */
    async getPrivateFileUrl(fileUuid: string) {
      const body = Oidb.GetPrivateFileReq.encode({
        subCommand: 1200,
        field2: 1,
        body: {
          receiverUid: selfInfo.uid,
          fileUuid,
          type: 2,
          fileHash: '',
          t2: 0,
        },
        field101: 3,
        field102: 1,
        field200: 1,
        field99999: Buffer.from([0xc0, 0x85, 0x2c, 0x01]),
      })
      const data = Oidb.Base.encode({
        command: 0xe37,
        subCommand: 1200,
        body,
      })
      const res = await this.sendPB('OidbSvcTrpcTcp.0xe37_1200', data)
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
      await this.sendPB('OidbSvcTrpcTcp.0xb5d_44', data)
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
      await this.sendPB('OidbSvcTrpcTcp.0xd72_0', data)
    }

    async fetchFriends(cookie?: Buffer) {
      const body = Oidb.IncPullReq.encode({
        reqCount: 500,
        cookie,
        flag: 1,
        requestBiz: [{
          bizType: 1,
          bizData: {
            extBusi: [102, 103, 20002, 20009, 20031, 20037, 27372, 27394]
          }
        }]
      })
      const data = Oidb.Base.encode({
        command: 0xfd4,
        subCommand: 1,
        body,
      })
      const res = await this.sendPB('OidbSvcTrpcTcp.0xfd4_1', data)
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
      const res = await this.sendPB('OidbSvcTrpcTcp.0x12b6_0', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.GetFriendRecommendContactArkResp.decode(oidbRespBody)
    }

    async setFriendRemark(uid: string, remark: string) {
      const body = Oidb.SetFriendRemarkReq.encode({
        uid,
        remark,
      })
      const data = Oidb.Base.encode({
        command: 0x10cc,
        subCommand: 1,
        body,
      })
      await this.sendPB('OidbSvcTrpcTcp.0x10cc_1', data)
    }

    async deleteFriend(targetUid: string, block: boolean, bothDelete: boolean) {
      const body = Oidb.DeleteFriendReq.encode({
        field1: {
          targetUid,
          field2: {
            field1: 130,
            field2: 109,
            field3: {
              field1: 8,
              field2: 8,
              field3: 50,
            },
          },
          block,
          bothDelete
        },
      })
      const data = Oidb.Base.encode({
        command: 0x126b,
        subCommand: 0,
        body,
      })
      await this.sendPB('OidbSvcTrpcTcp.0x126b_0', data)
    }

    async setFriendCategory(uid: string, categoryId: number) {
      const body = Oidb.SetFriendCategoryReq.encode({
        uid,
        categoryId,
      })
      const data = Oidb.Base.encode({
        command: 0x10eb,
        subCommand: 1,
        body,
      })
      await this.sendPB('OidbSvcTrpcTcp.0x10eb_1', data)
    }

    async fetchFriendRequests(selfUid: string, reqNum: number) {
      const body = Oidb.FetchFriendRequestsReq.encode({
        version: 1,
        type: 6,
        selfUid,
        startIndex: 0,
        reqNum,
        getFlag: 2,
        startTime: 0,
        needCommFriend: 1,
        field22: 1,
      })
      const data = Oidb.Base.encode({
        command: 0x5cf,
        subCommand: 11,
        body,
      })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x5cf_11', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.FetchFriendRequestsResp.decode(oidbRespBody)
    }

    async fetchFilteredFriendRequests(count: number) {
      const body = Oidb.FetchFilteredFriendRequestsReq.encode({
        field1: 1,
        field2: {
          count,
        },
      })
      const data = Oidb.Base.encode({
        command: 0xd69,
        subCommand: 0,
        body,
      })
      const res = await this.sendPB('OidbSvcTrpcTcp.0xd69_0', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.FetchFilteredFriendRequestsResp.decode(oidbRespBody)
    }

    async setFriendPin(friendUid: string, isPinned: boolean) {
      let timestamp
      if (isPinned) {
        timestamp = Buffer.alloc(4)
        timestamp.writeInt32BE(Math.floor(Date.now() / 1000), 0)
      } else {
        timestamp = Buffer.alloc(0)
      }
      const body = Oidb.SetFriendPinReq.encode({
        field1: 0,
        field3: 1,
        info: {
          friendUid,
          field400: {
            field1: 13578,
            timestamp,
          },
        },
      })
      const data = Oidb.Base.encode({
        command: 0x5d6,
        subCommand: 18,
        body,
      })
      await this.sendPB('OidbSvcTrpcTcp.0x5d6_18', data)
    }

    async getFriendLatestSequence(peerUid: string) {
      const data = Action.SsoGetPeerSeqReq.encode({
        peerUid
      })
      const res = await this.sendPB('trpc.msg.msg_svc.MsgService.SsoGetPeerSeq', data)
      return Action.SsoGetPeerSeqResp.decode(Buffer.from(res.pb, 'hex'))
    }
  }
}
