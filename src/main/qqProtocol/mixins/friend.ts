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
      return await this.sendOidb(0xed3, 1, body)
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
      return Oidb.GetPrivateFileResp.decode(oidbRespBody)
    }

    async setFriendRequest(targetUid: string, accept: number) {
      const body = Oidb.SetFriendRequestReq.encode({
        targetUid,
        accept,
      })
      return await this.sendOidb(0xb5d, 44, body)
    }

    async setFilteredFriendRequestReq(selfUid: string, requestUid: string) {
      const body = Oidb.SetFilteredFriendRequestReq.encode({
        selfUid,
        requestUid,
      })
      return await this.sendOidb(0xd72, 0, body)
    }

    async fetchFriends(cookie?: Buffer) {
      const body = Oidb.IncPullReq.encode({
        reqCount: 500,
        cookie,
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
      return await this.sendOidb(0x10cc, 1, body)
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
      return await this.sendOidb(0x126b, 0, body)
    }

    async setFriendCategory(uid: string, categoryId: number) {
      const body = Oidb.SetFriendCategoryReq.encode({
        uid,
        categoryId,
      })
      return await this.sendOidb(0x10eb, 1, body)
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
      const oidbResp = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      return Oidb.FetchFriendRequestsResp.decode(oidbResp.body)
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
      return await this.sendOidb(0x5d6, 18, body)
    }

    /**
     * 拉取与某个**好友**之间的最新 c2cMsgSeq。
     *
     * server cmd: trpc.msg.msg_svc.MsgService.SsoGetPeerSeq
     * 入参：只接受 user uid（u_xxx 格式），不能传群 code（server 内部要把 peerUid 转 uin，
     *       群 code 转换失败会返回 "rsp uid convert to uin all fail"，全 0）。
     * 返回 (实测)：
     *   seq1, seq2 = 双端一致的 c2cMsgSeq；多数情况下相等，偶尔差 1（可能分别是发/收方向的最后一条）。
     *   latestMsgTime = 跟该 peer 最后一条消息的时间戳。
     *
     * 群聊场景请改用 fetchGroupExtra → info.results.latestMessageSeq（OidbSvcTrpcTcp.0x88d_0）。
     */
    async getFriendLatestSequence(peerUid: string) {
      const data = Action.SsoGetPeerSeqReq.encode({
        peerUid
      })
      const res = await this.sendPB('trpc.msg.msg_svc.MsgService.SsoGetPeerSeq', data)
      return Action.SsoGetPeerSeqResp.decode(Buffer.from(res.pb, 'hex'))
    }

    async getFriendsStatus(selfUid: string) {
      const body = Oidb.GetFriendsStatusReq.encode({
        selfUid,
        field5: 1,
        field7: 0,
        field100: 0,
        field101: 400
      })
      const data = Oidb.Base.encode({
        command: 0x116d,
        subCommand: 1,
        body,
      })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x116d_1', data)
      const oidbResp = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      return Oidb.GetFriendsStatusResp.decode(oidbResp.body)
    }
  }
}
