import { Oidb } from '@/ntqqapi/proto'
import { selfInfo } from '@/common/globalVars'
import type { PMHQBase } from '../base'

export function GroupMixin<T extends new (...args: any[]) => PMHQBase>(Base: T) {
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
      return await this.wsSendPB('OidbSvcTrpcTcp.0xed3_1', data)
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
      return await this.httpSendPB('OidbSvcTrpcTcp.0x8fc_2', data)
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
      await this.httpSendPB('OidbSvcTrpcTcp.0xeb7_1', data)
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
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x6d6_2', data)
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
            description: true,
            question: true,
            richDescription: true,
            announcement: true,
          },
          config2: {
            remark: true,
          },
        },
      })
      const data = Oidb.Base.encode({
        command: 0xfe5,
        subCommand: 2,
        body,
      })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0xfe5_2', data)
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
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x6d8_1', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.GetGroupFileListResp.decode(oidbRespBody)
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
      await this.httpSendPB('OidbSvcTrpcTcp.0x5d6_1', data)
    }
  }
}
