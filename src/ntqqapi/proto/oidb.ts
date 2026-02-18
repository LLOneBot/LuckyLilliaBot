import { ProtoField, ProtoMessage } from '@saltify/typeproto'

export namespace Oidb {
  export const Base = ProtoMessage.of({
    command: ProtoField(1, 'uint32'),
    subCommand: ProtoField(2, 'uint32'),
    errorCode: ProtoField(3, 'uint32'),
    body: ProtoField(4, 'bytes'),
    errorMsg: ProtoField(5, 'string'),
    isReserved: ProtoField(12, 'uint32')
  })

  /** OidbSvcTrpcTcp.0xed3_1 */
  export const SendPokeReq = ProtoMessage.of({
    toUin: ProtoField(1, 'uint32'),
    groupCode: ProtoField(2, 'uint32'),
    friendUin: ProtoField(5, 'uint32')
  })

  /** OidbSvcTrpcTcp.0x8fc_2 */
  export const SetSpecialTitleReq = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    body: ProtoField(3, {
      targetUid: ProtoField(1, 'string'),
      specialTitle: ProtoField(5, 'string'),
      expireTime: ProtoField(6, 'int32'),
      uidName: ProtoField(7, 'string')
    })
  })

  export const GetRKeyResp = ProtoMessage.of({
    result: ProtoField(4, {
      rkeyItems: ProtoField(1, {
        rkey: ProtoField(1, 'string'),
        ttlSec: ProtoField(2, 'uint32'),
        storeId: ProtoField(3, 'uint32'),
        createTime: ProtoField(4, 'uint32'),
        type: ProtoField(5, 'uint32')
      }, 'repeated')
    })
  })

  /** OidbSvcTrpcTcp.0xfe1_2 */
  export const FetchUserInfoReq = ProtoMessage.of({
    uin: ProtoField(1, 'uint32'),
    field2: ProtoField(2, 'uint32'),
    keys: ProtoField(3, {
      key: ProtoField(1, 'uint32')
    }, 'repeated')
  })

  export const FetchUserInfoResp = ProtoMessage.of({
    body: ProtoField(1, {
      properties: ProtoField(2, {
        numberProperties: ProtoField(1, {
          key: ProtoField(1, 'uint32'),
          value: ProtoField(2, 'uint32')
        }, 'repeated'),
        bytesProperties: ProtoField(2, {
          key: ProtoField(1, 'uint32'),
          value: ProtoField(2, 'bytes')
        }, 'repeated')
      }),
      uin: ProtoField(3, 'uint32')
    })
  })

  /** OidbSvcTrpcTcp.0x929d_0 */
  export const FetchAiCharacterListReq = ProtoMessage.of({
    groupId: ProtoField(1, 'uint32'),
    chatType: ProtoField(2, 'uint32')
  })

  export const FetchAiCharacterListResp = ProtoMessage.of({
    property: ProtoField(1, {
      type: ProtoField(1, 'string'),
      characters: ProtoField(2, {
        characterId: ProtoField(1, 'string'),
        characterName: ProtoField(2, 'string'),
        previewUrl: ProtoField(3, 'string')
      }, 'repeated')
    }, 'repeated')
  })

  /** OidbSvcTrpcTcp.0x929b_0 */
  export const GetGroupGenerateAiRecordReq = ProtoMessage.of({
    groupId: ProtoField(1, 'uint32'),
    voiceId: ProtoField(2, 'string'),
    text: ProtoField(3, 'string'),
    chatType: ProtoField(4, 'uint32'),
    clientMsgInfo: ProtoField(5, {
      msgRandom: ProtoField(1, 'uint32')
    })
  })

  /** OidbSvcTrpcTcp.0x6d6_2 */
  export const GetGroupFileReq = ProtoMessage.of({
    download: ProtoField(3, {
      groupCode: ProtoField(1, 'uint32'),
      appId: ProtoField(2, 'uint32'),
      busId: ProtoField(3, 'uint32'),
      fileId: ProtoField(4, 'string')
    })
  })

  export const GetGroupFileResp = ProtoMessage.of({
    download: ProtoField(3, {
      clientWording: ProtoField(3, 'string'),
      downloadDns: ProtoField(5, 'string'),
      downloadUrl: ProtoField(6, 'bytes')
    })
  })

  /** OidbSvcTrpcTcp.0xe37_1200 */
  export const GetPrivateFileReq = ProtoMessage.of({
    subCommand: ProtoField(1, 'uint32'),
    field2: ProtoField(2, 'uint32'),
    body: ProtoField(14, {
      receiverUid: ProtoField(10, 'string'),
      fileUuid: ProtoField(20, 'string'),
      type: ProtoField(30, 'uint32'),
      fileHash: ProtoField(60, 'string'),
      t2: ProtoField(601, 'uint32')
    }),
    field101: ProtoField(101, 'uint32'),
    field102: ProtoField(102, 'uint32'),
    field200: ProtoField(200, 'uint32'),
    field99999: ProtoField(99999, 'bytes')
  })

  export const GetPrivateFileResp = ProtoMessage.of({
    command: ProtoField(1, 'uint32'),
    subCommand: ProtoField(2, 'uint32'),
    body: ProtoField(14, {
      field10: ProtoField(10, 'uint32'),
      state: ProtoField(20, 'string'),
      result: ProtoField(30, {
        extra: ProtoField(120, {
          field100: ProtoField(100, 'uint32'),
          download: ProtoField(102, {
            downloadUrl: ProtoField(8, 'bytes'),
            downloadDns: ProtoField(11, 'string')
          })
        })
      }),
      metadata: ProtoField(40, {
        fileName: ProtoField(7, 'string')
      })
    }),
    field50: ProtoField(50, 'uint32')
  })

  /** OidbSvcTrpcTcp.0xeb7_1 */
  export const GroupClockInReq = ProtoMessage.of({
    body: ProtoField(2, {
      uin: ProtoField(1, 'string'),
      groupCode: ProtoField(2, 'string'),
      appVersion: ProtoField(3, 'string')
    })
  })

  export const GroupFileReq = ProtoMessage.of({
    uploadFileReq: ProtoField(1, {
      groupCode: ProtoField(1, 'uint32'),
      appId: ProtoField(2, 'uint32'),
      busId: ProtoField(3, 'uint32'),
      entrance: ProtoField(4, 'uint32'),
      parentFolderId: ProtoField(5, 'string'),
      fileName: ProtoField(6, 'string'),
      localPath: ProtoField(7, 'string'),
      fileSize: ProtoField(8, 'uint32'),
      sha: ProtoField(9, 'bytes'),
      sha3: ProtoField(10, 'bytes', 'optional'),
      md5: ProtoField(11, 'bytes'),
      supportMultiUpload: ProtoField(12, 'bool')
    })
  })

  export const GroupFileResp = ProtoMessage.of({
    uploadFileRsp: ProtoField(1, {
      retCode: ProtoField(1, 'int32'),
      retMsg: ProtoField(2, 'string'),
      clientWording: ProtoField(3, 'string'),
      uploadIp: ProtoField(4, 'string'),
      serverDns: ProtoField(5, 'string'),
      busId: ProtoField(6, 'uint32'),
      fileId: ProtoField(7, 'string'),
      checkKey: ProtoField(8, 'bytes'),
      fileKey: ProtoField(9, 'bytes'),
      fileExist: ProtoField(10, 'bool'),
      uploadIpLanV4: ProtoField(12, 'string', 'repeated'),
      uploadIpLanV6: ProtoField(13, 'string', 'repeated'),
      uploadPort: ProtoField(14, 'uint32')
    })
  })

  export const OfflineFileUploadReq = ProtoMessage.of({
    command: ProtoField(1, 'uint32'),
    seq: ProtoField(2, 'int32'),
    upload: ProtoField(19, {
      senderUid: ProtoField(10, 'string'),
      receiverUid: ProtoField(20, 'string'),
      fileSize: ProtoField(30, 'uint32'),
      fileName: ProtoField(40, 'string'),
      md510MCheckSum: ProtoField(50, 'bytes'),
      sha1CheckSum: ProtoField(60, 'bytes'),
      localPath: ProtoField(70, 'string'),
      md5CheckSum: ProtoField(110, 'bytes'),
      sha3CheckSum: ProtoField(120, 'bytes')
    }),
    businessId: ProtoField(101, 'int32'),
    clientType: ProtoField(102, 'int32'),
    flagSupportMediaPlatform: ProtoField(200, 'int32')
  })

  export const OfflineFileUploadResp = ProtoMessage.of({
    command: ProtoField(1, 'uint32'),
    seq: ProtoField(2, 'int32'),
    upload: ProtoField(19, {
      retCode: ProtoField(10, 'int32'),
      retMsg: ProtoField(20, 'string'),
      totalSpace: ProtoField(30, 'uint32'),
      usedSpace: ProtoField(40, 'uint32'),
      uploadedSize: ProtoField(50, 'uint32'),
      uploadIp: ProtoField(60, 'string'),
      uploadDomain: ProtoField(70, 'string'),
      uploadPort: ProtoField(80, 'uint32'),
      uuid: ProtoField(90, 'string'),
      uploadKey: ProtoField(100, 'bytes'),
      fileExist: ProtoField(110, 'bool'),
      packSize: ProtoField(120, 'int32'),
      uploadIpList: ProtoField(130, 'string', 'repeated'),
      uploadHttpsPort: ProtoField(140, 'int32'),
      uploadHttpsDomain: ProtoField(150, 'string'),
      uploadDns: ProtoField(160, 'string'),
      uploadLanip: ProtoField(170, 'string'),
      fileIdCrc: ProtoField(200, 'string'),
      rtpMediaPlatformUploadAddress: ProtoField(210, {
        outIp: ProtoField(1, 'uint32'),
        outPort: ProtoField(2, 'uint32'),
        innerIp: ProtoField(3, 'uint32'),
        innerPort: ProtoField(4, 'uint32'),
        ipType: ProtoField(5, 'uint32')
      }, 'repeated'),
      mediaPlatformUploadKey: ProtoField(220, 'bytes')
    }),
    businessId: ProtoField(101, 'int32'),
    clientType: ProtoField(102, 'int32'),
    flagSupportMediaPlatform: ProtoField(200, 'int32')
  })
}
