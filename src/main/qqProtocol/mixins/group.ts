import { Oidb } from '@/ntqqapi/proto'
import { selfInfo } from '@/common/globalVars'
import type { QQProtocolBase } from '../base'
import { randomInt } from 'node:crypto'

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

    /** 删除群文件，busId 一般为 102（v1 默认），fileId 是 list 接口返回的 fileId */
    async deleteGroupFile(groupCode: number, fileId: string, busId: number = 102) {
      const body = Oidb.GroupFileDeleteReq.encode({ delete: { groupCode, busId, fileId } })
      const data = Oidb.Base.encode({ command: 0x6d6, subCommand: 3, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x6d6_3', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`deleteGroupFile failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      return { result: 0 }
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

    async fetchGroupMembers(groupCode: number) {
      const all: any[] = []
      let cookie: Buffer | undefined = undefined
      while (true) {
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
        const decoded = Oidb.FetchGroupMembersResp.decode(oidbRespBody)
        all.push(...(decoded.members || []))
        if (!decoded.cookie || decoded.cookie.length === 0) break
        cookie = Buffer.from(decoded.cookie)
      }
      return all
    }

    async kickGroupMember(groupCode: number, memberUid: string, rejectSubsequentRequests = false, reason = '') {
      const body = Oidb.KickMemberReq.encode({
        groupCode,
        memberUid,
        rejectSubsequentRequests,
        reason,
      })
      return await this.sendOidb(0x8a0, 1, body)
    }

    async muteGroupMember(groupCode: number, memberUid: string, durationSec: number) {
      const body = Oidb.MuteMemberReq.encode({
        groupCode,
        type: 0,
        body: { targetUid: memberUid, duration: durationSec },
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
    async fetchGroupNotifies(count = 20, filtered = false) {
      const body = Oidb.FetchGroupNotifiesReq.encode({ count })
      const subCommand = filtered ? 2 : 1
      const data = Oidb.Base.encode({ command: 0x10c0, subCommand, body })
      const res = await this.sendPB(`OidbSvcTrpcTcp.0x10c0_${subCommand}`, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.FetchGroupNotifiesResp.decode(oidbRespBody)
    }

    /** 通过拉全成员然后本地过滤实现 searchMember */
    async searchGroupMember(groupCode: number, keyword: string) {
      const all = await this.fetchGroupMembers(groupCode)
      const lower = keyword.toLowerCase()
      return all.filter((m: any) => {
        const name = m.memberName?.toLowerCase() || ''
        const card = m.memberCard?.memberCard?.toLowerCase() || ''
        const uin = String(m.id?.uin || '')
        return name.includes(lower) || card.includes(lower) || uin.includes(keyword)
      })
    }
  }
}
