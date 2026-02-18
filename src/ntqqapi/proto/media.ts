import { ProtoField, ProtoMessage } from '@saltify/typeproto'

export namespace Media {
  export const FileInfo = ProtoMessage.of({
    fileSize: ProtoField(1, 'uint32'),
    md5HexStr: ProtoField(2, 'string'),
    sha1HexStr: ProtoField(3, 'string'),
    fileName: ProtoField(4, 'string'),
    fileType: ProtoField(5, {
      type: ProtoField(1, 'uint32'),
      picFormat: ProtoField(2, 'uint32'),
      videoFormat: ProtoField(3, 'uint32'),
      pttFormat: ProtoField(4, 'uint32')
    }),
    width: ProtoField(6, 'uint32'),
    height: ProtoField(7, 'uint32'),
    time: ProtoField(8, 'uint32'),
    original: ProtoField(9, 'uint32')
  })

  export const IndexNode = ProtoMessage.of({
    info: ProtoField(1, FileInfo),
    fileUuid: ProtoField(2, 'string'),
    storeID: ProtoField(3, 'uint32'),
    uploadTime: ProtoField(4, 'uint32'),
    expire: ProtoField(5, 'uint32'),
    type: ProtoField(6, 'uint32')
  })

  export const ExtBizInfo = ProtoMessage.of({
    pic: ProtoField(1, {
      bizType: ProtoField(1, 'uint32'),
      summary: ProtoField(2, 'string'),
      bytesPbReserveC2c: ProtoField(11, 'bytes', 'optional'),
      fromScene: ProtoField(1001, 'uint32'),
      toScene: ProtoField(1002, 'uint32'),
      oldFileId: ProtoField(1003, 'uint32')
    }),
    video: ProtoField(2, {
      pbReserve: ProtoField(3, 'bytes')
    }),
    busiType: ProtoField(10, 'uint32')
  })

  export const NTV2RichMediaReq = ProtoMessage.of({
    reqHead: ProtoField(1, {
      common: ProtoField(1, {
        requestId: ProtoField(1, 'uint32'),
        command: ProtoField(2, 'uint32')
      }),
      scene: ProtoField(2, {
        requestType: ProtoField(101, 'uint32'),
        businessType: ProtoField(102, 'uint32'),
        field103: ProtoField(103, 'uint32'),
        sceneType: ProtoField(200, 'uint32'),
        c2c: ProtoField(201, {
          accountType: ProtoField(1, 'uint32'),
          targetUid: ProtoField(2, 'string')
        }),
        group: ProtoField(202, {
          groupId: ProtoField(1, 'uint32')
        })
      }),
      client: ProtoField(3, {
        agentType: ProtoField(1, 'uint32')
      })
    }),
    upload: ProtoField(2, {
      uploadInfo: ProtoField(1, {
        fileInfo: ProtoField(1, FileInfo),
        subFileType: ProtoField(2, 'uint32')
      }, 'repeated'),
      tryFastUploadCompleted: ProtoField(2, 'bool'),
      srvSendMsg: ProtoField(3, 'bool'),
      clientRandomId: ProtoField(4, 'uint32'),
      compatQMsgSceneType: ProtoField(5, 'uint32'),
      extBizInfo: ProtoField(6, ExtBizInfo),
      clientSeq: ProtoField(7, 'uint32'),
      noNeedCompatMsg: ProtoField(8, 'bool'),
    }, 'optional'),
    download: ProtoField(3, {
      node: ProtoField(1, IndexNode)
    }, 'optional')
  })

  const MsgInfoBody = ProtoMessage.of({
    index: ProtoField(1, IndexNode),
    pic: ProtoField(2, {
      urlPath: ProtoField(1, 'string'),
      ext: ProtoField(2, {
        originalParam: ProtoField(1, 'string'),
        bigParam: ProtoField(2, 'string'),
        thumbParam: ProtoField(3, 'string')
      }),
      domain: ProtoField(3, 'string')
    }, 'optional'),
    fileExist: ProtoField(5, 'bool'),
    hashSum: ProtoField(6, {
      bytesPbReserveC2c: ProtoField(201, {
        friendUid: ProtoField(2, 'string')
      }, 'optional'),
      troopSource: ProtoField(202, {
        groupCode: ProtoField(1, 'uint32')
      }, 'optional')
    })
  })

  export const MsgInfo = ProtoMessage.of({
    msgInfoBody: ProtoField(1, MsgInfoBody, 'repeated'),
    extBizInfo: ProtoField(2, ExtBizInfo)
  })

  export const FileIdInfo = ProtoMessage.of({
    sha1: ProtoField(2, 'bytes'),
    size: ProtoField(3, 'uint32'),
    appid: ProtoField(4, 'uint32'),
    time: ProtoField(5, 'uint32'),
    expire: ProtoField(10, 'uint32')
  })

  const IPv4 = ProtoMessage.of({
    outIP: ProtoField(1, 'uint32'),
    outPort: ProtoField(2, 'uint32'),
    inIP: ProtoField(3, 'uint32'),
    inPort: ProtoField(4, 'uint32'),
    ipType: ProtoField(5, 'uint32')
  })

  const IPv6 = ProtoMessage.of({
    outIP: ProtoField(1, 'bytes'),
    outPort: ProtoField(2, 'uint32'),
    inIP: ProtoField(3, 'bytes'),
    inPort: ProtoField(4, 'uint32'),
    ipType: ProtoField(5, 'uint32'),
  })

  export const NTV2RichMediaResp = ProtoMessage.of({
    upload: ProtoField(2, {
      uKey: ProtoField(1, 'string', 'optional'),
      uKeyTtlSecond: ProtoField(2, 'uint32'),
      ipv4s: ProtoField(3, IPv4, 'repeated'),
      ipv6s: ProtoField(4, IPv6, 'repeated'),
      msgSeq: ProtoField(5, 'uint32', 'optional'),
      msgInfo: ProtoField(6, MsgInfo),
      ext: ProtoField(7, {
        subType: ProtoField(1, 'uint32'),
        extType: ProtoField(2, 'uint32'),
        extValue: ProtoField(3, 'bytes')
      }, 'repeated'),
      compatQMsg: ProtoField(8, 'bytes'),
      subFileInfos: ProtoField(10, {
        subType: ProtoField(1, 'uint32'),
        uKey: ProtoField(2, 'string', 'optional'),
        uKeyTtlSecond: ProtoField(3, 'uint32'),
        ipv4s: ProtoField(4, IPv4, 'repeated'),
        ipv6s: ProtoField(5, IPv6, 'repeated'),
      }, 'repeated')
    }),
    download: ProtoField(3, {
      rKeyParam: ProtoField(1, 'string'),
      rKeyTtlSecond: ProtoField(2, 'uint32'),
      info: ProtoField(3, {
        domain: ProtoField(1, 'string'),
        urlPath: ProtoField(2, 'string'),
        httpsPort: ProtoField(3, 'uint32')
      }),
      rKeyCreateTime: ProtoField(4, 'uint32')
    }, 'optional')
  })

  export const HighwaySessionReq = ProtoMessage.of({
    reqBody: ProtoField(1281, {
      uin: ProtoField(1, 'uint32'),
      idcId: ProtoField(2, 'uint32'),
      appid: ProtoField(3, 'uint32'),
      loginSigType: ProtoField(4, 'uint32'),
      loginSigTicket: ProtoField(5, 'bytes', 'optional'),
      requestFlag: ProtoField(6, 'uint32'),
      serviceTypes: ProtoField(7, 'uint32', 'repeated'),
      bid: ProtoField(8, 'uint32'),
      field9: ProtoField(9, 'int32'),
      field10: ProtoField(10, 'int32'),
      field11: ProtoField(11, 'int32'),
      version: ProtoField(15, 'string')
    })
  })

  export const HighwaySessionResp = ProtoMessage.of({
    rspBody: ProtoField(1281, {
      sigSession: ProtoField(1, 'bytes'),
      sessionKey: ProtoField(2, 'bytes'),
      addrs: ProtoField(3, {
        serviceType: ProtoField(1, 'uint32'),
        addrs: ProtoField(2, {
          type: ProtoField(1, 'uint32'),
          ip: ProtoField(2, 'fixed32'),
          port: ProtoField(3, 'uint32'),
          area: ProtoField(4, 'uint32')
        }, 'repeated')
      }, 'repeated')
    })
  })

  const DataHighwayHead = ProtoMessage.of({
    version: ProtoField(1, 'uint32'),
    uin: ProtoField(2, 'string', 'optional'),
    command: ProtoField(3, 'string', 'optional'),
    seq: ProtoField(4, 'uint32'),
    retryTimes: ProtoField(5, 'uint32'),
    appId: ProtoField(6, 'uint32'),
    dataFlag: ProtoField(7, 'uint32'),
    commandId: ProtoField(8, 'uint32'),
    buildVer: ProtoField(9, 'bytes', 'optional')
  })

  const SegHead = ProtoMessage.of({
    serviceId: ProtoField(1, 'uint32'),
    filesize: ProtoField(2, 'uint32'),
    dataOffset: ProtoField(3, 'uint32'),
    dataLength: ProtoField(4, 'uint32'),
    retCode: ProtoField(5, 'uint32', 'optional'),
    serviceTicket: ProtoField(6, 'bytes'),
    md5: ProtoField(8, 'bytes'),
    fileMd5: ProtoField(9, 'bytes'),
    cacheAddr: ProtoField(10, 'uint32'),
    cachePort: ProtoField(13, 'uint32')
  })

  export const ReqDataHighwayHead = ProtoMessage.of({
    msgBaseHead: ProtoField(1, DataHighwayHead),
    msgSegHead: ProtoField(2, SegHead),
    bytesReqExtendInfo: ProtoField(3, 'bytes'),
    timestamp: ProtoField(4, 'uint32'),
    msgLoginSigHead: ProtoField(5, {
      uint32LoginSigType: ProtoField(1, 'uint32'),
      bytesLoginSig: ProtoField(2, 'bytes', 'optional'),
      appId: ProtoField(3, 'uint32')
    })
  })

  export const RespDataHighwayHead = ProtoMessage.of({
    msgBaseHead: ProtoField(1, DataHighwayHead),
    msgSegHead: ProtoField(2, SegHead, 'optional'),
    errorCode: ProtoField(3, 'uint32'),
    allowRetry: ProtoField(4, 'uint32'),
    cacheCost: ProtoField(5, 'uint32'),
    htCost: ProtoField(6, 'uint32'),
    bytesRspExtendInfo: ProtoField(7, 'bytes'),
    timestamp: ProtoField(8, 'uint32'),
    range: ProtoField(9, 'uint32'),
    isReset: ProtoField(10, 'uint32')
  })

  export const NTHighwayIPv4 = ProtoMessage.of({
    domain: ProtoField(1, {
      isEnable: ProtoField(1, 'bool'),
      ip: ProtoField(2, 'string')
    }),
    port: ProtoField(2, 'uint32')
  })

  export const NTHighwayNetwork = ProtoMessage.of({
    ipv4s: ProtoField(1, NTHighwayIPv4, 'repeated')
  })

  export const NTV2RichMediaHighwayExt = ProtoMessage.of({
    fileUuid: ProtoField(1, 'string'),
    uKey: ProtoField(2, 'string'),
    network: ProtoField(5, NTHighwayNetwork),
    msgInfoBody: ProtoField(6, MsgInfoBody, 'repeated'),
    blockSize: ProtoField(10, 'uint32'),
    hash: ProtoField(11, {
      fileSha1: ProtoField(1, 'bytes', 'repeated')
    })
  })

  export const FlashTransferSha1StateV = ProtoMessage.of({
    state: ProtoField(1, 'bytes', 'repeated'),
  })

  export const FlashTransferUploadReq = ProtoMessage.of({
    fieId1: ProtoField(1, 'uint32'),
    appId: ProtoField(2, 'uint32'),
    fileId3: ProtoField(3, 'uint32'),
    body: ProtoField(107, {
      fieId1: ProtoField(1, 'bytes'),
      uKey: ProtoField(2, 'string'),
      start: ProtoField(3, 'uint32'),
      end: ProtoField(4, 'uint32'),
      sha1: ProtoField(5, 'bytes'),
      sha1StateV: ProtoField(6, FlashTransferSha1StateV),
      body: ProtoField(7, 'bytes')
    })
  })

  export const FlashTransferUploadResp = ProtoMessage.of({
    status: ProtoField(5, 'string')
  })

  export const FileUploadExt = ProtoMessage.of({
    unknown1: ProtoField(1, 'int32'),
    unknown2: ProtoField(2, 'int32'),
    unknown3: ProtoField(3, 'int32'),
    entry: ProtoField(100, {
      busiBuff: ProtoField(100, {
        busId: ProtoField(1, 'int32'),
        senderUin: ProtoField(100, 'uint32'),
        receiverUin: ProtoField(200, 'uint32'),
        groupCode: ProtoField(400, 'uint32')
      }),
      fileEntry: ProtoField(200, {
        fileSize: ProtoField(100, 'uint32'),
        md5: ProtoField(200, 'bytes'),
        checkKey: ProtoField(300, 'bytes'),
        md510M: ProtoField(400, 'bytes', 'optional'),
        sha3: ProtoField(500, 'bytes', 'optional'),
        fileId: ProtoField(600, 'string'),
        uploadKey: ProtoField(700, 'bytes')
      }),
      clientInfo: ProtoField(300, {
        clientType: ProtoField(100, 'int32'),
        appId: ProtoField(200, 'string'),
        terminalType: ProtoField(300, 'int32'),
        clientVer: ProtoField(400, 'string'),
        unknown: ProtoField(600, 'int32')
      }),
      fileNameInfo: ProtoField(400, {
        fileName: ProtoField(100, 'string')
      }),
      host: ProtoField(500, {
        hosts: ProtoField(200, {
          url: ProtoField(1, {
            unknown: ProtoField(1, 'int32'),
            host: ProtoField(2, 'string'),
          }),
          port: ProtoField(2, 'uint32')
        }, 'repeated')
      })
    }),
    unknown200: ProtoField(200, 'int32', 'optional')
  })
}

