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
  export const FetchUserInfoByUinReq = ProtoMessage.of({
    uin: ProtoField(1, 'uint32'),
    field2: ProtoField(2, 'uint32'),
    keys: ProtoField(3, {
      key: ProtoField(1, 'uint32')
    }, 'repeated')
  })

  /** OidbSvcTrpcTcp.0xfe1_2 - 通过 UID 查 stranger，返回里包含 UIN */
  export const FetchUserInfoByUidReq = ProtoMessage.of({
    uid: ProtoField(1, 'string'),
    keys: ProtoField(3, {
      key: ProtoField(1, 'uint32')
    }, 'repeated')
  })

  export const FetchUserInfoResp = ProtoMessage.of({
    body: ProtoField(1, {
      properties: ProtoField(2, {
        numberProperties: ProtoField(1, ['uint32', 'uint32']),
        bytesProperties: ProtoField(2, ['uint32', 'bytes'])
      }),
      uin: ProtoField(3, 'uint32')
    })
  })

  /** OidbSvcTrpcTcp.0xfe7_3 - 拉群成员列表 */
  export const FetchGroupMembersReq = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    field2: ProtoField(2, 'uint32'),
    field3: ProtoField(3, 'uint32'),
    body: ProtoField(4, {
      memberName: ProtoField(10, 'bool'),
      memberCard: ProtoField(11, 'bool'),
      level: ProtoField(12, 'bool'),
      specialTitle: ProtoField(17, 'bool'),
      joinTimestamp: ProtoField(100, 'bool'),
      lastMsgTimestamp: ProtoField(101, 'bool'),
      shutUpTimestamp: ProtoField(102, 'bool'),
      permission: ProtoField(107, 'bool'),
    }),
    cookie: ProtoField(15, 'bytes', 'optional'),
  })

  export const FetchGroupMembersResp = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    members: ProtoField(2, {
      id: ProtoField(1, {
        uid: ProtoField(2, 'string'),
        uin: ProtoField(4, 'uint32'),
      }),
      memberName: ProtoField(10, 'string'),
      memberCard: ProtoField(11, {
        memberCard: ProtoField(2, 'string', 'optional'),
      }),
      level: ProtoField(12, {
        level: ProtoField(2, 'uint32', 'optional'),
      }, 'optional'),
      specialTitle: ProtoField(17, 'string', 'optional'),
      joinTimestamp: ProtoField(100, 'uint32'),
      lastMsgTimestamp: ProtoField(101, 'uint32'),
      shutUpTimestamp: ProtoField(102, 'uint32', 'optional'),
      permission: ProtoField(107, 'uint32', 'optional'),
    }, 'repeated'),
    memberCount: ProtoField(3, 'uint32'),
    cookie: ProtoField(15, 'bytes', 'optional'),
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
      // 接收方（query 发起者）自己的 uid。PMHQ 抓包验过。
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

  /** OidbSvcTrpcTcp.0x6d9_4 - 群文件 feeds（上传完后发布到群聊里） */
  export const GroupFileFeedReq = ProtoMessage.of({
    feedsInfoReq: ProtoField(5, {
      groupCode: ProtoField(1, 'uint32'),
      appId: ProtoField(2, 'uint32'),
      feedsInfoList: ProtoField(3, {
        busId: ProtoField(1, 'uint32'),
        fileId: ProtoField(2, 'string'),
        msgRandom: ProtoField(3, 'uint32'),
        feedFlag: ProtoField(5, 'uint32'),
      }, 'repeated'),
    }),
  })

  export const GroupFileFeedResp = ProtoMessage.of({
    feedsInfoRsp: ProtoField(5, {
      retCode: ProtoField(1, 'int32'),
      retMsg: ProtoField(2, 'string'),
    }),
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
        groupShutupExpireTime: ProtoField(10, 'bool'),
        description: ProtoField(18, 'bool'),
        question: ProtoField(19, 'bool'),
        richDescription: ProtoField(21, 'bool'),
        announcement: ProtoField(30, 'bool'),
      }),
      config2: ProtoField(2, {
        remark: ProtoField(3, 'bool'),
        personShutupExpireTime: ProtoField(4, 'bool')
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
        groupShutupExpireTime: ProtoField(10, 'uint32', 'optional'),
        description: ProtoField(18, 'string', 'optional'),
        question: ProtoField(19, 'string', 'optional'),
        richDescription: ProtoField(21, 'string', 'optional'),
        announcement: ProtoField(30, 'string', 'optional')
      }),
      personInfo: ProtoField(5, {
        remark: ProtoField(3, 'string', 'optional'),
        personShutupExpireTime: ProtoField(4, 'uint32', 'optional')
      })
    }, 'repeated')
  })

  /** OidbSvcTrpcTcp.0x6d8_1 - 列表 */
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

  /** OidbSvcTrpcTcp.0x6d8_1 - 文件数 */
  export const GetGroupFileCountReq = ProtoMessage.of({
    countReq: ProtoField(3, {
      groupCode: ProtoField(1, 'uint32'),
      appId: ProtoField(2, 'uint32'),
      busId: ProtoField(3, 'uint32'),
    })
  })

  /** OidbSvcTrpcTcp.0x6d8_1 - 空间使用 */
  export const GetGroupFileSpaceReq = ProtoMessage.of({
    spaceReq: ProtoField(4, {
      groupCode: ProtoField(1, 'uint32'),
      appId: ProtoField(2, 'uint32'),
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
    }),
    countResp: ProtoField(3, {
      fileCount: ProtoField(4, 'uint32'),
      limitCount: ProtoField(6, 'uint32'),
      isFull: ProtoField(7, 'bool'),
    }, 'optional'),
    spaceResp: ProtoField(4, {
      totalSpace: ProtoField(4, 'uint64'),
      usedSpace: ProtoField(5, 'uint64'),
    }, 'optional'),
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
    jumpUrl: ProtoField(3, 'string')
  })

  export const GetFriendRecommendContactArkResp = ProtoMessage.of({
    ark: ProtoField(1, 'string')
  })

  /** OidbSvcTrpcTcp.0x10cc_1 */
  export const SetFriendRemarkReq = ProtoMessage.of({
    uid: ProtoField(1, 'string'),
    remark: ProtoField(2, 'string')
  })

  /** OidbSvcTrpcTcp.0x126b_0 */
  export const DeleteFriendReq = ProtoMessage.of({
    field1: ProtoField(1, {
      targetUid: ProtoField(1, 'string'),
      field2: ProtoField(2, {
        field1: ProtoField(1, 'uint32'),
        field2: ProtoField(2, 'uint32'),
        field3: ProtoField(3, {
          field1: ProtoField(1, 'uint32'),
          field2: ProtoField(2, 'uint32'),
          field3: ProtoField(3, 'uint32')
        })
      }),
      block: ProtoField(3, 'bool'),
      bothDelete: ProtoField(4, 'bool')
    })
  })

  /** OidbSvcTrpcTcp.0x10eb_1 */
  export const SetFriendCategoryReq = ProtoMessage.of({
    uid: ProtoField(1, 'string'),
    categoryId: ProtoField(2, 'uint32')
  })

  /** OidbSvcTrpcTcp.0x5cf_11 */
  export const FetchFriendRequestsReq = ProtoMessage.of({
    version: ProtoField(1, 'int32'),
    type: ProtoField(3, 'int32'),
    selfUid: ProtoField(4, 'string'),
    startIndex: ProtoField(5, 'int32'),
    reqNum: ProtoField(6, 'int32'),
    getFlag: ProtoField(8, 'int32'),
    startTime: ProtoField(9, 'int32'),
    needCommFriend: ProtoField(12, 'int32'),
    field22: ProtoField(22, 'int32')
  })

  export const FetchFriendRequestsResp = ProtoMessage.of({
    field1: ProtoField(1, 'int32'),
    field2: ProtoField(2, 'int32'),
    info: ProtoField(3, {
      field2: ProtoField(2, 'int32'),
      count: ProtoField(3, 'int32'),
      requests: ProtoField(7, {
        selfUid: ProtoField(1, 'string'),
        friendUid: ProtoField(2, 'string'),
        state: ProtoField(3, 'int32'),
        timestamp: ProtoField(4, 'uint32'),
        comment: ProtoField(5, 'string'),
        source: ProtoField(6, 'string'),
        sourceId: ProtoField(7, 'int32'),
        subSourceId: ProtoField(8, 'int32'),
        isInitiator: ProtoField(20, 'bool')
      }, 'repeated')
    })
  })

  /** OidbSvcTrpcTcp.0xd69_0 */
  export const FetchFilteredFriendRequestsReq = ProtoMessage.of({
    field1: ProtoField(1, 'int32'),
    field2: ProtoField(2, {
      count: ProtoField(1, 'int32')
    })
  })

  export const FetchFilteredFriendRequestsResp = ProtoMessage.of({
    info: ProtoField(2, {
      requests: ProtoField(1, {
        sourceUid: ProtoField(1, 'string'),
        sourceNickname: ProtoField(2, 'string'),
        comment: ProtoField(5, 'string'),
        source: ProtoField(6, 'string'),
        warningInfo: ProtoField(7, 'string'),
        timestamp: ProtoField(8, 'uint32'),
        groupCode: ProtoField(9, 'uint32')
      }, 'repeated')
    })
  })

  /** OidbSvcTrpcTcp.0x5d6_18 */
  export const SetFriendPinReq = ProtoMessage.of({
    field1: ProtoField(1, 'uint32'),
    info: ProtoField(2, {
      friendUid: ProtoField(1, 'string'),
      field400: ProtoField(400, {
        field1: ProtoField(1, 'uint32'),
        timestamp: ProtoField(2, 'bytes')
      })
    }),
    field3: ProtoField(3, 'uint32')
  })

  /** OidbSvcTrpcTcp.0x5d6_1 */
  export const SetGroupPinReq = ProtoMessage.of({
    field1: ProtoField(1, 'uint32'),
    info: ProtoField(2, {
      groupCode: ProtoField(2, 'uint32'),
      field400: ProtoField(400, {
        field1: ProtoField(1, 'uint32'),
        timestamp: ProtoField(2, 'bytes')
      })
    }),
    field3: ProtoField(3, 'uint32')
  })

  /** OidbSvcTrpcTcp.0x88d_14 */
  export const FetchGroupReq = ProtoMessage.of({
    random: ProtoField(1, 'uint32'),
    config: ProtoField(2, {
      groupCode: ProtoField(1, 'uint32'),
      flags: ProtoField(2, {
        ownerUid: ProtoField(1, 'bool'),
        groupCreateTime: ProtoField(2, 'bool'),
        maxMemberNum: ProtoField(5, 'bool'),
        memberNum: ProtoField(6, 'bool'),
        groupName: ProtoField(15, 'string'),
        question: ProtoField(24, 'string'),
        description: ProtoField(40, 'string'),
        shutUpMeTimestamp: ProtoField(46, 'bool')
      })
    })
  })

  export const FetchGroupResp = ProtoMessage.of({
    info: ProtoField(1, {
      groupCode: ProtoField(1, 'uint32'),
      results: ProtoField(3, {
        ownerUid: ProtoField(1, 'string'),
        groupCreateTime: ProtoField(2, 'uint32'),
        maxMemberNum: ProtoField(5, 'uint32'),
        memberNum: ProtoField(6, 'uint32'),
        groupName: ProtoField(15, 'string'),
        question: ProtoField(24, 'string'),
        description: ProtoField(40, 'string', 'optional'),
        shutUpMeTimestamp: ProtoField(46, 'uint32')
      })
    })
  })

  /** OidbSvcTrpcTcp.0x8a0_1 - 踢人 */
  export const KickMemberReq = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    kickUids: ProtoField(3, 'string', 'repeated'),
    rejectSubsequentRequests: ProtoField(4, 'bool'),
    reason: ProtoField(5, 'string', 'optional'),
  })

  /** OidbSvcTrpcTcp.0x1253_1 - 禁言成员 */
  export const MuteMemberReq = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    memCount: ProtoField(2, 'uint32'),
    memList: ProtoField(3, {
      uid: ProtoField(1, 'string'),
      duration: ProtoField(2, 'uint32'),
    }, 'repeated'),
  })

  /** OidbSvcTrpcTcp.0x89a_0 - 全员禁言 */
  export const MuteAllMembersReq = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    body: ProtoField(2, {
      duration: ProtoField(17, 'uint32'),
    }),
  })

  /** OidbSvcTrpcTcp.0x89a_15 - 设置群名 */
  export const SetGroupNameReq = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    body: ProtoField(2, {
      name: ProtoField(3, 'string'),
    }),
  })

  /** OidbSvcTrpcTcp.0x8fc_3 - 设置群名片 */
  export const SetMemberCardReq = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    body: ProtoField(3, {
      targetUid: ProtoField(1, 'string'),
      card: ProtoField(8, 'string'),
    }, 'repeated'),
  })

  /** OidbSvcTrpcTcp.0x1097_1 - 退群 */
  export const LeaveGroupReq = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
  })

  /** OidbSvcTrpcTcp.0x10c8_1 / 0x10c8_2 - 处理群通知（入群审批等） */
  export const HandleGroupRequestReq = ProtoMessage.of({
    operation: ProtoField(1, 'uint32'),
    body: ProtoField(2, {
      sequence: ProtoField(1, 'uint64'),
      eventType: ProtoField(2, 'uint32'),
      groupCode: ProtoField(3, 'uint32'),
      message: ProtoField(4, 'string'),
    }),
  })

  /** OidbSvcTrpcTcp.0x1096_1 - 设/取消管理员 */
  export const SetMemberAdminReq = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    memberUid: ProtoField(2, 'string'),
    isSet: ProtoField(3, 'bool'),
  })

  /** OidbSvcTrpcTcp.0xeac_1 / 0xeac_2 - 设精华 / 取消精华 */
  export const GroupEssenceReq = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    msgSequence: ProtoField(2, 'uint32'),
    msgRandom: ProtoField(3, 'uint32'),
  })

  /** OidbSvcTrpcTcp.0x9082_1 / 0x9082_2 - 群表情回应（添加 / 移除） */
  export const GroupReactionReq = ProtoMessage.of({
    groupCode: ProtoField(2, 'uint32'),
    sequence: ProtoField(3, 'uint32'),
    code: ProtoField(4, 'string'),
    type: ProtoField(5, 'uint32'),
  })

  /** OidbSvcTrpcTcp.0x102a_0 / 0x102a_1 - 拉 PSkey / clientKey */
  export const FetchCookiesReq = ProtoMessage.of({
    domain: ProtoField(1, 'string', 'repeated'),
  })

  export const FetchCookiesResp = ProtoMessage.of({
    psKeys: ProtoField(1, ['string', 'string']),
    keyType: ProtoField(2, 'int32'),
    clientKey: ProtoField(3, 'string'),
    expiration: ProtoField(4, 'uint32'),
  })

  /** OidbSvcTrpcTcp.0x10c0_1 / 0x10c0_2 - 拉群通知 */
  export const FetchGroupNotifiesReq = ProtoMessage.of({
    count: ProtoField(1, 'uint32'),
    startSequence: ProtoField(2, 'uint64', 'optional'),
  })

  export const FetchGroupNotifiesResp = ProtoMessage.of({
    requests: ProtoField(1, {
      sequence: ProtoField(1, 'uint64'),
      type: ProtoField(2, 'uint32'),
      requestState: ProtoField(3, 'uint32'),
      group: ProtoField(4, {
        groupCode: ProtoField(1, 'uint32'),
        groupName: ProtoField(2, 'string'),
      }),
      user1: ProtoField(5, {
        uid: ProtoField(1, 'string'),
        nickName: ProtoField(2, 'string'),
      }),
      user2: ProtoField(6, {
        uid: ProtoField(1, 'string'),
        nickName: ProtoField(2, 'string'),
      }, 'optional'),
      user3: ProtoField(7, {
        uid: ProtoField(1, 'string'),
        nickName: ProtoField(2, 'string'),
      }, 'optional'),
      time: ProtoField(8, 'uint32', 'optional'),
      comment: ProtoField(10, 'string', 'optional'),
    }, 'repeated'),
    newLatestSequence: ProtoField(3, 'uint64', 'optional'),
  })

  /** OidbSvcTrpcTcp.0x7e5_104 - 给好友点赞 */
  export const FriendLikeReq = ProtoMessage.of({
    targetUid: ProtoField(11, 'string'),
    field2: ProtoField(12, 'uint32'),  // 固定 71
    count: ProtoField(13, 'uint32'),
  })

  /** OidbSvcTrpcTcp.0x6d6_3 - 删群文件 */
  export const GroupFileDeleteReq = ProtoMessage.of({
    delete: ProtoField(4, {
      groupCode: ProtoField(1, 'uint32'),
      busId: ProtoField(3, 'uint32'),    // 102
      fileId: ProtoField(5, 'string'),
    }),
  })

  /** OidbSvcTrpcTcp.0x6d6_5 - 移动群文件到另一文件夹 */
  export const GroupFileMoveReq = ProtoMessage.of({
    move: ProtoField(6, {
      groupCode: ProtoField(1, 'uint32'),
      appId: ProtoField(2, 'uint32'),       // 7
      busId: ProtoField(3, 'uint32'),       // 102
      fileId: ProtoField(4, 'string'),
      parentDirectory: ProtoField(5, 'string'),
      targetDirectory: ProtoField(6, 'string'),
    }),
  })

  /** OidbSvcTrpcTcp.0xf16_1 - 设置本地群备注（只自己看见） */
  export const GroupRemarkReq = ProtoMessage.of({
    body: ProtoField(1, {
      groupCode: ProtoField(1, 'uint32'),
      targetRemark: ProtoField(3, 'string'),
    }),
  })

  /** OidbSvcTrpcTcp.0x6d7_0 - 创建群文件夹 */
  export const GroupFolderCreateReq = ProtoMessage.of({
    create: ProtoField(1, {
      groupCode: ProtoField(1, 'uint32'),
      rootDirectory: ProtoField(3, 'string'),  // 父目录 id，根 "/"
      folderName: ProtoField(4, 'string'),
    }),
  })

  export const GroupFolderCreateResp = ProtoMessage.of({
    create: ProtoField(1, {
      retCode: ProtoField(1, 'int32', 'optional'),
      retMsg: ProtoField(2, 'string', 'optional'),
      clientWording: ProtoField(3, 'string', 'optional'),
      folderInfo: ProtoField(4, {
        folderId: ProtoField(1, 'string', 'optional'),
        folderPath: ProtoField(2, 'string', 'optional'),
        folderName: ProtoField(3, 'string', 'optional'),
      }, 'optional'),
    }, 'optional'),
  })

  /** OidbSvcTrpcTcp.0x6d7_1 - 删群文件夹 */
  export const GroupFolderDeleteReq = ProtoMessage.of({
    delete: ProtoField(2, {
      groupCode: ProtoField(1, 'uint32'),
      folderId: ProtoField(3, 'string'),
    }),
  })

  /** OidbSvcTrpcTcp.0x6d7_2 - 重命名群文件夹 */
  export const GroupFolderRenameReq = ProtoMessage.of({
    rename: ProtoField(3, {
      groupCode: ProtoField(1, 'uint32'),
      folderId: ProtoField(3, 'string'),
      newFolderName: ProtoField(4, 'string'),
    }),
  })

  /** OidbSvcTrpcTcp.0x8b7_5 */
  export const GetGroupRecommendContactArkReq = ProtoMessage.of({
    field1: ProtoField(1, 'uint32'),
    groupCode: ProtoField(2, 'uint32'),
    field5: ProtoField(5, 'uint32')
  })

  export const GetGroupRecommendContactArkResp = ProtoMessage.of({
    ark: ProtoField(5, 'string')
  })

  /** OidbSvcTrpcTcp.0xa80_1 */
  export const SetGroupMsgMaskReq = ProtoMessage.of({
    body: ProtoField(1, {
      groupCode: ProtoField(1, 'uint32'),
      setting: ProtoField(2, {
        selfUid: ProtoField(1, 'string'),
        msgMask: ProtoField(4, 'uint32')
      }),
      field3: ProtoField(3, 'uint32'),
      field4: ProtoField(4, 'uint32')
    })
  })

  export const SetGroupMsgMaskResp = ProtoMessage.of({
    body: ProtoField(1, {
      groupCode: ProtoField(1, 'uint32'),
      errCode: ProtoField(2, 'uint32')
    })
  })

  /** OidbSvcTrpcTcp.0x6d9_0 */
  export const TransGroupFileReq = ProtoMessage.of({
    body: ProtoField(1, {
      groupCode: ProtoField(1, 'uint32'),
      busId: ProtoField(3, 'uint32'),
      fileId: ProtoField(4, 'string')
    })
  })

  export const TransGroupFileResp = ProtoMessage.of({
    retCode: ProtoField(1, 'int64'),
    retMsg: ProtoField(2, 'string'),
    clientWording: ProtoField(3, 'string')
  })

  /** OidbSvcTrpcTcp.0x7ed_13 - 获取赞过我/我赞过的列表 */
  export const FetchProfileLikeReq = ProtoMessage.of({
    targetUid: ProtoField(1, 'string'),
    field2: ProtoField(2, 'uint32'),
    direction: ProtoField(3, 'uint32'),  // 0=我点赞过的, 1=赞过我的
    field4: ProtoField(4, 'uint32'),
    field101: ProtoField(101, 'uint32'),
    field102: ProtoField(102, 'uint32'),
    count: ProtoField(103, 'uint32'),
  })

  export const FetchProfileLikeResp = ProtoMessage.of({
    body: ProtoField(1, {
      targetUid: ProtoField(1, 'string'),
      field2: ProtoField(2, 'uint32'),
      detail: ProtoField(3, {
        field1: ProtoField(1, 'uint32'),
        field2: ProtoField(2, 'uint32'),
        nextStart: ProtoField(3, 'uint32'),
        users: ProtoField(4, {
          uid: ProtoField(1, 'string'),
          src: ProtoField(2, 'uint32'),
          latestTime: ProtoField(3, 'uint32'),
          count: ProtoField(4, 'uint32'),
          giftCount: ProtoField(5, 'uint32'),
          customId: ProtoField(6, 'uint32'),
          lastCharged: ProtoField(8, 'uint32'),
          bTodayVotedCnt: ProtoField(22, 'uint32'),
          nick: ProtoField(101, 'string'),
          gender: ProtoField(102, 'uint32'),
          age: ProtoField(103, 'uint32'),
          isvip: ProtoField(105, 'bool'),
          isSvip: ProtoField(106, 'bool'),
        }, 'repeated'),
      }, 'optional'),
    }),
  })

  /** OidbSvcTrpcTcp.0x6d6_4 - 重命名群文件 */
  export const RenameGroupFileReq = ProtoMessage.of({
    rename: ProtoField(5, {
      groupCode: ProtoField(1, 'uint32'),
      busId: ProtoField(3, 'uint32'),
      fileId: ProtoField(4, 'string'),
      parentDirectory: ProtoField(5, 'string'),
      newFileName: ProtoField(6, 'string'),
    }),
  })

  /** OidbSvcTrpcTcp.0x112a_2 - 修改自己的资料 */
  export const ModifySelfProfileReq = ProtoMessage.of({
    selfUin: ProtoField(1, 'uint32'),
    bytesProperties: ProtoField(2, {
      key: ProtoField(1, 'uint32'),
      value: ProtoField(2, 'bytes'),
    }, 'repeated'),
    numberProperties: ProtoField(3, {
      key: ProtoField(1, 'uint32'),
      value: ProtoField(2, 'uint32'),
    }, 'repeated'),
  })

  /** OidbSvcTrpcTcp.0x9083_1 - 拉取消息表情回应的用户列表 */
  export const FetchEmojiLikesReq = ProtoMessage.of({
    groupCode: ProtoField(2, 'uint32'),
    msgSeq: ProtoField(3, 'uint32'),
    chatType: ProtoField(4, 'uint32'),
    emojiCode: ProtoField(5, 'string'),
    cookie: ProtoField(6, 'bytes'),
    field7: ProtoField(7, 'uint32'),
    count: ProtoField(8, 'uint32'),
  })

  export const FetchEmojiLikesResp = ProtoMessage.of({
    users: ProtoField(1, {
      uin: ProtoField(1, 'uint32'),
    }, 'repeated'),
    totalCount: ProtoField(3, 'uint32', 'optional'),
    hasMore: ProtoField(4, 'uint32', 'optional'),
  })

  /** OidbSvcTrpcTcp.0x93eb_1 - 闪传：通过 code 解析 fileSetId */
  export const FlashFileSetIdByCodeReq = ProtoMessage.of({
    code: ProtoField(1, 'string'),
  })

  export const FlashFileSetIdByCodeResp = ProtoMessage.of({
    fileSetId: ProtoField(1, 'string'),
  })

  /** OidbSvcTrpcTcp.0x93d3_1 - 闪传：取 fileSet 基本信息 */
  export const FlashFileInfoReq = ProtoMessage.of({
    fileSetId: ProtoField(1, 'string'),
    field2: ProtoField(2, 'uint32'),
  })

  const FlashFileShareLink = ProtoMessage.of({
    url: ProtoField(1, 'string'),
  })

  export const FlashFileInfoResp = ProtoMessage.of({
    info: ProtoField(1, {
      fileSetId: ProtoField(1, 'string'),
      title: ProtoField(2, 'string'),
      subtitle: ProtoField(3, 'string'),
      field4: ProtoField(4, 'uint32'),
      totalSize: ProtoField(5, 'uint32'),
      shareInfo: ProtoField(8, FlashFileShareLink, 'optional'),
      field11: ProtoField(11, 'uint32'),
      createTime: ProtoField(13, 'uint32'),
      expireTime: ProtoField(14, 'uint32'),
    }, 'optional'),
  })

  /** OidbSvcTrpcTcp.0x93d4_1 - 闪传：取 fileSet 中文件列表 */
  export const FlashFileListReq = ProtoMessage.of({
    fileSetId: ProtoField(1, 'string'),
    paging: ProtoField(2, {
      cookie: ProtoField(1, 'bytes'),
      field2: ProtoField(2, 'uint32'),
      count: ProtoField(3, 'uint32'),
      field4: ProtoField(4, 'bytes'),
      flags1: ProtoField(5, {
        field1: ProtoField(1, 'uint32'),
      }),
      flags2: ProtoField(6, {
        field1: ProtoField(1, 'uint32'),
        field2: ProtoField(2, 'uint32'),
      }),
    }),
    field3: ProtoField(3, 'uint32'),
    field4: ProtoField(4, 'uint32'),
  })

  const FlashFileEntry = ProtoMessage.of({
    fileSetId: ProtoField(1, 'string'),
    fileUuid: ProtoField(2, 'string'),
    field5: ProtoField(5, 'uint32'),
    field6: ProtoField(6, 'uint32'),
    fileTypeFlag: ProtoField(7, 'uint32'),  // = 11，跟 registerFlashFile.field7 一致
    name: ProtoField(8, 'string'),
    name2: ProtoField(9, 'string'),
    fileSize: ProtoField(11, 'uint32'),
    // f13 是 server 端 download token + 校验信息（list req f3=2 时 server 才会返这部分）
    downloadToken: ProtoField(13, {
      // 100 字符 base64 token，可作为 0x12a9_200 send 的 download.info.fileId 入参
      // (跟下面的 historyToken 是同一份 token 的不同长度版本)
      token: ProtoField(1, 'string'),
      tokenWithKind: ProtoField(2, {
        kind: ProtoField(1, 'uint32'),  // = 2 (host kind)
        // 在 Windows QQ session 下这里会带完整 download URL；Linux QQ session 只返 token
        token: ProtoField(2, 'string'),
      }),
      sha1Hex: ProtoField(3, 'string'),
      field4: ProtoField(4, 'uint32'),
      md5Hex: ProtoField(5, 'string'),
      field6: ProtoField(6, 'uint32'),
      field7: ProtoField(7, 'uint32'),
    }, 'optional'),
    // 102 字符 base64 token (commit token)，是 0x12a9_200 实际识别用的 fileId
    historyToken: ProtoField(14, {
      token: ProtoField(1, 'string'),
      field3: ProtoField(3, 'uint32'),
    }, 'optional'),
    fileUuid2: ProtoField(15, 'string'),
    field18: ProtoField(18, 'uint32'),
    sha1Hex: ProtoField(20, 'string'),
    fileSize2: ProtoField(21, 'uint32'),
    md5Hex: ProtoField(25, 'string'),
  })

  export const FlashFileListResp = ProtoMessage.of({
    result: ProtoField(1, {
      field2: ProtoField(2, 'uint32'),
      files: ProtoField(3, FlashFileEntry, 'repeated'),
    }, 'optional'),
  })

  /** OidbSvcTrpcTcp.0x93e5_4 - 闪传：取老文件完整元数据（重新分享必经的第一步）。
   * Windows QQ "重新分享" 按钮的真正实现：先调这个 cmd 一次拿到老文件 sha1/md5/historyToken，
   * 然后走完整 upload 链路 (createFlashFileSet → register → preflight 秒传 → commit)。
   *
   * 关键：跟 0x93d4_1 (list) 的 ownership 限制不一样——这个 cmd 对自己上传的 fileSet
   * 也返完整字段（list 对自己 fileset 永远剥光 sha1/md5/historyToken）。
   *
   * Req 顶层 (OIDB Base body): { f1 = 老fileUuid, f2 = 老fileSetId, f3 = 1 }
   * Resp 顶层 body: { f1 = { f1 = fileUuid, f2 = FlashFileEntry } } 含完整字段。 */
  export const FlashFileGetFileInfoReq = ProtoMessage.of({
    fileUuid: ProtoField(1, 'string'),
    fileSetId: ProtoField(2, 'string'),
    field3: ProtoField(3, 'uint32'),
  })

  export const FlashFileGetFileInfoResp = ProtoMessage.of({
    wrap: ProtoField(1, {
      fileUuid: ProtoField(1, 'string'),
      file: ProtoField(2, FlashFileEntry, 'optional'),
    }, 'optional'),
  })

  /** OidbSvcTrpcTcp.0x93d1_1 - 闪传：发起下载（注册下载意图，实际 URL 由 getFlashFileList 返回） */
  export const FlashFileDownloadReq = ProtoMessage.of({
    fileSetId: ProtoField(1, 'string'),
    sceneType: ProtoField(2, 'uint32'),
  })

  /** OidbSvcTrpcTcp.0x93cf_1 - 闪传：创建 fileSet（返回 fileSetId + shareLink） */
  export const CreateFlashFileSetReq = ProtoMessage.of({
    totalFileCount: ProtoField(1, 'uint32'),
    meta: ProtoField(2, {
      title: ProtoField(2, 'string'),
      subtitle: ProtoField(3, 'string'),
      field4: ProtoField(4, 'uint32'),
      totalFileSize: ProtoField(5, 'uint32'),
      uploader: ProtoField(10, {
        uin: ProtoField(1, 'string'),
        nickname: ProtoField(2, 'string'),
        uid: ProtoField(3, 'string'),
        field4: ProtoField(4, 'bytes'),
      }),
      field16: ProtoField(16, 'uint32'),
      field20: ProtoField(20, 'uint32'),
      field21: ProtoField(21, 'uint32'),
      field23: ProtoField(23, 'uint32'),
      // 抓包：meta.field24 = { f2: 0, f3: "" }，少了 server 会拒（prepFlashFileSet 100200）
      field24: ProtoField(24, {
        field2: ProtoField(2, 'uint32'),
        field3: ProtoField(3, 'bytes'),
      }, 'optional'),
    }),
    field3: ProtoField(3, 'uint32'),
    field12: ProtoField(12, 'uint32'),
  })

  export const CreateFlashFileSetResp = ProtoMessage.of({
    fileSetId: ProtoField(1, 'string'),
    fileSetIdEcho: ProtoField(2, 'string'),
    shareLink: ProtoField(3, 'string'),
    expireTime: ProtoField(4, 'uint32'),
    expireLeftTime: ProtoField(5, 'uint32'),
  })

  /** OidbSvcTrpcTcp.0x93d0_1 - 闪传：把单个文件元数据登记到 fileSet */
  export const RegisterFlashFileReq = ProtoMessage.of({
    field1: ProtoField(1, 'uint32'),
    fileSetId: ProtoField(2, 'string'),
    fileSetIdEcho: ProtoField(3, 'string'),
    file: ProtoField(4, {
      fileSetId: ProtoField(1, 'string'),
      fileUuid: ProtoField(2, 'string'),
      field3: ProtoField(3, 'uint32'),
      field4: ProtoField(4, 'bytes'),
      field5: ProtoField(5, 'uint32'),
      field6: ProtoField(6, 'uint32'),
      field7: ProtoField(7, 'uint32'),
      name: ProtoField(8, 'string'),
      name2: ProtoField(9, 'string'),
      field10: ProtoField(10, 'uint32'),
      fileSize: ProtoField(11, 'uint32'),
      field12: ProtoField(12, 'uint32'),
      // sha1Hex/md5Hex 必传，否则 server 端这条 entry 不带 sha1，
      // 后续 0x93d4_1 (list) 永远拿不到 sha1/md5/historyToken (即使 field3=2)。
      // 这两个字段是 hex string，跟 f8/f9 (name) 同 string 类型。
      sha1Hex: ProtoField(20, 'string', 'optional'),
      field24: ProtoField(24, 'bytes', 'optional'),
      md5Hex: ProtoField(25, 'string', 'optional'),
    }),
    // 抓包外层 body 顺序: f5=1, f6=1（没有 f12，f12 是 OIDB Base 的 isReserved）
    field5: ProtoField(5, 'uint32'),
    field6: ProtoField(6, 'uint32'),
  })

  /** OidbSvcTrpcTcp.0x93db_1 - 闪传：fileSet prep（在 12a9 上传前调用） */
  export const PrepFlashFileSetReq = ProtoMessage.of({
    fileSetId: ProtoField(1, 'string'),
    field2: ProtoField(2, 'bytes'),
  })

  /** OidbSvcTrpcTcp.0x12a9_100 - 闪传：highway 上传 preflight（NTV2RichMedia 风格，但 sceneType=5 businessType=4） */
  export const FlashFileUploadPreReq = ProtoMessage.of({
    head: ProtoField(1, {
      common: ProtoField(1, {
        requestId: ProtoField(1, 'uint32'),
        command: ProtoField(2, 'uint32'),
      }),
      scene: ProtoField(2, {
        requestType: ProtoField(101, 'uint32'),  // 2
        businessType: ProtoField(102, 'uint32'),  // 4 (flash file)
        field103: ProtoField(103, 'uint32'),
        sceneType: ProtoField(200, 'uint32'),  // 5
      }),
      client: ProtoField(3, {
        agentType: ProtoField(1, 'uint32'),  // 1
      }),
    }),
    upload: ProtoField(2, {
      uploadInfo: ProtoField(1, {
        fileInfo: ProtoField(1, {
          fileSize: ProtoField(1, 'uint32'),
          md5: ProtoField(2, 'bytes'),
          sha1: ProtoField(3, 'string'),
          name: ProtoField(4, 'string'),
          fileType: ProtoField(5, {
            field1: ProtoField(1, 'uint32'),
            field2: ProtoField(2, 'uint32'),
            field3: ProtoField(3, 'uint32'),
            field4: ProtoField(4, 'uint32'),
          }),
          width: ProtoField(6, 'uint32'),
          height: ProtoField(7, 'uint32'),
          field8: ProtoField(8, 'uint32'),
          field9: ProtoField(9, 'uint32'),
        }),
        subFileType: ProtoField(2, 'uint32'),
      }),
      tryFastUploadCompleted: ProtoField(2, 'bool'),
      srvSendMsg: ProtoField(3, 'bool'),
      clientRandomId: ProtoField(4, 'uint32'),
      compatQMsgSceneType: ProtoField(5, 'uint32'),
      extBizInfo: ProtoField(6, {
        field1: ProtoField(1, {
          field1: ProtoField(1, 'uint32'),
          field2: ProtoField(2, 'bytes'),
        }),
        field2: ProtoField(2, {
          field1: ProtoField(1, 'uint32'),
        }, 'optional'),
      }),
    }),
  })

  /** OidbSvcTrpcTcp.0x12a9_103 - 闪传：upload commit */
  export const FlashFileUploadCommitReq = ProtoMessage.of({
    head: ProtoField(1, {
      common: ProtoField(1, {
        requestId: ProtoField(1, 'uint32'),
        command: ProtoField(2, 'uint32'),
      }),
      scene: ProtoField(2, {
        requestType: ProtoField(101, 'uint32'),
        businessType: ProtoField(102, 'uint32'),
        field103: ProtoField(103, 'uint32'),
        sceneType: ProtoField(200, 'uint32'),
      }),
      client: ProtoField(3, {
        agentType: ProtoField(1, 'uint32'),
      }),
    }),
    commit: ProtoField(12, {
      fileSummary: ProtoField(1, {
        fileInfo: ProtoField(1, {
          fileSize: ProtoField(1, 'uint32'),
          md5: ProtoField(2, 'bytes'),
          sha1: ProtoField(3, 'string'),
          name: ProtoField(4, 'string'),
          fileType: ProtoField(5, {
            field1: ProtoField(1, 'uint32'),
            field2: ProtoField(2, 'uint32'),
            field3: ProtoField(3, 'uint32'),
            field4: ProtoField(4, 'uint32'),
          }),
          width: ProtoField(6, 'uint32'),
          height: ProtoField(7, 'uint32'),
          field8: ProtoField(8, 'uint32'),
          field9: ProtoField(9, 'uint32'),
        }),
        token: ProtoField(2, 'string'),  // server-issued token from preflight
        field3: ProtoField(3, 'uint32'),
        time: ProtoField(4, 'uint32'),
        ttl: ProtoField(5, 'uint32'),
        field6: ProtoField(6, 'uint32'),
      }),
      field2: ProtoField(2, {
        field1: ProtoField(1, 'uint32'),
      }),
      field3: ProtoField(3, {
        field1: ProtoField(1, 'uint32'),
        field2: ProtoField(2, 'uint32'),
      }),
    }),
  })

  /** 0x12a9_100 / 0x12a9_103 共用响应（NTV2RichMediaResp 风格） */
  export const FlashFileUploadResp = ProtoMessage.of({
    head: ProtoField(1, {
      common: ProtoField(1, {
        requestId: ProtoField(1, 'uint32'),
        command: ProtoField(2, 'uint32'),
      }),
      retCode: ProtoField(3, 'string', 'optional'),
    }),
    body: ProtoField(2, {
      uKey: ProtoField(1, 'string', 'optional'),
      uKeyTtlSecond: ProtoField(2, 'uint32'),
      // server returns 'IPv4 list' here when highway upload is needed
      // 秒传命中时 file token + meta 在 field 6 内
      fastUploadInfo: ProtoField(6, {
        summary: ProtoField(1, {
          fileSummary: ProtoField(1, {
            fileInfo: ProtoField(1, {
              fileSize: ProtoField(1, 'uint32'),
              sha1: ProtoField(3, 'string'),
              name: ProtoField(4, 'string'),
              md5: ProtoField(5, 'bytes'),
              width: ProtoField(6, 'uint32'),
              height: ProtoField(7, 'uint32'),
              field9: ProtoField(9, 'uint32'),
            }),
            token: ProtoField(2, 'string'),
            field3: ProtoField(3, 'uint32'),
            time: ProtoField(4, 'uint32'),
            ttl: ProtoField(5, 'uint32'),
            field7: ProtoField(7, 'uint32'),
          }),
          field5: ProtoField(5, 'uint32'),
        }),
      }, 'optional'),
    }, 'optional'),
    commitInfo: ProtoField(12, {
      summary: ProtoField(1, {
        token: ProtoField(2, 'string'),
        field3: ProtoField(3, 'uint32'),
        time: ProtoField(4, 'uint32'),
        ttl: ProtoField(5, 'uint32'),
      }, 'optional'),
    }, 'optional'),
  })

  /** OidbSvcTrpcTcp.0x12a9_200 - 闪传：下载 preflight，返回 HTTPS 下载 URL（multimedia.qfile.qq.com）。
   * 跟 0x12a9_100/103 同一个 NTV2RichMedia trpc，但 command=200 = download mode。
   * 直接拿 host + path，bot 上层用 https.get 下载就够 — 不需要进度 polling (0x93e1_0)
   * 也不需要下载完成确认 (0x93d9_1) 那两步是 Windows 客户端 UI 用的。 */
  export const FlashFileDownloadPreReq = ProtoMessage.of({
    head: ProtoField(1, {
      common: ProtoField(1, {
        requestId: ProtoField(1, 'uint32'),
        command: ProtoField(2, 'uint32'),  // 200
      }),
      scene: ProtoField(2, {
        requestType: ProtoField(101, 'uint32'),  // 2
        businessType: ProtoField(102, 'uint32'),  // 4
        field103: ProtoField(103, 'uint32'),  // 22
        sceneType: ProtoField(200, 'uint32'),  // 5
      }),
      client: ProtoField(3, {
        agentType: ProtoField(1, 'uint32'),  // 1
      }),
    }),
    download: ProtoField(3, {
      // 真正的 fileId token 是 commit 时拿到的，这里再传一次定位文件
      info: ProtoField(1, {
        fileInfo: ProtoField(1, {
          fileSize: ProtoField(1, 'uint32'),  // 0 OK
          md5: ProtoField(2, 'bytes'),
          sha1: ProtoField(3, 'bytes'),
          // 0x12a9_200 里 name 是直接 string（跟 0x93d0 register 时的 nested {f10:string} 不一样）。
          // 抓包里 Windows 客户端会在原文件名前加 "RA" 前缀（猜：Resource-Access prefix），
          // 但实测 server 用 (fileSetId, fileUuid) 定位文件，name 字段名可以随便填。
          name: ProtoField(4, 'string'),
          fileType: ProtoField(5, {
            field1: ProtoField(1, 'uint32'),
            field2: ProtoField(2, 'uint32'),
            field3: ProtoField(3, 'uint32'),
            field4: ProtoField(4, 'uint32'),
          }),
          width: ProtoField(6, 'uint32'),
          height: ProtoField(7, 'uint32'),
          field8: ProtoField(8, 'uint32'),
          field9: ProtoField(9, 'uint32'),
        }),
        // base64 fileId（来自 0x12a9_103 commit 或文件 list 里 download.fileId）
        fileId: ProtoField(2, 'string'),
        field3: ProtoField(3, 'uint32'),
        field4: ProtoField(4, 'uint32'),
        field5: ProtoField(5, 'uint32'),
        field6: ProtoField(6, 'uint32'),
      }),
      // 客户端能力声明 — 抓包里看到一堆 uint32max 的 placeholder
      clientCaps: ProtoField(2, {
        // 抓包外层 f2 直接就是 caps body（不是再嵌一层）
        capsBody: ProtoField(2, {
          field1: ProtoField(1, 'uint32'),
          field3: ProtoField(3, 'uint32'),
          field5: ProtoField(5, 'uint32'),
          field6: ProtoField(6, {
            field1: ProtoField(1, 'uint32'),
            field2: ProtoField(2, 'bytes'),
            field3: ProtoField(3, 'bytes'),
            field4: ProtoField(4, 'uint32'),
          }),
        }),
        smallFlag: ProtoField(4, {
          field1: ProtoField(1, 'uint32'),
        }),
        // 真正定位文件的 ID — server 用这两个 UUID 而不是上面 download.info.fileId
        target: ProtoField(10, {
          fileSetId: ProtoField(1, 'string'),
          fileUuid: ProtoField(2, 'string'),
          field3: ProtoField(3, 'uint32'),  // = 11，跟 registerFlashFile.field7 一样
          fileUuid2: ProtoField(4, 'string'),  // 同 fileUuid
        }),
      }),
      // download msg 末尾的 placeholder uint32（抓包 = 0）
      field3: ProtoField(3, 'uint32'),
    }),
  })

  /** OidbSvcTrpcTcp.0x12a9_200 response */
  export const FlashFileDownloadPreResp = ProtoMessage.of({
    head: ProtoField(1, {
      common: ProtoField(1, {
        requestId: ProtoField(1, 'uint32'),
        command: ProtoField(2, 'uint32'),
      }),
      retCode: ProtoField(3, 'string', 'optional'),
    }),
    body: ProtoField(3, {
      rkey: ProtoField(1, 'string'),  // "&rkey=CAQS..."  跟 url 拼一起
      ttl: ProtoField(2, 'uint32'),  // 通常 3600
      url: ProtoField(3, {
        host: ProtoField(1, 'string'),  // multimedia.qfile.qq.com
        path: ProtoField(2, 'string'),  // /download?appid=...&fileid=...&fldc=...
        port: ProtoField(3, 'uint32'),  // 443
      }),
    }, 'optional'),
  })

  /** OidbSvcTrpcTcp.0x8a7_0 */
  export const FetchGroupAtAllRemainReq = ProtoMessage.of({
    subCmd: ProtoField(1, 'uint32'),
    limitIntervalTypeForUin: ProtoField(2, 'uint32'),
    limitIntervalTypeForGroup: ProtoField(3, 'uint32'),
    uin: ProtoField(4, 'uint32'),
    groupCode: ProtoField(5, 'uint32'),
  })

  export const FetchGroupAtAllRemainResp = ProtoMessage.of({
    canAtAll: ProtoField(1, 'bool'),
    remainAtAllCountForUin: ProtoField(2, 'uint32'),
    remainAtAllCountForGroup: ProtoField(3, 'uint32'),
    atTimesMsg: ProtoField(4, 'string'),
    canNotAtAllMsg: ProtoField(5, 'string', 'optional'),
  })

  /** OidbSvcTrpcTcp.0x88d_0 */
  export const FetchGroupExtraReq = ProtoMessage.of({
    random: ProtoField(1, 'uint32'),
    config: ProtoField(2, {
      groupCode: ProtoField(1, 'uint32'),
      flags: ProtoField(2, {
        latestMessageSeq: ProtoField(22, 'bool')
      })
    })
  })

  export const FetchGroupExtraResp = ProtoMessage.of({
    info: ProtoField(1, {
      groupCode: ProtoField(1, 'uint32'),
      results: ProtoField(3, {
        latestMessageSeq: ProtoField(22, 'uint32')
      })
    })
  })

  /** OidbSvcTrpcTcp.0xcd4_1 */
  export const SetInputStatusReq = ProtoMessage.of({
    body: ProtoField(1, {
      toUid: ProtoField(1, 'string'),
      field2: ProtoField(2, 'uint32'),
      eventType: ProtoField(3, 'uint32')
    })
  })

  export const SetInputStatusResp = ProtoMessage.of({
    body: ProtoField(1, {
      retCode: ProtoField(1, 'uint32')
    })
  })
}
