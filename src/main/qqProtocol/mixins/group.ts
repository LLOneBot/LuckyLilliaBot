import { Action, Oidb } from '@/ntqqapi/proto'
import { selfInfo } from '@/common/globalVars'
import type { QQProtocolBase } from '../base'
import { randomInt } from 'node:crypto'
import { InferProtoModel } from '@saltify/typeproto'

export function GroupMixin<T extends new (...args: any[]) => QQProtocolBase>(Base: T) {
  return class extends Base {
    async sendGroupPoke(groupCode: number, memberUin: number) {
      const body = Oidb.SendPokeReq.encode({
        toUin: memberUin,
        groupCode,
      })
      const data = Oidb.Base.encode({
        command: 0xed3,
        subCommand: 1,
        body,
      })
      return await this.sendPB('OidbSvcTrpcTcp.0xed3_1', data)
    }

    async setSpecialTitle(groupCode: number, memberUid: string, title: string) {
      const body = Oidb.SetSpecialTitleReq.encode({
        groupCode,
        body: {
          targetUid: memberUid,
          uidName: title,
          specialTitle: title,
          expireTime: -1,
        },
      })
      const data = Oidb.Base.encode({
        command: 0x8fc,
        subCommand: 2,
        body,
      })
      return await this.sendPB('OidbSvcTrpcTcp.0x8fc_2', data)
    }

    async groupClockIn(groupCode: string) {
      const body = Oidb.GroupClockInReq.encode({
        body: {
          uin: selfInfo.uin,
          groupCode,
        },
      })
      const data = Oidb.Base.encode({
        command: 0xeb7,
        subCommand: 1,
        body,
      })
      await this.sendPB('OidbSvcTrpcTcp.0xeb7_1', data)
    }

    async getGroupFileUrl(groupCode: number, fileId: string) {
      const body = Oidb.GetGroupFileReq.encode({
        download: {
          groupCode,
          appId: 7,
          busId: 102,
          fileId,
        },
      })
      const data = Oidb.Base.encode({
        command: 0x6d6,
        subCommand: 2,
        body,
      })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x6d6_2', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { download } = Oidb.GetGroupFileResp.decode(oidbRespBody)
      return {
        clientWording: download.clientWording,
        url: `https://${download.downloadDns}/ftn_handler/${download.downloadUrl.toString('hex')}/?fname=`,
      }
    }

    async fetchGroups() {
      const body = Oidb.FetchGroupsReq.encode({
        config: {
          config1: {
            groupOwner: true,
            createdTime: true,
            memberMax: true,
            memberCount: true,
            groupName: true,
            topTime: true,
            groupShutupExpireTime: true,
            description: true,
            question: true,
            richDescription: true,
            announcement: true,
          },
          config2: {
            remark: true,
            personShutupExpireTime: true
          },
        },
      })
      const data = Oidb.Base.encode({
        command: 0xfe5,
        subCommand: 2,
        body,
      })
      const res = await this.sendPB('OidbSvcTrpcTcp.0xfe5_2', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.FetchGroupsResp.decode(oidbRespBody)
    }

    async getGroupFileList(groupCode: number, targetDirectory: string, startIndex: number, fileCount: number) {
      const body = Oidb.GetGroupFileListReq.encode({
        listReq: {
          groupCode,
          appId: 7,
          targetDirectory,
          fileCount,
          sortBy: 1,
          startIndex,
          field17: 2,
          field18: 0,
        },
      })
      const data = Oidb.Base.encode({
        command: 0x6d8,
        subCommand: 1,
        body,
      })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x6d8_1', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.GetGroupFileListResp.decode(oidbRespBody)
    }

    /** 群文件总数（OidbSvcTrpcTcp.0x6d8_2） */
    async getGroupFileCount(groupCode: number, busId: number = 6) {
      const body = Oidb.GetGroupFileCountReq.encode({
        countReq: { groupCode, appId: 7, busId },
      })
      const data = Oidb.Base.encode({ command: 0x6d8, subCommand: 2, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x6d8_2', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.GetGroupFileListResp.decode(oidbRespBody)
    }

    /** 群文件总空间 / 已用空间（OidbSvcTrpcTcp.0x6d8_3） */
    async getGroupFileSpace(groupCode: number) {
      const body = Oidb.GetGroupFileSpaceReq.encode({
        spaceReq: { groupCode, appId: 7 },
      })
      const data = Oidb.Base.encode({ command: 0x6d8, subCommand: 3, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x6d8_3', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.GetGroupFileListResp.decode(oidbRespBody)
    }

    /** 群文件 feed（0x6d9_4）—— upload 完成后调用，server 才会把文件作为聊天消息发到群里 */
    async feedGroupFile(groupCode: number, fileId: string, msgRandom: number, busId: number = 102) {
      const body = Oidb.GroupFileFeedReq.encode({
        feedsInfoReq: {
          groupCode,
          appId: 2,
          feedsInfoList: [{
            busId,
            fileId,
            msgRandom,
            feedFlag: 1,
          }],
        },
      })
      const data = Oidb.Base.encode({ command: 0x6d9, subCommand: 4, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x6d9_4', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      return Oidb.GroupFileFeedResp.decode(decoded.body)
    }

    /** 删除群文件，busId 一般为 102（v1 默认），fileId 是 list 接口返回的 fileId */
    async deleteGroupFile(groupCode: number, fileId: string, busId: number = 102) {
      const body = Oidb.GroupFileDeleteReq.encode({ delete: { groupCode, busId, fileId } })
      return await this.sendOidb(0x6d6, 3, body)
    }

    /** 移动群文件到另一目录 */
    async moveGroupFile(groupCode: number, fileId: string, parentDirectory: string, targetDirectory: string) {
      const body = Oidb.GroupFileMoveReq.encode({
        move: { groupCode, appId: 7, busId: 102, fileId, parentDirectory, targetDirectory },
      })
      return await this.sendOidb(0x6d6, 5, body)
    }

    /** 设置本地群备注（只自己看见，对群成员不可见） */
    async setGroupRemark(groupCode: number, remark: string) {
      const body = Oidb.GroupRemarkReq.encode({ body: { groupCode, targetRemark: remark } })
      return await this.sendOidb(0xf16, 1, body)
    }

    /** 创建群文件夹，rootDirectory 为父目录 id（根目录用 "/"） */
    async createGroupFolder(groupCode: number, folderName: string, rootDirectory: string = '/') {
      const body = Oidb.GroupFolderCreateReq.encode({ create: { groupCode, rootDirectory, folderName } })
      const data = Oidb.Base.encode({ command: 0x6d7, subCommand: 0, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x6d7_0', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      const inner = Oidb.GroupFolderCreateResp.decode(decoded.body)
      const create = inner.create
      return {
        retCode: create?.retCode ?? 0,
        retMsg: create?.retMsg ?? '',
        clientWording: create?.clientWording ?? '',
        folderId: create?.folderInfo?.folderId ?? '',
        folderName: create?.folderInfo?.folderName || folderName,
        folderPath: create?.folderInfo?.folderPath ?? '',
      }
    }

    /** 删除群文件夹（一定要空文件夹否则 server 拒绝） */
    async deleteGroupFolder(groupCode: number, folderId: string) {
      const body = Oidb.GroupFolderDeleteReq.encode({ delete: { groupCode, folderId } })
      return await this.sendOidb(0x6d7, 1, body)
    }

    /** 重命名群文件夹 */
    async renameGroupFolder(groupCode: number, folderId: string, newFolderName: string) {
      const body = Oidb.GroupFolderRenameReq.encode({ rename: { groupCode, folderId, newFolderName } })
      return await this.sendOidb(0x6d7, 2, body)
    }

    async setGroupPin(groupCode: number, isPinned: boolean) {
      let timestamp
      if (isPinned) {
        timestamp = Buffer.alloc(4)
        timestamp.writeInt32BE(Math.floor(Date.now() / 1000), 0)
      } else {
        timestamp = Buffer.alloc(0)
      }
      const body = Oidb.SetGroupPinReq.encode({
        field1: 0,
        field3: 11,
        info: {
          groupCode,
          field400: {
            field1: 13569,
            timestamp,
          },
        },
      })
      const data = Oidb.Base.encode({
        command: 0x5d6,
        subCommand: 1,
        body,
      })
      await this.sendPB('OidbSvcTrpcTcp.0x5d6_1', data)
    }

    async fetchGroup(groupCode: number) {
      const body = Oidb.FetchGroupReq.encode({
        random: randomInt(0, 0x7fffffff),
        config: {
          groupCode,
          flags: {
            ownerUid: true,
            groupCreateTime: true,
            maxMemberNum: true,
            memberNum: true,
            groupName: '',
            question: '',
            description: '',
            shutUpMeTimestamp: true,
          },
        },
      })
      const data = Oidb.Base.encode({
        command: 0x88d,
        subCommand: 14,
        body,
      })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x88d_14', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.FetchGroupResp.decode(oidbRespBody)
    }

    async fetchGroupMembers(groupCode: number, cookie?: Buffer) {
      const body = Oidb.FetchGroupMembersReq.encode({
        groupCode,
        field2: 5,
        field3: 2,
        body: {
          memberName: true,
          memberCard: true,
          level: true,
          specialTitle: true,
          joinTimestamp: true,
          lastMsgTimestamp: true,
          shutUpTimestamp: true,
          permission: true,
        },
        cookie,
      })
      const data = Oidb.Base.encode({
        command: 0xfe7,
        subCommand: 3,
        body,
      })
      const res = await this.sendPB('OidbSvcTrpcTcp.0xfe7_3', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.FetchGroupMembersResp.decode(oidbRespBody)
    }

    async kickGroupMember(groupCode: number, kickUids: string[], rejectSubsequentRequests: boolean, reason: string) {
      const body = Oidb.KickMemberReq.encode({
        groupCode,
        kickUids,
        rejectSubsequentRequests,
        reason,
      })
      return await this.sendOidb(0x8a0, 1, body)
    }

    async muteGroupMember(groupCode: number, memList: { uid: string, duration: number }[]) {
      const body = Oidb.MuteMemberReq.encode({
        groupCode,
        memCount: memList.length,
        memList,
      })
      return await this.sendOidb(0x1253, 1, body)
    }

    async muteAllGroupMembers(groupCode: number, isMute: boolean) {
      const body = Oidb.MuteAllMembersReq.encode({
        groupCode,
        body: { duration: isMute ? 0xffffffff : 0 },
      })
      return await this.sendOidb(0x89a, 0, body)
    }

    async setGroupName(groupCode: number, name: string) {
      const body = Oidb.SetGroupNameReq.encode({
        groupCode,
        body: { name },
      })
      return await this.sendOidb(0x89a, 15, body)
    }

    async setGroupMemberCard(groupCode: number, memberUid: string, card: string) {
      const body = Oidb.SetMemberCardReq.encode({
        groupCode,
        body: [{ targetUid: memberUid, card }],
      })
      return await this.sendOidb(0x8fc, 3, body)
    }

    async setGroupMemberAdmin(groupCode: number, memberUid: string, isSet: boolean) {
      const body = Oidb.SetMemberAdminReq.encode({
        groupCode,
        memberUid,
        isSet,
      })
      return await this.sendOidb(0x1096, 1, body)
    }

    async leaveGroup(groupCode: number) {
      const body = Oidb.LeaveGroupReq.encode({ groupCode })
      return await this.sendOidb(0x1097, 1, body)
    }

    /** operation: 1=accept, 2=reject, 3=ignore */
    async handleGroupRequest(sequence: bigint, eventType: number, groupCode: number, operation: number, message = '', filtered = false) {
      const body = Oidb.HandleGroupRequestReq.encode({
        operation,
        body: { sequence, eventType, groupCode, message },
      })
      const subCommand = filtered ? 2 : 1
      return await this.sendOidb(0x10c8, subCommand, body)
    }

    /** isAdd: true=设精华, false=取消精华 */
    async setGroupEssence(groupCode: number, msgSequence: number, msgRandom: number, isAdd: boolean) {
      const body = Oidb.GroupEssenceReq.encode({ groupCode, msgSequence, msgRandom })
      const subCommand = isAdd ? 1 : 2
      return await this.sendOidb(0xeac, subCommand, body)
    }

    /** type: 1=face(QQ表情)，2=emoji(unicode)。默认按 code 长度推断（≤3 当 face，否则 emoji） */
    async setGroupReaction(groupCode: number, sequence: number, code: string, isAdd: boolean, type?: number) {
      const finalType = type ?? (code.length <= 3 ? 1 : 2)
      const body = Oidb.GroupReactionReq.encode({ groupCode, sequence, code, type: finalType })
      const subCommand = isAdd ? 1 : 2
      return await this.sendOidb(0x9082, subCommand, body)
    }

    /** filtered: true=拉过滤掉的通知（来自陌生人的入群申请等） */
    async fetchGroupNotifies(count: number, filtered: boolean, startSequence?: bigint) {
      const body = Oidb.FetchGroupNotifiesReq.encode({ count, startSequence })
      const subCommand = filtered ? 2 : 1
      const data = Oidb.Base.encode({ command: 0x10c0, subCommand, body })
      const res = await this.sendPB(`OidbSvcTrpcTcp.0x10c0_${subCommand}`, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.FetchGroupNotifiesResp.decode(oidbRespBody)
    }

    async getGroupRecommendContactArk(groupCode: number) {
      const body = Oidb.GetGroupRecommendContactArkReq.encode({
        field1: 1,
        groupCode,
        field5: 1,
      })
      const data = Oidb.Base.encode({
        command: 0x8b7,
        subCommand: 5,
        body,
      })
      const res = await this.sendPB(`OidbSvcTrpcTcp.0x8b7_5`, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.GetGroupRecommendContactArkResp.decode(oidbRespBody)
    }

    async setGroupMsgMask(groupCode: number, selfUid: string, msgMask: number) {
      const body = Oidb.SetGroupMsgMaskReq.encode({
        body: {
          groupCode,
          setting: {
            selfUid,
            msgMask,
          },
          field3: 1,
          field4: 2,
        },
      })
      const data = Oidb.Base.encode({
        command: 0xa80,
        subCommand: 1,
        body,
      })
      const res = await this.sendPB(`OidbSvcTrpcTcp.0xa80_1`, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.SetGroupMsgMaskResp.decode(oidbRespBody)
    }

    async transGroupFile(groupCode: number, fileId: string) {
      const body = Oidb.TransGroupFileReq.encode({
        body: {
          groupCode,
          busId: 102,
          fileId,
        },
      })
      const data = Oidb.Base.encode({
        command: 0x6d9,
        subCommand: 0,
        body,
      })
      const res = await this.sendPB(`OidbSvcTrpcTcp.0x6d9_0`, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.TransGroupFileResp.decode(oidbRespBody)
    }

    /** 拉群相册列表 (QunAlbum.trpc.qzone.webapp_qun_media.QunMedia.GetAlbumList) */
    async fetchGroupAlbumList(groupCode: number) {
      const ts = new Date()
      const pad = (n: number, w = 2) => n.toString().padStart(w, '0')
      const sessionId = `_${pad(ts.getMonth() + 1)}${pad(ts.getDate())}${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}${pad(ts.getMilliseconds(), 3)}_${randomInt(10000, 99999)}`
      const reqBytes = Action.GetAlbumListReq.encode({
        field1: 0,
        field2: Buffer.alloc(0),
        field3: Buffer.alloc(0),
        body: { groupCode: String(groupCode), albumId: Buffer.alloc(0) },
        sessionId,
        headers: [{ name: 'fc-appid', value: '100' }],
      })
      const res = await this.sendPB('QunAlbum.trpc.qzone.webapp_qun_media.QunMedia.GetAlbumList', reqBytes)
      return Action.GetAlbumListResp.decode(Buffer.from(res.pb, 'hex'))
    }

    /** 重命名群文件 (OidbSvcTrpcTcp.0x6d6_4) */
    async renameGroupFile(groupCode: number, fileId: string, parentDirectory: string, newFileName: string, busId = 102) {
      const body = Oidb.RenameGroupFileReq.encode({
        rename: { groupCode, busId, fileId, parentDirectory, newFileName },
      })
      const data = Oidb.Base.encode({ command: 0x6d6, subCommand: 4, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x6d6_4', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      return { errorCode: decoded.errorCode, errorMsg: decoded.errorMsg }
    }

    private genQunAlbumSession(): string {
      const ts = new Date()
      const pad = (n: number, w = 2) => n.toString().padStart(w, '0')
      return `_${pad(ts.getMonth() + 1)}${pad(ts.getDate())}${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}${pad(ts.getMilliseconds(), 3)}_${randomInt(10000, 99999)}`
    }

    /** 创建群相册 (QunAlbum.AddAlbum) */
    async createGroupAlbum(groupCode: number, name: string, desc: string) {
      const reqBytes = Action.AddAlbumReq.encode({
        requestId: randomInt(1, 0x7fffffff),
        field2: Buffer.alloc(0),
        field3: Buffer.alloc(0),
        body: { info: { groupCode: String(groupCode), name, desc, field5: 0 } },
        sessionId: this.genQunAlbumSession(),
        headers: [{ name: 'fc-appid', value: '100' }],
      })
      const res = await this.sendPB('QunAlbum.trpc.qzone.webapp_qun_media.QunMedia.AddAlbum', reqBytes)
      return Action.AddAlbumResp.decode(Buffer.from(res.pb, 'hex'))
    }

    /** 删群相册 (QunAlbum.DeleteAlbum) */
    async deleteGroupAlbum(groupCode: number, albumId: string) {
      const reqBytes = Action.DeleteAlbumReq.encode({
        requestId: randomInt(1, 0x7fffffff),
        field2: Buffer.alloc(0),
        field3: Buffer.alloc(0),
        body: { groupCode: String(groupCode), albumId },
        sessionId: this.genQunAlbumSession(),
        headers: [{ name: 'fc-appid', value: '100' }],
      })
      await this.sendPB('QunAlbum.trpc.qzone.webapp_qun_media.QunMedia.DeleteAlbum', reqBytes)
    }

    /** 拉群相册媒体列表 (QunAlbum.GetMediaList) */
    async fetchGroupAlbumMediaList(groupCode: number, albumId: string) {
      const reqBytes = Action.GetMediaListReq.encode({
        field1: 0,
        field2: Buffer.alloc(0),
        field3: Buffer.alloc(0),
        body: {
          groupCode: String(groupCode),
          albumId,
          field3: 0,
          field4: Buffer.alloc(0),
          field5: Buffer.alloc(0),
        },
        sessionId: this.genQunAlbumSession(),
        headers: [{ name: 'fc-appid', value: '100' }],
      })
      const res = await this.sendPB('QunAlbum.trpc.qzone.webapp_qun_media.QunMedia.GetMediaList', reqBytes)
      return Action.GetMediaListResp.decode(Buffer.from(res.pb, 'hex'))
    }

    async fetchGroupAtAllRemain(uin: number, groupCode: number) {
      const body = Oidb.FetchGroupAtAllRemainReq.encode({
        subCmd: 1,
        limitIntervalTypeForUin: 2,
        limitIntervalTypeForGroup: 1,
        uin,
        groupCode
      })
      const data = Oidb.Base.encode({ command: 0x8a7, subCommand: 0, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x8a7_0', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.FetchGroupAtAllRemainResp.decode(oidbRespBody)
    }
  }
}
