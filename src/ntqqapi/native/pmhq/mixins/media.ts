import { Oidb, Media } from '@/ntqqapi/proto'
import { selfInfo } from '@/common/globalVars'
import { InferProtoModelInput } from '@saltify/typeproto'
import type { PMHQBase } from '../base'
import { calculateTriSha1, getMd5BufferFromFile, getSha1BufferFromFile, readAndHash10M, uint32ToIPV4Addr } from '@/common/utils'
import { NTV2RichMedia } from '@/ntqqapi/helper/ntv2RichMedia'
import { ChatType } from '@/ntqqapi/types'
import { stat } from 'fs/promises'

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
      return `https://${download!.info.domain}${download!.info.urlPath}${download!.rKeyParam}`
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
      return `https://${download!.info.domain}${download!.info.urlPath}${download!.rKeyParam}`
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
      return `https://${download!.info.domain}${download!.info.urlPath}${download!.rKeyParam}`
    }

    async getHighwaySession() {
      const data = Media.HighwaySessionReq.encode({
        reqBody: {
          uin: 0,
          idcId: 0,
          appid: 16,
          loginSigType: 1,
          requestFlag: 3,
          serviceTypes: [1, 5, 10, 21],
          field9: 2,
          field10: 9,
          field11: 8,
          version: '1.0.1',
        },
      })
      const res = await this.httpSendPB('HttpConn.0x6ff_501', data)
      const { rspBody } = Media.HighwaySessionResp.decode(Buffer.from(res.pb, 'hex'))
      const highwayHostAndPorts: Record<number, { host: string, port: number }[]> = {}
      for (const srvAddr of rspBody.addrs) {
        const addresses: { host: string, port: number }[] = []
        for (const addr of srvAddr.addrs) {
          const ip = uint32ToIPV4Addr(addr.ip)
          const port = addr.port
          addresses.push({ host: ip, port })
        }
        highwayHostAndPorts[srvAddr.serviceType] = addresses
      }
      return {
        highwayHostAndPorts,
        sigSession: rspBody.sigSession,
      }
    }

    async getGroupVideoUploadInfo(groupCode: string, filePath: string, thumbFilePath: string) {
      const peer = {
        chatType: ChatType.Group,
        peerUid: groupCode,
        guildId: ''
      }
      const body = await NTV2RichMedia.buildUploadReq(
        peer,
        { type: 'video', filePath },
        {
          video: {
            pbReserve: Buffer.from([0x80, 0x01, 0x00])
          }
        },
        [[100, { type: 'image', filePath: thumbFilePath }]]
      )
      const data = Oidb.Base.encode({ command: 0x11ea, subCommand: 100, body })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x11ea_100', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload.msgInfo,
        compat: upload.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload),
        subExt: NTV2RichMedia.generateExt(upload, upload.subFileInfos[0]),
      }
    }

    async getC2CVideoUploadInfo(peerUid: string, filePath: string, thumbFilePath: string) {
      const peer = {
        chatType: ChatType.C2C,
        peerUid,
        guildId: ''
      }
      const body = await NTV2RichMedia.buildUploadReq(
        peer,
        { type: 'video', filePath },
        {
          video: {
            pbReserve: Buffer.from([0x80, 0x01, 0x00])
          }
        },
        [[100, { type: 'image', filePath: thumbFilePath }]]
      )
      const data = Oidb.Base.encode({ command: 0x11e9, subCommand: 100, body })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x11e9_100', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload.msgInfo,
        compat: upload.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload),
        subExt: NTV2RichMedia.generateExt(upload, upload.subFileInfos[0]),
      }
    }

    async getGroupFileUploadInfo(groupCode: string, filePath: string, fileName: string, parentFolderId: string) {
      const fileSize = (await stat(filePath)).size
      const md5 = await getMd5BufferFromFile(filePath)
      const body = Oidb.GroupFileReq.encode({
        uploadFileReq: {
          groupCode: +groupCode,
          appId: 7,
          busId: 102,
          entrance: 6,
          parentFolderId,
          fileName,
          fileSize,
          sha: await getSha1BufferFromFile(filePath),
          md5,
        },
      })
      const data = Oidb.Base.encode({ command: 0x6d6, subCommand: 0, body })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x6d6_0', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { uploadFileRsp } = Oidb.GroupFileResp.decode(oidbRespBody)
      return {
        fileExist: uploadFileRsp.fileExist,
        fileId: uploadFileRsp.fileId,
        fileKey: uploadFileRsp.fileKey,
        checkKey: uploadFileRsp.checkKey,
        addr: {
          ip: uploadFileRsp.uploadIp,
          port: uploadFileRsp.uploadPort,
        },
        fileSize,
        md5,
      }
    }

    async getC2CFileUploadInfo(peerUid: string, filePath: string, fileName: string) {
      const fileSize = (await stat(filePath)).size
      const md510MCheckSum = await readAndHash10M(filePath)
      const sha1CheckSum = await getSha1BufferFromFile(filePath)
      const md5CheckSum = await getMd5BufferFromFile(filePath)
      const sha3CheckSum = await calculateTriSha1(filePath, fileSize)
      const body = Oidb.OfflineFileUploadReq.encode({
        command: 1700,
        seq: 0,
        upload: {
          senderUid: selfInfo.uid,
          receiverUid: peerUid,
          fileSize,
          fileName,
          md510MCheckSum,
          sha1CheckSum,
          localPath: '/',
          md5CheckSum,
          sha3CheckSum,
        },
        businessId: 3,
        clientType: 1,
        flagSupportMediaPlatform: 1,
      })
      const data = Oidb.Base.encode({ command: 0xe37, subCommand: 1700, body })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0xe37_1700', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Oidb.OfflineFileUploadResp.decode(oidbRespBody)
      return {
        isExist: upload.fileExist,
        fileId: upload.uuid,
        uploadKey: upload.mediaPlatformUploadKey,
        rtpMediaPlatformUploadAddress: upload.rtpMediaPlatformUploadAddress.map(
          addr => [uint32ToIPV4Addr(addr.innerIp), addr.innerPort] as [string, number]
        ),
        crcMedia: upload.fileIdCrc,
        fileSize,
        md510MCheckSum,
        sha1CheckSum,
        md5CheckSum,
        sha3CheckSum,
      }
    }
  }
}
