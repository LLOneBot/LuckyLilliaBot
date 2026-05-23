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

  /** OidbSvcTrpcTcp.0x6d6_0 */
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

  /** OidbSvcTrpcTcp.0xe37_1700 */
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

  /** OidbSvcTrpcTcp.0xfe5_2 */
  export const FetchGroupsReq = ProtoMessage.of({
    config: ProtoField(1, {
      config1: ProtoField(1, {
        groupOwner: ProtoField(1, 'bool'),
        createdTime: ProtoField(2, 'bool'),
        memberMax: ProtoField(3, 'bool'),
        memberCount: ProtoField(4, 'bool'),
        groupName: ProtoField(5, 'bool'),
        topTime: ProtoField(9, 'bool'),
        description: ProtoField(18, 'bool'),
        question: ProtoField(19, 'bool'),
        richDescription: ProtoField(21, 'bool'),
        announcement: ProtoField(30, 'bool'),
      }),
      config2: ProtoField(2, {
        remark: ProtoField(3, 'bool')
      })
    })
  })

  export const FetchGroupsResp = ProtoMessage.of({
    groups: ProtoField(2, {
      groupCode: ProtoField(3, 'uint32'),
      info: ProtoField(4, {
        groupOwner: ProtoField(1, {
          uid: ProtoField(2, 'string')
        }),
        createdTime: ProtoField(2, 'uint32'),
        memberMax: ProtoField(3, 'uint32'),
        memberCount: ProtoField(4, 'uint32'),
        groupName: ProtoField(5, 'string'),
        topTime: ProtoField(9, 'uint32', 'optional'),
        description: ProtoField(18, 'string', 'optional'),
        question: ProtoField(19, 'string', 'optional'),
        richDescription: ProtoField(21, 'string', 'optional'),
        announcement: ProtoField(30, 'string', 'optional')
      }),
      customInfo: ProtoField(5, {
        remark: ProtoField(3, 'string', 'optional')
      })
    }, 'repeated')
  })

  /** OidbSvcTrpcTcp.0x6d8_1 */
  export const GetGroupFileListReq = ProtoMessage.of({
    listReq: ProtoField(2, {
      groupCode: ProtoField(1, 'uint32'),
      appId: ProtoField(2, 'uint32'),
      targetDirectory: ProtoField(3, 'string'),
      fileCount: ProtoField(5, 'uint32'),
      sortBy: ProtoField(9, 'uint32'),
      startIndex: ProtoField(13, 'uint32'),
      field17: ProtoField(17, 'uint32'),
      field18: ProtoField(18, 'uint32')
    })
  })

  export const GetGroupFileListRespItem = ProtoMessage.of({
    type: ProtoField(1, 'uint32'),
    folderInfo: ProtoField(2, {
      folderId: ProtoField(1, 'string'),
      parentDirectoryId: ProtoField(2, 'string'),
      folderName: ProtoField(3, 'string'),
      createTime: ProtoField(4, 'uint32'),
      modifiedTime: ProtoField(5, 'uint32'),
      creatorUin: ProtoField(6, 'uint32'),
      creatorName: ProtoField(7, 'string'),
      totalFileCount: ProtoField(8, 'uint32')
    }, 'optional'),
    fileInfo: ProtoField(3, {
      fileId: ProtoField(1, 'string'),
      fileName: ProtoField(2, 'string'),
      fileSize: ProtoField(3, 'uint32'),
      busId: ProtoField(4, 'uint32'),
      uploadedSize: ProtoField(5, 'uint32'),
      uploadedTime: ProtoField(6, 'uint32'),
      expireTime: ProtoField(7, 'uint32'),
      modifiedTime: ProtoField(8, 'uint32'),
      downloadedTimes: ProtoField(9, 'uint32'),
      fileSha1: ProtoField(10, 'bytes'),
      fileMd5: ProtoField(12, 'bytes'),
      uploaderName: ProtoField(14, 'string'),
      uploaderUin: ProtoField(15, 'uint32'),
      parentDirectory: ProtoField(16, 'string'),
      field17: ProtoField(17, 'uint32'),
      field22: ProtoField(22, 'string')
    }, 'optional')
  })

  export const GetGroupFileListResp = ProtoMessage.of({
    listResp: ProtoField(2, {
      retCode: ProtoField(1, 'int32'),
      retMsg: ProtoField(2, 'string'),
      clientWording: ProtoField(3, 'string'),
      isEnd: ProtoField(4, 'bool'),
      items: ProtoField(5, GetGroupFileListRespItem, 'repeated'),
      allFileCount: ProtoField(7, 'uint32'),
      nextIndex: ProtoField(13, 'uint32')
    })
  })

  /** OidbSvcTrpcTcp.0xe07_0 */
  export const ImageOcrReq = ProtoMessage.of({
    version: ProtoField(1, 'uint32'),
    client: ProtoField(2, 'uint32'),
    entrance: ProtoField(3, 'uint32'),
    ocrReqBody: ProtoField(10, {
      imageUrl: ProtoField(1, 'string'),
      languageType: ProtoField(2, 'uint32'),
      scene: ProtoField(3, 'uint32'),
      originMd5: ProtoField(10, 'string'),
      afterCompressMd5: ProtoField(11, 'string'),
      afterCompressFileSize: ProtoField(12, 'string'),
      afterCompressWeight: ProtoField(13, 'string'),
      afterCompressHeight: ProtoField(14, 'string'),
      isCut: ProtoField(15, 'bool')
    })
  })

  export const ImageOcrResp = ProtoMessage.of({
    retCode: ProtoField(1, 'int32', 'optional'),
    errMsg: ProtoField(2, 'string'),
    wording: ProtoField(3, 'string', 'optional'),
    ocrRspBody: ProtoField(10, {
      textDetections: ProtoField(1, {
        detectedText: ProtoField(1, 'string'),
        confidence: ProtoField(2, 'uint32'),
        polygon: ProtoField(3, {
          coordinates: ProtoField(1, {
            x: ProtoField(1, 'int32'),
            y: ProtoField(2, 'int32')
          }, 'repeated')
        }),
        advancedInfo: ProtoField(4, 'string')
      }, 'repeated'),
      language: ProtoField(2, 'string'),
      requestId: ProtoField(3, 'string'),
      ocrLanguageList: ProtoField(101, 'string', 'repeated'),
      dstTranslateLanguageList: ProtoField(102, 'string', 'repeated'),
      languageList: ProtoField(103, {
        languageCode: ProtoField(1, 'string'),
        languageDesc: ProtoField(2, 'string')
      }, 'repeated'),
      afterCompressWeight: ProtoField(111, 'uint32'),
      afterCompressHeight: ProtoField(112, 'uint32')
    })
  })

  /** OidbSvcTrpcTcp.0xb5d_44 */
  export const SetFriendRequestReq = ProtoMessage.of({
    accept: ProtoField(1, 'uint32'),
    targetUid: ProtoField(2, 'string')
  })

  /** OidbSvcTrpcTcp.0xd72_0 */
  export const SetFilteredFriendRequestReq = ProtoMessage.of({
    selfUid: ProtoField(1, 'string'),
    requestUid: ProtoField(2, 'string')
  })

  /** OidbSvcTrpcTcp.0xfd4_1 */
  export const IncPullReq = ProtoMessage.of({
    reqCount: ProtoField(2, 'uint32'),
    time: ProtoField(3, 'uint32'),
    localSeq: ProtoField(4, 'uint32'),
    cookie: ProtoField(5, 'bytes', 'optional'),
    flag: ProtoField(6, 'int32'),
    proxySeq: ProtoField(7, 'uint32'),
    requestBiz: ProtoField(10001, {
      bizType: ProtoField(1, 'int32'),
      bizData: ProtoField(2, {
        extBusi: ProtoField(1, 'int32', 'repeated'),
      })
    }, 'repeated'),
    extSnsFlagKey: ProtoField(10002, 'uint32', 'repeated'),
    extPrivateIdListKey: ProtoField(10003, 'uint32', 'repeated')
  })

  export const IncPullResp = ProtoMessage.of({
    seq: ProtoField(1, 'uint32'),
    cookie: ProtoField(2, 'bytes', 'optional'),
    isEnd: ProtoField(3, 'bool'),
    time: ProtoField(6, 'uint32'),
    selfUin: ProtoField(7, 'uint32'),
    smallSeq: ProtoField(8, 'uint32'),
    friendList: ProtoField(101, {
      uid: ProtoField(1, 'string'),
      categoryId: ProtoField(2, 'int32'),
      uin: ProtoField(3, 'uint32'),
      subBiz: ProtoField(10001, ['int32', {
        numData: ProtoField(1, ['int32', 'int32']),
        data: ProtoField(2, ['int32', 'bytes'])
      }])
    }, 'repeated'),
    category: ProtoField(102, {
      categoryId: ProtoField(1, 'int32'),
      categoryName: ProtoField(2, 'string'),
      categoryMemberCount: ProtoField(3, 'int32'),
      categorySortId: ProtoField(4, 'int32')
    }, 'repeated')
  })

  export const FetchPinsResp = ProtoMessage.of({
    friends: ProtoField(1, {
      uid: ProtoField(1, 'string')
    }, 'repeated'),
    groups: ProtoField(3, {
      groupCode: ProtoField(1, 'uint32')
    }, 'repeated')
  })

  /** OidbSvcTrpcTcp.0x12b6_0 */
  export const GetFriendRecommendContactArkReq = ProtoMessage.of({
    uin: ProtoField(1, 'uint32'),
    phoneNumber: ProtoField(2, 'string'),
    jumpUrl: ProtoField(3, 'string'),
  })

  export const GetFriendRecommendContactArkResp = ProtoMessage.of({
    ark: ProtoField(1, 'string')
  })
}
