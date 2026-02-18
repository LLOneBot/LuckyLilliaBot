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
  }
}
