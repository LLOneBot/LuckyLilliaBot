import { Action, Oidb } from '@/ntqqapi/proto'
import { Cmd } from '../direct-lib/cmd'
import { selfInfo } from '@/common/globalVars'
import type { QQProtocolBase } from '../base'

export function FriendMixin<T extends abstract new (...args: any[]) => QQProtocolBase>(Base: T) {
  abstract class Mixed extends Base {
    async sendFriendPoke(friendUin: number, toUin: number) {
      const body = Oidb.SendPokeReq.encode({
        toUin,
        friendUin,
      })
      return await this.sendOidb(0xed3, 1, body)
    }

    /** field 10 是发起者自己的 uid */
    async getPrivateFileUrl(receiverUid: string, fileUuid: string) {
      const body = Oidb.GetPrivateFileReq.encode({
        subCommand: 1200,
        field2: 1,
        body: {
          receiverUid,
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
      const res = await this.sendPB(Cmd.Friend.GetPrivateFileUrl, data)
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
      const res = await this.sendPB(Cmd.Friend.Fetch, data)
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
      const res = await this.sendPB(Cmd.Friend.GetRecommendContactArk, data)
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
      const res = await this.sendPB(Cmd.Friend.FetchRequests, data)
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
      const res = await this.sendPB(Cmd.Friend.FetchFilteredRequests, data)
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
     * 只接受好友 uid, 传群号回 "rsp uid convert to uin all fail"; 群用 fetchGroupExtra 的 latestMessageSeq。
     * seq1 / seq2 多数相等, 偶尔差 1 (可能分别是收发两个方向)
     */
    async getFriendLatestSequence(peerUid: string) {
      const data = Action.SsoGetPeerSeqReq.encode({
        peerUid
      })
      const res = await this.sendPB(Cmd.Message.GetPeerSeq, data)
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
      const res = await this.sendPB(Cmd.Friend.GetStatus, data)
      const oidbResp = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      return Oidb.GetFriendsStatusResp.decode(oidbResp.body)
    }
  }
  return Mixed
}
