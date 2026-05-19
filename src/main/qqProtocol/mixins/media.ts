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

    async getGroupVideoUrl(node: any, groupId = 0) {
      // BuildDownloadReq 传 entity.MsgInfo.MsgInfoBody[0].Index 整个 IndexNode
      // 不能只传 fileUuid，否则 server 报 file does not exist
      const indexNode = typeof node === 'string'
        ? { fileUuid: node, storeID: 1, uploadTime: 0, expire: 0, type: 0 }
        : node
      const body = Media.NTV2RichMediaReq.encode({
        reqHead: {
          common: { requestId: 1, command: 200 },
          scene: { requestType: 2, businessType: 2, field103: 0, sceneType: 2, group: { groupId } },
          client: { agentType: 2 },
        },
        download: { node: indexNode },
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
      // 老版本（wrapper 模式）写法：loginSigType=1，不传 loginSigTicket
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

    async getGroupVideoUploadInfo(groupCode: string, filePath: string, thumbFilePath: string, duration: number = 0, width: number = 0, height: number = 0) {
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
        [[100, { type: 'image', filePath: thumbFilePath }]]
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

    async getC2CVideoUploadInfo(peerUid: string, filePath: string, thumbFilePath: string, duration: number = 0, width: number = 0, height: number = 0) {
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
        [[100, { type: 'image', filePath: thumbFilePath }]]
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

    async getGroupImageUploadInfo(groupCode: string, filePath: string) {
      const peer = {
        chatType: ChatType.Group,
        peerUid: groupCode,
        guildId: ''
      }
      const body = await NTV2RichMedia.buildUploadReq(
        peer,
        { type: 'image', filePath },
        {
          pic: {
            summary: '[图片]',
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

    async getC2CImageUploadInfo(peerUid: string, filePath: string) {
      const peer = {
        chatType: ChatType.C2C,
        peerUid,
        guildId: ''
      }
      const body = await NTV2RichMedia.buildUploadReq(
        peer,
        { type: 'image', filePath },
        {
          pic: {
            summary: '[图片]',
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
      const body = Oidb.FlashFileSetIdByCodeReq.encode({ body: { code } })
      const data = Oidb.Base.encode({ command: 0x93eb, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x93eb_1', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`getFlashFileSetIdByCode failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileSetIdByCodeResp.decode(Buffer.from(decoded.body))
      return resp.body?.fileSetId ?? ''
    }

    /** 闪传：取 fileSet 基本信息 (OidbSvcTrpcTcp.0x93d3_1) */
    async getFlashFileInfo(fileSetId: string) {
      const body = Oidb.FlashFileInfoReq.encode({ body: { fileSetId, field2: 1 } })
      const data = Oidb.Base.encode({ command: 0x93d3, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x93d3_1', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`getFlashFileInfo failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileInfoResp.decode(Buffer.from(decoded.body))
      return resp.body?.info
    }

    /** 闪传：取 fileSet 中文件列表 (OidbSvcTrpcTcp.0x93d4_1) */
    async getFlashFileList(fileSetId: string) {
      const body = Oidb.FlashFileListReq.encode({
        body: {
          fileSetId,
          paging: {
            cookie: Buffer.alloc(0),
            field2: 1,
            count: 18,
            field4: Buffer.alloc(0),
            flags1: { field1: 0 },
            flags2: { field1: 0, field2: 0 },
          },
          field3: 1,
        },
      })
      const data = Oidb.Base.encode({ command: 0x93d4, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x93d4_1', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`getFlashFileList failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileListResp.decode(Buffer.from(decoded.body))
      return resp.body?.result?.files ?? []
    }

    /** 闪传：发起下载（OidbSvcTrpcTcp.0x93d1_1） */
    async downloadFlashFile(fileSetId: string, sceneType: number = 6) {
      const body = Oidb.FlashFileDownloadReq.encode({ body: { fileSetId, sceneType } })
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
     * + 0x12a9_100/103 highway 上传 + 0x93d1_1 finalize 才能把实际文件放进 fileSet。 */
    async createFlashFileSet(opts: { title: string, subtitle?: string, totalFileCount: number, totalFileSize: number, uploaderUin: string, uploaderNick: string, uploaderUid: string }) {
      const body = Oidb.CreateFlashFileSetReq.encode({
        body: {
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
          },
          field3: 1,
        },
      })
      const data = Oidb.Base.encode({ command: 0x93cf, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x93cf_1', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`createFlashFileSet failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.CreateFlashFileSetResp.decode(Buffer.from(decoded.body))
      return resp.body
    }

    /** 闪传：登记单个文件元数据 (OidbSvcTrpcTcp.0x93d0_1) */
    async registerFlashFile(fileSetId: string, file: { fileUuid: string, name: string, fileSize: number }) {
      const body = Oidb.RegisterFlashFileReq.encode({
        body: {
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
            field7: 26,
            name: file.name,
            name2: file.name,
            field10: 0,
            fileSize: file.fileSize,
            field12: 0,
            field24: Buffer.alloc(0),
          },
          field5: 1,
          field6: 1,
        },
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
        body: { fileSetId, field2: Buffer.alloc(0) },
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
     * 当前实现只支持秒传命中场景；返回 highway 信息时 caller 需要调用 highway 上传。 */
    async flashFileUploadPreflight(opts: { fileSize: number, sha1Hex: string, name: string, requestId: number }) {
      const body = Oidb.FlashFileUploadPreReq.encode({
        head: {
          common: { requestId: opts.requestId, command: 100 },
          scene: { requestType: 2, businessType: 4, field103: 22, sceneType: 5 },
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
      return {
        retCode: resp.head?.retCode ?? '',
        // 秒传命中时 uKey 通常为空（直接进入 commit 阶段）；非空则需 highway 上传
        uKey: resp.body?.uKey ?? '',
      }
    }

    /** 闪传：upload commit (OidbSvcTrpcTcp.0x12a9_103) — 在 preflight 秒传命中后立即调用 */
    async flashFileUploadCommit(opts: { fileSize: number, sha1Hex: string, name: string, token: string, time: number, ttl: number, requestId: number }) {
      const body = Oidb.FlashFileUploadCommitReq.encode({
        head: {
          common: { requestId: opts.requestId, command: 103 },
          scene: { requestType: 2, businessType: 4, field103: 22, sceneType: 5 },
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
  }
}
