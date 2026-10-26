import { Oidb, Media } from '@/ntqqapi/proto'
import { Cmd } from '../direct-lib/cmd'
import { selfInfo } from '@/common/globalVars'
import { InferProtoModelInput } from '@saltify/typeproto'
import type { QQProtocolBase } from '../base'
import { calculateTriSha1, getMd5BufferFromFile, getSha1BufferFromFile, readAndHash10M, uint32ToIPV4Addr } from '@/common/utils'
import { NTV2RichMedia } from '@/ntqqapi/helper/ntv2RichMedia'
import { ChatType } from '@/ntqqapi/types'
import { stat } from 'fs/promises'

export function MediaMixin<T extends abstract new (...args: any[]) => QQProtocolBase>(Base: T) {
  abstract class Mixed extends Base {
    async getRKey() {
      const hexStr = '08e7a00210ca01221c0a130a05080110ca011206a80602b006011a02080122050a030a1400'
      const data = Buffer.from(hexStr, 'hex')
      const resp = await this.sendPB(Cmd.Media.GetRKey, data)
      const rkeyBody = Oidb.Base.decode(Buffer.from(resp.pb, 'hex')).body
      return Oidb.GetRKeyResp.decode(rkeyBody)
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
      const res = await this.sendPB(Cmd.Media.GetPrivatePttUrl, data)
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
      const res = await this.sendPB(Cmd.Media.GetGroupPttUrl, data)
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
      const res = await this.sendPB(Cmd.Media.GetGroupVideoUrl, data)
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
      const res = await this.sendPB(Cmd.Media.GetPrivateVideoUrl, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Media.NTV2RichMediaResp.decode(oidbRespBody)
    }

    // 手表群图是老式 customFace, 只有 md5: 不传 fileUuid 而是填 info (md5 / size / dims), server 按 md5 + groupId
    // 返回带 rkey 的 URL
    async getGroupImageDownloadUrl(groupCode: string, info: InferProtoModelInput<typeof Media.FileInfo>, fileUuid = '') {
      const body = Media.NTV2RichMediaReq.encode({
        reqHead: {
          common: { requestId: 1, command: 200 },
          scene: { requestType: 2, businessType: 1, field103: 0, sceneType: 2, group: { groupId: +groupCode } },
          client: { agentType: 2 },
        },
        download: { node: { info, fileUuid, storeID: 1, uploadTime: 0, expire: 0, type: 0 } },
      })
      const data = Oidb.Base.encode({ command: 0x11c4, subCommand: 200, body })
      const res = await this.sendPB(Cmd.Media.DownloadGroupImage, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Media.NTV2RichMediaResp.decode(oidbRespBody)
    }

    async getC2CImageDownloadUrl(peerUid: string, info: InferProtoModelInput<typeof Media.FileInfo>, fileUuid = '') {
      const body = Media.NTV2RichMediaReq.encode({
        reqHead: {
          common: { requestId: 1, command: 200 },
          scene: { requestType: 2, businessType: 1, field103: 0, sceneType: 1, c2c: { accountType: 2, targetUid: peerUid } },
          client: { agentType: 2 },
        },
        download: { node: { info, fileUuid, storeID: 1, uploadTime: 0, expire: 0, type: 0 } },
      })
      const data = Oidb.Base.encode({ command: 0x11c5, subCommand: 200, body })
      const res = await this.sendPB(Cmd.Media.DownloadC2CImage, data)
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
      const res = await this.sendPB(Cmd.Media.GetHighwaySession, data)
      const { rspBody } = Media.HighwaySessionResp.decode(Buffer.from(res.pb, 'hex'))
      const highwayHostAndPorts: Record<number, string[]> = {}
      for (const srvAddr of rspBody.addrs) {
        const addresses = []
        for (const addr of srvAddr.addrs) {
          const ip = uint32ToIPV4Addr(addr.ip)
          const port = addr.port
          addresses.push(`${ip}:${port}`)
        }
        highwayHostAndPorts[srvAddr.serviceType] = addresses
      }
      return {
        highwayHostAndPorts,
        sigSession: rspBody.sigSession,
      }
    }

    async notifyGroupVideoUploadCompleted(groupCode: string, msgInfoBytes: Buffer, clientRandomId: number) {
      // server 收到这个才会归档, 不然传上去的视频过一阵就失效
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
      const res = await this.sendPB(Cmd.Media.NotifyGroupVideoUploadCompleted, data)
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
      const res = await this.sendPB(Cmd.Media.NotifyGroupVideoUploadCompleted, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload!.msgInfo,
        compat: upload!.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload!),
        subExt: NTV2RichMedia.generateExt(upload!, upload!.subFileInfos[0]),
      }
    }

    async getC2CVideoUploadInfo(chatType: ChatType, peerUid: string, filePath: string, thumbFilePath: string, duration: number, width: number, height: number) {
      const peer = {
        chatType,
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
      const res = await this.sendPB(Cmd.Media.GetC2CVideoUploadInfo, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload!.msgInfo,
        compat: upload!.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload!),
        subExt: NTV2RichMedia.generateExt(upload!, upload!.subFileInfos[0]),
      }
    }

    async getGroupFileUploadInfo(groupCode: number, filePath: string, fileName: string, parentFolderId: string, busId: number) {
      const fileSize = (await stat(filePath)).size
      const md5 = await getMd5BufferFromFile(filePath)
      const body = Oidb.GroupFileReq.encode({
        uploadFileReq: {
          groupCode,
          appId: 7,
          busId,
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
      const res = await this.sendPB(Cmd.Media.GetGroupFileUploadInfo, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { uploadFileRsp } = Oidb.GroupFileResp.decode(oidbRespBody)
      return {
        ...uploadFileRsp,
        fileSize,
        md5,
      }
    }

    async getC2CFileUploadInfo(chatType: ChatType, peerUid: string, filePath: string, fileName: string) {
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
      const res = await this.sendPB(Cmd.Media.GetC2CFileUploadInfo, data)
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
          },
        },
      )
      const data = Oidb.Base.encode({ command: 0x11c4, subCommand: 100, body })
      const res = await this.sendPB(Cmd.Media.GetGroupImageUploadInfo, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload!.msgInfo,
        compat: upload!.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload!)
      }
    }

    async getC2CImageUploadInfo(chatType: ChatType, peerUid: string, filePath: string, width: number, height: number, summary: string, bizType: number) {
      const peer = {
        chatType,
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
          },
        },
      )
      const data = Oidb.Base.encode({ command: 0x11c5, subCommand: 100, body })
      const res = await this.sendPB(Cmd.Media.GetC2CImageUploadInfo, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload!.msgInfo,
        compat: upload!.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload!)
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
          },
        },
      )
      const data = Oidb.Base.encode({ command: 0x126e, subCommand: 100, body })
      const res = await this.sendPB(Cmd.Media.GetGroupPttUploadInfo, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload!.msgInfo,
        compat: upload!.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload!),
      }
    }

    async getC2CPttUploadInfo(chatType: ChatType, peerUid: string, filePath: string, duration: number) {
      const peer = { chatType, peerUid, guildId: '' }
      const body = await NTV2RichMedia.buildUploadReq(
        peer,
        { type: 'voice', filePath, duration },
        {
          ptt: {
            bytesPbReserve: Buffer.from([0x08, 0x00, 0x38, 0x00]),
            bytesGeneralFlags: Buffer.from([0x9a, 0x01, 0x07, 0xaa, 0x03, 0x04, 0x08, 0x08, 0x12, 0x00]),
          },
        },
      )
      const data = Oidb.Base.encode({ command: 0x126d, subCommand: 100, body })
      const res = await this.sendPB(Cmd.Media.GetC2CPttUploadInfo, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const { upload } = Media.NTV2RichMediaResp.decode(oidbRespBody)
      return {
        info: upload!.msgInfo,
        compat: upload!.compatQMsg,
        ext: NTV2RichMedia.generateExt(upload!),
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
      const res = await this.sendPB(Cmd.Media.ImageOcr, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.ImageOcrResp.decode(oidbRespBody)
    }

    async getFlashFileSetIdByCode(code: string): Promise<string> {
      const body = Oidb.FlashFileSetIdByCodeReq.encode({ code })
      const data = Oidb.Base.encode({ command: 0x93eb, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB(Cmd.Media.GetFlashFileSetIdByCode, data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`getFlashFileSetIdByCode failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileSetIdByCodeResp.decode(Buffer.from(decoded.body))
      return resp.fileSetId ?? ''
    }

    /** field2 = 7 跟 Windows QQ 重新分享时一致; 用 1 时自己的 fileset 拿到的字段更少 */
    async getFlashFileInfo(fileSetId: string) {
      const body = Oidb.FlashFileInfoReq.encode({ fileSetId, field2: 7 })
      const data = Oidb.Base.encode({ command: 0x93d3, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB(Cmd.Media.GetFlashFileInfo, data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`getFlashFileInfo failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileInfoResp.decode(Buffer.from(decoded.body))
      return resp.info
    }

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
        // 跟 Windows QQ 一样用 2: 用 1 (Linux QQ 的默认值) 时 server 不返回下载 token / URL / sha1 / md5
        field3: 2,
        field4: 1,
      })
      const data = Oidb.Base.encode({ command: 0x93d4, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB(Cmd.Media.GetFlashFileList, data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`getFlashFileList failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileListResp.decode(Buffer.from(decoded.body))
      return resp.result?.files ?? []
    }

    /** 跟 list 不同, 自己的 fileSet 也能拿到 sha1 / md5 / historyToken。是 Windows QQ "重新分享"的第一步 */
    async getFlashFileEntryFull(fileSetId: string, fileUuid: string) {
      const body = Oidb.FlashFileGetFileInfoReq.encode({ fileUuid, fileSetId, field3: 1 })
      const data = Oidb.Base.encode({ command: 0x93e5, subCommand: 4, body, isReserved: 1 })
      const res = await this.sendPB(Cmd.Media.GetFlashFileEntryFull, data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`getFlashFileEntryFull failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileGetFileInfoResp.decode(Buffer.from(decoded.body))
      return resp.wrap?.file
    }

    /** 名字像 download, 其实是上传 commit 之后 finalize fileSet (sceneType=6), 上传完必调 */
    async downloadFlashFile(fileSetId: string, sceneType: number = 6) {
      const body = Oidb.FlashFileDownloadReq.encode({ fileSetId, sceneType })
      const data = Oidb.Base.encode({ command: 0x93d1, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB(Cmd.Media.DownloadFlashFile, data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`downloadFlashFile failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      return { result: 0 }
    }

    /**
     * 上传的第一步, 之后还要 0x93d0_1 登记文件、0x93db_1 prep、0x12a9_100/103 上传、0x93d1_1 finalize。
     * field3: 20 普通上传, 21 重新分享 (实测没区别); 用 1 会被拒 (errorCode=100000)
     */
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
          // 抓包常量, 不带的话 prepFlashFileSet 被拒 (errorCode=100200)
          field24: { field2: 0, field3: Buffer.alloc(0) },
        },
        field3: opts.scene ?? 20,
      })
      const data = Oidb.Base.encode({ command: 0x93cf, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB(Cmd.Media.CreateFlashFileSet, data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`createFlashFileSet failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.CreateFlashFileSetResp.decode(Buffer.from(decoded.body))
      return resp
    }

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
          field7: 11, // 抓包常量
          name: file.name,
          name2: file.name,
          field10: 0,
          fileSize: file.fileSize,
          field12: 0,
          // sha1 / md5 必传, 不然之后 list 永远拿不到
          sha1Hex: file.sha1Hex,
          field24: Buffer.alloc(0),
          md5Hex: file.md5Hex,
        },
        field5: 1,
        field6: 1,
      })
      const data = Oidb.Base.encode({ command: 0x93d0, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB(Cmd.Media.RegisterFlashFile, data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`registerFlashFile failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      return { result: 0 }
    }

    async prepFlashFileSet(fileSetId: string) {
      const body = Oidb.PrepFlashFileSetReq.encode({
        fileSetId,
        field2: Buffer.alloc(0),
      })
      const data = Oidb.Base.encode({ command: 0x93db, subCommand: 1, body, isReserved: 1 })
      const res = await this.sendPB(Cmd.Media.PrepFlashFileSet, data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`prepFlashFileSet failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      return { result: 0 }
    }

    /**
     * server 已有同 sha1 的文件就秒传, 否则返回 highway uKey + IP, 由调用方上传。
     * field103: NT 客户端会做两遍 preflight + commit, 先 24 (图像类) 后 22 (通用)
     */
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
      const res = await this.sendPB(Cmd.Media.FlashFileUploadPreflight, data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`flashFileUploadPreflight failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FlashFileUploadResp.decode(Buffer.from(decoded.body))
      const summary = resp.body?.fastUploadInfo?.summary?.fileSummary
      return {
        retCode: resp.head?.retCode ?? '',
        // 秒传命中时为空, 非空要走 highway 上传
        uKey: resp.body?.uKey ?? '',
        token: summary?.token ?? '',
        time: summary?.time ?? 0,
        ttl: summary?.ttl ?? 0,
      }
    }

    /** fileSetId + fileUuid 必传: 漏了 server 照样返回 success, 但文件不挂到 fileset 上, fileset 卡在"待上传" */
    async flashFileUploadCommit(opts: { fileSize: number, sha1Hex: string, name: string, token: string, time: number, ttl: number, requestId: number, fileSetId: string, fileUuid: string, field103?: number, fileTypeFlag?: number }) {
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
          target: {
            fileSetId: opts.fileSetId,
            fileSetId2: opts.fileSetId,
            fileUuid: opts.fileUuid,
            field4: 1,
            field5: 0, field6: 0,
            fileTypeFlag: opts.fileTypeFlag ?? 11,
            field8: Buffer.alloc(0),
            field9: 0, field10: 0, field11: 0, field12: 0, field13: 0, field14: 0,
          },
        },
      })
      const data = Oidb.Base.encode({ command: 0x12a9, subCommand: 103, body })
      const res = await this.sendPB(Cmd.Media.FlashFileUploadCommitReport, data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`flashFileUploadCommit failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      return { result: 0 }
    }

    /** server 用 (fileSetId, fileUuid) 定位文件。URL 是 `https://${host}${path}${rkey}`, rkey 自带 & 前缀 */
    async flashFileDownloadUrl(opts: {
      fileSetId: string,
      fileUuid: string,
      fileName: string,
      fileSha1?: Buffer,
      fileMd5?: Buffer,
      fileSize?: number,
      fileId?: string,          // server 实测不依赖它
      fileTypeFlag?: number,    // = 11 跟 registerFlashFile.field7 一致
      requestId: number,
    }): Promise<{ host: string, path: string, port: number, rkey: string, ttl: number, fullUrl: string }> {
      const body = Oidb.FlashFileDownloadPreReq.encode({
        head: {
          common: { requestId: opts.requestId, command: 200 },
          // field103 决定 server 拼的 appid: 22 -> 14901 (普通文件), 23 -> 14903, 24 -> 14902
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
            // Windows 客户端的能力声明: server 只检查有没有, 不在意值
            capsBody: {
              field1: 0xfffffffe,
              field3: 0xffffffff,
              field5: 111,
              field6: { field1: 3409274228, field2: Buffer.alloc(0), field3: Buffer.alloc(0), field4: 0 },
            },
            smallFlag: { field1: 0 },
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
      const res = await this.sendPB(Cmd.Media.FlashFileUploadCommit, data)
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
  return Mixed
}
