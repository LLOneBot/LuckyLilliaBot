import { Oidb, Media } from '@/ntqqapi/proto'
import { selfInfo } from '@/common/globalVars'
import { InferProtoModelInput } from '@saltify/typeproto'
import type { QQProtocolBase } from '../base'
import { calculateTriSha1, getMd5BufferFromFile, getSha1BufferFromFile, readAndHash10M, uint32ToIPV4Addr } from '@/common/utils'
import { NTV2RichMedia } from '@/ntqqapi/helper/ntv2RichMedia'
import { ChatType } from '@/ntqqapi/types'
import { stat } from 'fs/promises'

export function MediaMixin<T extends new (...args: any[]) => QQProtocolBase>(Base: T) {
  return class extends Base {
    async getRKey() {
      const hexStr = '08e7a00210ca01221c0a130a05080110ca011206a80602b006011a02080122050a030a1400'
      const data = Buffer.from(hexStr, 'hex')
      const resp = await this.sendPB('OidbSvcTrpcTcp.0x9067_202', data)
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
      const res = await this.sendPB('OidbSvcTrpcTcp.0x11c4_200', data)
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
      const res = await this.sendPB('OidbSvcTrpcTcp.0x11c5_200', data)
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
      const res = await this.sendPB('OidbSvcTrpcTcp.0x126d_200', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Media.NTV2RichMediaResp.decode(oidbRespBody)
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
      const res = await this.sendPB('OidbSvcTrpcTcp.0x126e_200', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Media.NTV2RichMediaResp.decode(oidbRespBody)
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
      const res = await this.sendPB('OidbSvcTrpcTcp.0x11ea_200', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Media.NTV2RichMediaResp.decode(oidbRespBody)
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
      const res = await this.sendPB('OidbSvcTrpcTcp.0x11e9_200', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Media.NTV2RichMediaResp.decode(oidbRespBody)
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
      const res = await this.sendPB('HttpConn.0x6ff_501', data)
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

    async notifyGroupVideoUploadCompleted(groupCode: string, msgInfoBytes: Buffer, clientRandomId: number) {
      // 通知 server "视频字节已传完"——它收到才会真正归档；否则上传完字节短期可访问然后失效
      const body = Media.NTV2RichMediaReq.encode({
        reqHead: {
          common: { requestId: 1, command: 100 },
          scene: { requestType: 2, businessType: 2, sceneType: 2, group: { groupId: +groupCode } },
          client: { agentType: 2 },
        },
        uploadCompleted: {
          srvSendMsg: false,
          clientRandomId: BigInt(clientRandomId),
          msgInfo: msgInfoBytes,
          clientSeq: 0,
        },
      })
      const data = Oidb.Base.encode({ command: 0x11ea, subCommand: 100, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x11ea_100', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Media.NTV2RichMediaResp.decode(oidbRespBody)
    }

    async getGroupVideoUploadInfo(groupCode: string, filePath: string, thumbFilePath: string, duration: number, width: number, height: number) {
      const peer = {
        chatType: ChatType.Group,
        peerUid: groupCode,
        guildId: ''
      }
      const body = await NTV2RichMedia.buildUploadReq(
        peer,
        { type: 'video', filePath, duration, width, height },
        {
          video: {
            pbReserve: Buffer.from([0x80, 0x01, 0x00])
          }
        },
        [[100, { type: 'image', filePath: thumbFilePath, width, height }]]
      )
      const data = Oidb.Base.encode({ command: 0x11ea, subCommand: 100, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x11ea_100', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload.msgInfo,
        compat: upload.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload),
        subExt: NTV2RichMedia.generateExt(upload, upload.subFileInfos[0]),
      }
    }

    async getC2CVideoUploadInfo(peerUid: string, filePath: string, thumbFilePath: string, duration: number, width: number, height: number) {
      const peer = {
        chatType: ChatType.C2C,
        peerUid,
        guildId: ''
      }
      const body = await NTV2RichMedia.buildUploadReq(
        peer,
        { type: 'video', filePath, duration, width, height },
        {
          video: {
            pbReserve: Buffer.from([0x80, 0x01, 0x00])
          }
        },
        [[100, { type: 'image', filePath: thumbFilePath, width, height }]]
      )
      const data = Oidb.Base.encode({ command: 0x11e9, subCommand: 100, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x11e9_100', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload.msgInfo,
        compat: upload.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload),
        subExt: NTV2RichMedia.generateExt(upload, upload.subFileInfos[0]),
      }
    }

    async getGroupFileUploadInfo(groupCode: number, filePath: string, fileName: string, parentFolderId: string) {
      const fileSize = (await stat(filePath)).size
      const md5 = await getMd5BufferFromFile(filePath)
      const body = Oidb.GroupFileReq.encode({
        uploadFileReq: {
          groupCode,
          appId: 7,
          busId: 102,
          entrance: 6,
          parentFolderId,
          fileName,
          localPath: `/${fileName}`,
          fileSize,
          sha: await getSha1BufferFromFile(filePath),
          md5,
        },
      })
      const data = Oidb.Base.encode({ command: 0x6d6, subCommand: 0, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x6d6_0', data)
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
      const res = await this.sendPB('OidbSvcTrpcTcp.0xe37_1700', data)
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

    async getGroupImageUploadInfo(groupCode: string, filePath: string, width: number, height: number, summary: string, bizType: number) {
      const peer = {
        chatType: ChatType.Group,
        peerUid: groupCode,
        guildId: ''
      }
      const body = await NTV2RichMedia.buildUploadReq(
        peer,
        { type: 'image', filePath, width, height },
        {
          pic: {
            bizType,
            summary,
            bytesPbReserveC2c: Buffer.from([0x08, 0x00, 0x18, 0x00, 0x20, 0x00, 0x4A, 0x00, 0x50, 0x00, 0x62, 0x00, 0x92, 0x01, 0x00, 0x9A, 0x01, 0x00, 0xAA, 0x01, 0x0C, 0x08, 0x00, 0x12, 0x00, 0x18, 0x00, 0x20, 0x00, 0x28, 0x00, 0x3A, 0x00])
          }
        },
      )
      const data = Oidb.Base.encode({ command: 0x11c4, subCommand: 100, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x11c4_100', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload.msgInfo,
        compat: upload.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload)
      }
    }

    async getC2CImageUploadInfo(peerUid: string, filePath: string, width: number, height: number, summary: string, bizType: number) {
      const peer = {
        chatType: ChatType.C2C,
        peerUid,
        guildId: ''
      }
      const body = await NTV2RichMedia.buildUploadReq(
        peer,
        { type: 'image', filePath, width, height },
        {
          pic: {
            bizType,
            summary,
            bytesPbReserveC2c: Buffer.from([0x08, 0x00, 0x18, 0x00, 0x20, 0x00, 0x4A, 0x00, 0x50, 0x00, 0x62, 0x00, 0x92, 0x01, 0x00, 0x9A, 0x01, 0x00, 0xAA, 0x01, 0x0C, 0x08, 0x00, 0x12, 0x00, 0x18, 0x00, 0x20, 0x00, 0x28, 0x00, 0x3A, 0x00])
          }
        },
      )
      const data = Oidb.Base.encode({ command: 0x11c5, subCommand: 100, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x11c5_100', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload.msgInfo,
        compat: upload.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload)
      }
    }

    async getGroupPttUploadInfo(groupCode: string, filePath: string, duration: number) {
      const peer = { chatType: ChatType.Group, peerUid: groupCode, guildId: '' }
      const body = await NTV2RichMedia.buildUploadReq(
        peer,
        { type: 'voice', filePath, duration },
        {
          ptt: {
            bytesPbReserve: Buffer.from([0x08, 0x00, 0x38, 0x00]),
            bytesGeneralFlags: Buffer.from([0x9a, 0x01, 0x07, 0xaa, 0x03, 0x04, 0x08, 0x08, 0x12, 0x00]),
          } as any,
        },
      )
      const data = Oidb.Base.encode({ command: 0x126e, subCommand: 100, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x126e_100', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload.msgInfo,
        compat: upload.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload),
      }
    }

    async getC2CPttUploadInfo(peerUid: string, filePath: string, duration: number) {
      const peer = { chatType: ChatType.C2C, peerUid, guildId: '' }
      const body = await NTV2RichMedia.buildUploadReq(
        peer,
        { type: 'voice', filePath, duration },
        {
          ptt: {
            bytesPbReserve: Buffer.from([0x08, 0x00, 0x38, 0x00]),
            bytesGeneralFlags: Buffer.from([0x9a, 0x01, 0x07, 0xaa, 0x03, 0x04, 0x08, 0x08, 0x12, 0x00]),
          } as any,
        },
      )
      const data = Oidb.Base.encode({ command: 0x126d, subCommand: 100, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x126d_100', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload.msgInfo,
        compat: upload.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload),
      }
    }

    async imageOcr(imageUrl: string) {
      const body = Oidb.ImageOcrReq.encode({
        version: 1,
        client: 0,
        entrance: 1,
        ocrReqBody: {
          imageUrl,
          originMd5: '',
          afterCompressMd5: '',
          afterCompressFileSize: '',
          afterCompressWeight: '',
          afterCompressHeight: '',
          isCut: false
        }
      })
      const data = Oidb.Base.encode({ command: 0xe07, subCommand: 0, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0xe07_0', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.ImageOcrResp.decode(oidbRespBody)
    }

    /** 闪传：通过 share code 解析 fileSetId (OidbSvcTrpcTcp.0x93eb_1) */
    async getFlashFileSetIdByCode(code: string): Promise<string> {
      const body = Oidb.FlashFileSetIdByCodeReq.encode({ code })
      const data = Oidb.Base.encode({ command: 0x93eb, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x93eb_1', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`getFlashFileSetIdByCode failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileSetIdByCodeResp.decode(Buffer.from(decoded.body))
      return resp.fileSetId ?? ''
    }

    /** 闪传：取 fileSet 基本信息 (OidbSvcTrpcTcp.0x93d3_1)。
     * field2 = 7 对应 Windows QQ 重新分享时的 send (1 是早期值，对自己 fileset 拿的字段更少)。 */
    async getFlashFileInfo(fileSetId: string) {
      const body = Oidb.FlashFileInfoReq.encode({ fileSetId, field2: 7 })
      const data = Oidb.Base.encode({ command: 0x93d3, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x93d3_1', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`getFlashFileInfo failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileInfoResp.decode(Buffer.from(decoded.body))
      return resp.info
    }

    /** 闪传：取 fileSet 中文件列表 (OidbSvcTrpcTcp.0x93d4_1) */
    async getFlashFileList(fileSetId: string) {
      const body = Oidb.FlashFileListReq.encode({
        fileSetId,
        paging: {
          cookie: Buffer.alloc(0),
          field2: 1,
          count: 18,
          field4: Buffer.alloc(0),
          flags1: { field1: 0 },
          flags2: { field1: 0, field2: 0 },
        },
        // f3 = 2 是 Windows QQ 客户端的发法。f3 = 1 (Linux QQ 客户端默认值) server 只
        // 返 name/size 等基础字段，f13/f14 (download token + URL) / f20 (sha1) / f25 (md5) 都被剥空；
        // 用 f3 = 2 时 server 把完整字段都给回来，可以基于 list resp 直接拿到 download URL。
        field3: 2,
        field4: 1,
      })
      const data = Oidb.Base.encode({ command: 0x93d4, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x93d4_1', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`getFlashFileList failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileListResp.decode(Buffer.from(decoded.body))
      return resp.result?.files ?? []
    }

    /** 闪传：取单个老文件的完整元数据 (OidbSvcTrpcTcp.0x93e5_4)。
     * 跟 list (0x93d4_1) 不同——对 bot 自己 own 的 fileSet 也能拿到 sha1/md5/historyToken，
     * 没有 list 的 ownership 限制。是 Windows QQ "重新分享" 按钮的第一步。 */
    async getFlashFileEntryFull(fileSetId: string, fileUuid: string) {
      const body = Oidb.FlashFileGetFileInfoReq.encode({ fileUuid, fileSetId, field3: 1 })
      const data = Oidb.Base.encode({ command: 0x93e5, subCommand: 4, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x93e5_4', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`getFlashFileEntryFull failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileGetFileInfoResp.decode(Buffer.from(decoded.body))
      return resp.wrap?.file
    }

    /** 闪传：finalize fileSet 状态 (OidbSvcTrpcTcp.0x93d1_1)。
     * 名字看起来像 download，但抓包看 Windows QQ 是 commit 后用它 finalize fileset。
     * sceneType=6 是 finalize；上传完成必调，跟齐 Windows QQ 客户端流程。 */
    async downloadFlashFile(fileSetId: string, sceneType: number = 6) {
      const body = Oidb.FlashFileDownloadReq.encode({ fileSetId, sceneType })
      const data = Oidb.Base.encode({ command: 0x93d1, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x93d1_1', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`downloadFlashFile failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      return { result: 0 }
    }

    /** 闪传：创建 fileSet 并拿到 shareLink (OidbSvcTrpcTcp.0x93cf_1)。
     * 这只是 uploadFlashFile 多步流程的第一步——还需 0x93d0_1 注册文件 + 0x93db_1 prep
     * + 0x12a9_100/103 highway 上传 + 0x93d1_1 finalize 才能把实际文件放进 fileSet。
     *
     * field3 = 20 (普通上传)，21 (Windows QQ 重新分享场景；实测对 server 行为无区别)。
     * 用 1 server 直接拒 errorCode=100000 "加载失败，请稍后重试"。 */
    async createFlashFileSet(opts: { title: string, subtitle?: string, totalFileCount: number, totalFileSize: number, uploaderUin: string, uploaderNick: string, uploaderUid: string, scene?: number }) {
      const body = Oidb.CreateFlashFileSetReq.encode({
        totalFileCount: opts.totalFileCount,
        meta: {
          title: opts.title,
          subtitle: opts.subtitle ?? opts.title,
          field4: 1,
          totalFileSize: opts.totalFileSize,
          uploader: {
            uin: opts.uploaderUin,
            nickname: opts.uploaderNick,
            uid: opts.uploaderUid,
            field4: Buffer.alloc(0),
          },
          field16: 1,
          field20: 0,
          field21: 0,
          field23: 0,
          // PMHQ 抓的常量（meta.f24），不送 server 会拒 prepFlashFileSet (errorCode=100200)
          field24: { field2: 0, field3: Buffer.alloc(0) },
        },
        field3: opts.scene ?? 20,
      })
      const data = Oidb.Base.encode({ command: 0x93cf, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x93cf_1', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`createFlashFileSet failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.CreateFlashFileSetResp.decode(Buffer.from(decoded.body))
      return resp
    }

    /** 闪传：登记单个文件元数据 (OidbSvcTrpcTcp.0x93d0_1) */
    async registerFlashFile(fileSetId: string, file: { fileUuid: string, name: string, fileSize: number, sha1Hex?: string, md5Hex?: string }) {
      const body = Oidb.RegisterFlashFileReq.encode({
        field1: 1,
        fileSetId,
        fileSetIdEcho: fileSetId,
        file: {
          fileSetId,
          fileUuid: file.fileUuid,
          field3: 0,
          field4: Buffer.alloc(0),
          field5: 1,
          field6: 1,
          field7: 11, // PMHQ 抓的常量（之前写 26 是错的）
          name: file.name,
          name2: file.name,
          field10: 0,
          fileSize: file.fileSize,
          field12: 0,
          // sha1/md5 必传——不传 server 端 fileSet entry 不带这俩，后续 list 永远拿不到
          // (Windows QQ 抓包确认: f20=sha1Hex, f25=md5Hex)
          sha1Hex: file.sha1Hex,
          field24: Buffer.alloc(0),
          md5Hex: file.md5Hex,
        },
        field5: 1,
        field6: 1,
      })
      const data = Oidb.Base.encode({ command: 0x93d0, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x93d0_1', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`registerFlashFile failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      return { result: 0 }
    }

    /** 闪传：fileSet upload prep (OidbSvcTrpcTcp.0x93db_1) */
    async prepFlashFileSet(fileSetId: string) {
      const body = Oidb.PrepFlashFileSetReq.encode({
        fileSetId,
        field2: Buffer.alloc(0),
      })
      const data = Oidb.Base.encode({ command: 0x93db, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x93db_1', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`prepFlashFileSet failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      return { result: 0 }
    }

    /** 闪传：upload preflight (OidbSvcTrpcTcp.0x12a9_100)。
     * 若 server 已有同 sha1 的文件则返回成功（秒传），否则返回 highway uKey+IPs。
     * 当前实现只支持秒传命中场景；返回 highway 信息时 caller 需要调用 highway 上传。
     * field103: LLBot 实际会做两遍 preflight+commit，第一遍 24（图像类），第二遍 22（通用）。 */
    async flashFileUploadPreflight(opts: { fileSize: number, sha1Hex: string, name: string, requestId: number, field103?: number }) {
      const body = Oidb.FlashFileUploadPreReq.encode({
        head: {
          common: { requestId: opts.requestId, command: 100 },
          scene: { requestType: 2, businessType: 4, field103: opts.field103 ?? 22, sceneType: 5 },
          client: { agentType: 1 },
        },
        upload: {
          uploadInfo: {
            fileInfo: {
              fileSize: opts.fileSize,
              md5: Buffer.alloc(0),
              sha1: opts.sha1Hex,
              name: opts.name,
              fileType: { field1: 0, field2: 0, field3: 0, field4: 0 },
              width: 0,
              height: 0,
              field8: 0,
              field9: 1,
            },
            subFileType: 0,
          },
          tryFastUploadCompleted: true,
          srvSendMsg: false,
          clientRandomId: 0,
          compatQMsgSceneType: 0,
          extBizInfo: {
            field1: { field1: 0, field2: Buffer.alloc(0) },
          },
        },
      })
      const data = Oidb.Base.encode({ command: 0x12a9, subCommand: 100, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x12a9_100', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`flashFileUploadPreflight failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileUploadResp.decode(Buffer.from(decoded.body))
      const summary = resp.body?.fastUploadInfo?.summary?.fileSummary
      return {
        retCode: resp.head?.retCode ?? '',
        // 秒传命中时 uKey 通常为空（直接进入 commit 阶段）；非空则需 highway 上传
        uKey: resp.body?.uKey ?? '',
        // 秒传命中：返回 token 给 commit 用
        token: summary?.token ?? '',
        time: summary?.time ?? 0,
        ttl: summary?.ttl ?? 0,
      }
    }

    /** 闪传：upload commit (OidbSvcTrpcTcp.0x12a9_103) — 在 preflight 秒传命中后立即调用 */
    async flashFileUploadCommit(opts: { fileSize: number, sha1Hex: string, name: string, token: string, time: number, ttl: number, requestId: number, field103?: number }) {
      const body = Oidb.FlashFileUploadCommitReq.encode({
        head: {
          common: { requestId: opts.requestId, command: 103 },
          scene: { requestType: 2, businessType: 4, field103: opts.field103 ?? 22, sceneType: 5 },
          client: { agentType: 1 },
        },
        commit: {
          fileSummary: {
            fileInfo: {
              fileSize: opts.fileSize,
              md5: Buffer.alloc(0),
              sha1: opts.sha1Hex,
              name: opts.name,
              fileType: { field1: 0, field2: 0, field3: 0, field4: 0 },
              width: 0,
              height: 0,
              field8: 0,
              field9: 1,
            },
            token: opts.token,
            field3: 1,
            time: opts.time,
            ttl: opts.ttl,
            field6: 0,
          },
          field2: { field1: 2 },
          field3: { field1: 0, field2: 0 },
        },
      })
      const data = Oidb.Base.encode({ command: 0x12a9, subCommand: 103, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x12a9_103', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`flashFileUploadCommit failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      return { result: 0 }
    }

    /** 闪传：拿单个文件的下载 URL (OidbSvcTrpcTcp.0x12a9_200)。
     * 流程：fileSetId → getFlashFileList 拿到 file 的 fileUuid/sha1/name → 这里换 HTTPS URL。
     * server 用 (fileSetId, fileUuid) 真正定位文件（download.info.fileId 是历史 token，不传也行）。
     * 上层用 `https://${host}${path}${rkey}` 直接下载（rkey 已经带 & 前缀）。 */
    async flashFileDownloadUrl(opts: {
      fileSetId: string,
      fileUuid: string,         // 来自 getFlashFileList file.fileUuid
      fileName: string,
      fileSha1?: Buffer,
      fileMd5?: Buffer,
      fileSize?: number,
      fileId?: string,          // base64 token（可选；server 实测不依赖它）
      fileTypeFlag?: number,    // = 11 跟 registerFlashFile.field7 一致
      requestId: number,
    }): Promise<{ host: string, path: string, port: number, rkey: string, ttl: number, fullUrl: string }> {
      const body = Oidb.FlashFileDownloadPreReq.encode({
        head: {
          common: { requestId: opts.requestId, command: 200 },
          // field103 决定 server 拼的 appid: 22→14901(普通文件), 23→14903, 24→14902
          // 跟 PMHQ 抓 Windows QQ 闪传 download 一致
          scene: { requestType: 2, businessType: 4, field103: 22, sceneType: 5 },
          client: { agentType: 1 },
        },
        download: {
          info: {
            fileInfo: {
              fileSize: opts.fileSize ?? 0,
              md5: opts.fileMd5 ?? Buffer.alloc(0),
              sha1: opts.fileSha1 ?? Buffer.alloc(0),
              name: opts.fileName,
              fileType: { field1: 0, field2: 0, field3: 0, field4: 0 },
              width: 0,
              height: 0,
              field8: 0,
              field9: 0,
            },
            fileId: opts.fileId ?? '',
            field3: 0,
            field4: 0,
            field5: 0,
            field6: 0,
          },
          clientCaps: {
            // 抓包里这堆 placeholder 是 Windows 客户端的能力声明，server 校验它们存在但值不在意
            capsBody: {
              field1: 0xfffffffe,
              field3: 0xffffffff,
              field5: 111,
              field6: { field1: 3409274228, field2: Buffer.alloc(0), field3: Buffer.alloc(0), field4: 0 },
            },
            smallFlag: { field1: 0 },
            // 真正定位文件的字段
            target: {
              fileSetId: opts.fileSetId,
              fileUuid: opts.fileUuid,
              field3: opts.fileTypeFlag ?? 11,
              fileUuid2: opts.fileUuid,
            },
          },
          field3: 0,
        },
      })
      const data = Oidb.Base.encode({ command: 0x12a9, subCommand: 200, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x12a9_200', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`flashFileDownloadUrl failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileDownloadPreResp.decode(Buffer.from(decoded.body))
      const u = resp.body?.url
      if (!u || !u.host) {
        throw new Error('flashFileDownloadUrl: server did not return URL')
      }
      const fullUrl = `https://${u.host}${u.path}${resp.body!.rkey ?? ""}`
      return {
        host: u.host,
        path: u.path,
        port: u.port,
        rkey: resp.body!.rkey ?? '',
        ttl: resp.body!.ttl ?? 0,
        fullUrl,
      }
    }
  }
}
