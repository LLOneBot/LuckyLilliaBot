import { Oidb, Media } from '@/ntqqapi/proto'
import { selfInfo } from '@/common/globalVars'
import { InferProtoModelInput } from '@saltify/typeproto'
import type { PMHQBase } from '../base'

export function MediaMixin<T extends new (...args: any[]) => PMHQBase>(Base: T) {
  return class extends Base {
    async getRKey() {
      const hexStr = '08e7a00210ca01221c0a130a05080110ca011206a80602b006011a02080122050a030a1400'
      const data = Buffer.from(hexStr, 'hex')
      const resp = await this.wsSendPB('OidbSvcTrpcTcp.0x9067_202', data)
      const rkeyBody = Oidb.Base.decode(Buffer.from(resp.pb, 'hex')).body
      const rkeyItems = Oidb.GetRKeyResp.decode(rkeyBody).result!.rkeyItems!
      return {
        privateRKey: rkeyItems[0].rkey!,
        groupRKey: rkeyItems[1].rkey!,
        expiredTime: rkeyItems[0].createTime! + rkeyItems[0].ttlSec!,
      }
    }

    async getGroupImageUrl(groupId: number, node: InferProtoModelInput<typeof Media.IndexNode>) {
      const body = Media.NTV2RichMediaReq.encode({
        reqHead: {
          common: { requestId: 1, command: 200 },
          scene: { requestType: 2, businessType: 1, sceneType: 2, group: { groupId } },
          client: { agentType: 2 },
        },
        download: { node },
      })
      const data = Oidb.Base.encode({ command: 0x11c4, subCommand: 200, body })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x11c4_200', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { download } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return `https://${download?.info?.domain}${download?.info?.urlPath}${download?.rKeyParam}`
    }

    async getC2cImageUrl(node: InferProtoModelInput<typeof Media.IndexNode>) {
      const body = Media.NTV2RichMediaReq.encode({
        reqHead: {
          common: { requestId: 1, command: 200 },
          scene: { requestType: 2, businessType: 1, sceneType: 1, c2c: { accountType: 2, targetUid: selfInfo.uid } },
          client: { agentType: 2 },
        },
        download: { node },
      })
      const data = Oidb.Base.encode({ command: 0x11c5, subCommand: 200, body })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x11c5_200', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { download } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return `https://${download?.info?.domain}${download?.info?.urlPath}${download?.rKeyParam}`
    }

    async getPrivatePttUrl(fileUuid: string) {
      const body = Media.NTV2RichMediaReq.encode({
        reqHead: {
          common: { requestId: 1, command: 200 },
          scene: { requestType: 1, businessType: 3, field103: 0, sceneType: 1, c2c: { accountType: 2, targetUid: selfInfo.uid } },
          client: { agentType: 2 },
        },
        download: { node: { fileUuid, storeID: 1, uploadTime: 0, expire: 0, type: 0 } },
      })
      const data = Oidb.Base.encode({ command: 0x126d, subCommand: 200, body })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x126d_200', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { download } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return `https://${download?.info?.domain}${download?.info?.urlPath}${download?.rKeyParam}`
    }

    async getGroupPttUrl(fileUuid: string) {
      const body = Media.NTV2RichMediaReq.encode({
        reqHead: {
          common: { requestId: 1, command: 200 },
          scene: { requestType: 1, businessType: 3, field103: 0, sceneType: 2, group: { groupId: 0 } },
          client: { agentType: 2 },
        },
        download: { node: { fileUuid, storeID: 1, uploadTime: 0, expire: 0, type: 0 } },
      })
      const data = Oidb.Base.encode({ command: 0x126e, subCommand: 200, body })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x126e_200', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { download } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return `https://${download.info.domain}${download.info.urlPath}${download.rKeyParam}`
    }

    async getGroupVideoUrl(fileUuid: string) {
      const body = Media.NTV2RichMediaReq.encode({
        reqHead: {
          common: { requestId: 1, command: 200 },
          scene: { requestType: 2, businessType: 2, field103: 0, sceneType: 2, group: { groupId: 0 } },
          client: { agentType: 2 },
        },
        download: { node: { fileUuid, storeID: 1, uploadTime: 0, expire: 0, type: 0 } },
      })
      const data = Oidb.Base.encode({ command: 0x11ea, subCommand: 200, body })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x11ea_200', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { download } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return `https://${download.info.domain}${download.info.urlPath}${download.rKeyParam}`
    }

    async getPrivateVideoUrl(fileUuid: string) {
      const body = Media.NTV2RichMediaReq.encode({
        reqHead: {
          common: { requestId: 1, command: 200 },
          scene: { requestType: 2, businessType: 2, field103: 0, sceneType: 1, c2c: { accountType: 2, targetUid: selfInfo.uid } },
          client: { agentType: 2 },
        },
        download: { node: { fileUuid, storeID: 1, uploadTime: 0, expire: 0, type: 0 } },
      })
      const data = Oidb.Base.encode({ command: 0x11e9, subCommand: 200, body })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x11e9_200', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { download } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return `https://${download.info.domain}${download.info.urlPath}${download.rKeyParam}`
    }
  }
}
