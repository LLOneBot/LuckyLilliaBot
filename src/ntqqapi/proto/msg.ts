import { ProtoField, ProtoMessage } from '@saltify/typeproto'

export namespace Msg {
  export const VideoFileMsg = ProtoMessage.of({
    fileUuid: ProtoField(1, 'string', 'optional'),
    fileMd5: ProtoField(2, 'bytes', 'optional'),
    fileName: ProtoField(3, 'string', 'optional'),
    fileFormat: ProtoField(4, 'uint32', 'optional'),
    fileTime: ProtoField(5, 'uint32', 'optional'),
    fileSize: ProtoField(6, 'uint32', 'optional'),
    thumbWidth: ProtoField(7, 'uint32', 'optional'),
    thumbHeight: ProtoField(8, 'uint32', 'optional'),
    thumbFileMd5: ProtoField(9, 'bytes', 'optional'),
    source: ProtoField(10, 'bytes', 'optional'),
    thumbFileSize: ProtoField(11, 'uint32', 'optional'),
    busiType: ProtoField(12, 'uint32', 'optional'),
    fromChatType: ProtoField(13, 'uint32', 'optional'),
    toChatType: ProtoField(14, 'uint32', 'optional'),
    boolSupportProgressive: ProtoField(15, 'bool', 'optional'),
    fileWidth: ProtoField(16, 'uint32', 'optional'),
    fileHeight: ProtoField(17, 'uint32', 'optional'),
    subBusiType: ProtoField(18, 'uint32', 'optional'),
    videoAttr: ProtoField(19, 'uint32', 'optional'),
    bytesThumbFileUrls: ProtoField(20, 'bytes', 'repeated'),
    bytesVideoFileUrls: ProtoField(21, 'bytes', 'repeated'),
    thumbDownloadFlag: ProtoField(22, 'uint32', 'optional'),
    fileDownloadFlag: ProtoField(23, 'uint32', 'optional'),
  })

  export const Elem = ProtoMessage.of({
    text: ProtoField(1, {
      str: ProtoField(1, 'string'),
      link: ProtoField(2, 'string', 'optional'),
      attr6Buf: ProtoField(3, 'bytes', 'optional'),
      attr7Buf: ProtoField(4, 'bytes', 'optional'),
      buf: ProtoField(11, 'bytes', 'optional'),
      pbReserve: ProtoField(12, 'bytes', 'optional')
    }, 'optional'),
    face: ProtoField(2, {
      index: ProtoField(1, 'uint32'),
      old: ProtoField(2, 'bytes'),
      buf: ProtoField(11, 'bytes', 'optional')
    }, 'optional'),
    notOnlineImage: ProtoField(4, {
      filePath: ProtoField(1, 'string', 'optional'),
      fileLen: ProtoField(2, 'uint32', 'optional'),
      downloadPath: ProtoField(3, 'string', 'optional'),
      picMd5: ProtoField(7, 'bytes', 'optional'),
      picHeight: ProtoField(8, 'uint32', 'optional'),
      picWidth: ProtoField(9, 'uint32', 'optional'),
      resId: ProtoField(10, 'string', 'optional'),
      thumbUrl: ProtoField(12, 'string', 'optional'),
      bigUrl: ProtoField(14, 'string', 'optional'),
      origUrl: ProtoField(15, 'string', 'optional'),
    }, 'optional'),
    transElemInfo: ProtoField(5, {
      elemType: ProtoField(1, 'uint32'),
      elemValue: ProtoField(2, 'bytes')
    }, 'optional'),
    marketFace: ProtoField(6, {
      summary: ProtoField(1, 'string', 'optional'),
      itemType: ProtoField(2, 'uint32', 'optional'),
      info: ProtoField(3, 'uint32', 'optional'),
      faceId: ProtoField(4, 'bytes', 'optional'),
      tabId: ProtoField(5, 'uint32', 'optional'),
      subType: ProtoField(6, 'uint32', 'optional'),
      key: ProtoField(7, 'string', 'optional'),
      width: ProtoField(10, 'uint32', 'optional'),
      height: ProtoField(11, 'uint32', 'optional'),
    }, 'optional'),
    customFace: ProtoField(8, {
      filePath: ProtoField(2, 'string', 'optional'),
      fileId: ProtoField(7, 'uint32', 'optional'),
      md5: ProtoField(13, 'bytes', 'optional'),
      thumbUrl: ProtoField(14, 'string', 'optional'),
      bigUrl: ProtoField(15, 'string', 'optional'),
      origUrl: ProtoField(16, 'string', 'optional'),
      width: ProtoField(22, 'uint32', 'optional'),
      height: ProtoField(23, 'uint32', 'optional'),
      size: ProtoField(25, 'uint32', 'optional'),
    }, 'optional'),
    richMsg: ProtoField(12, {
      template: ProtoField(1, 'bytes'),
      serviceId: ProtoField(2, 'int32')
    }, 'optional'),
    groupFile: ProtoField(13, {
      filename: ProtoField(1, 'string', 'optional'),
      fileSize: ProtoField(2, 'uint64', 'optional'),
      fileId: ProtoField(3, 'bytes', 'optional'),
      batchId: ProtoField(4, 'bytes', 'optional'),
      fileKey: ProtoField(5, 'bytes', 'optional'),
      sequence: ProtoField(7, 'uint64', 'optional'),
    }, 'optional'),
    extraInfo: ProtoField(16, {
      nick: ProtoField(1, 'string', 'optional'),
      groupCard: ProtoField(2, 'string', 'optional'),
      level: ProtoField(3, 'int32'),
      flags: ProtoField(4, 'int32'),
      groupMask: ProtoField(5, 'int32'),
      msgTailId: ProtoField(6, 'int32', 'optional'),
      senderTitle: ProtoField(7, 'string'),
      apnsTips: ProtoField(8, 'string', 'optional'),
      uin: ProtoField(9, 'uint32', 'optional'),
      msgStateFlag: ProtoField(10, 'int32', 'optional'),
      apnsSoundType: ProtoField(11, 'int32', 'optional'),
      newGroupFlag: ProtoField(12, 'int32', 'optional')
    }, 'optional'),
    videoFile: ProtoField(19, 'bytes', 'optional'),
    srcMsg: ProtoField(45, {
      origSeqs: ProtoField(1, 'uint32', 'repeated'),
      senderUin: ProtoField(2, 'uint32'),
      time: ProtoField(3, 'int32'),
      elems: ProtoField(5, 'bytes', 'repeated'),
      pbReserve: ProtoField(8, 'bytes'),
      srcMsg: ProtoField(9, 'bytes', 'optional'), // 仅在合并转发内存在
      toUin: ProtoField(10, 'uint32')
    }, 'optional'),
    lightApp: ProtoField(51, {
      data: ProtoField(1, 'bytes'),
      msgResid: ProtoField(2, 'bytes', 'optional')
    }, 'optional'),
    commonElem: ProtoField(53, {
      serviceType: ProtoField(1, 'uint32'),
      pbElem: ProtoField(2, 'bytes'),
      businessType: ProtoField(3, 'uint32')
    }, 'optional')
  })

  export const Message = ProtoMessage.of({
    routingHead: ProtoField(1, {
      fromUin: ProtoField(1, 'uint32'),
      fromUid: ProtoField(2, 'string'),
      fromAppid: ProtoField(3, 'uint32'),
      fromInstid: ProtoField(4, 'uint32'),
      toUin: ProtoField(5, 'uint64'),
      toUid: ProtoField(6, 'string'),
      c2c: ProtoField(7, {
        c2cType: ProtoField(1, 'int32'),
        serviceType: ProtoField(2, 'int32'),
        sig: ProtoField(3, 'bytes', 'optional'),
        fromTinyId: ProtoField(4, 'uint32'),
        toTinyId: ProtoField(5, 'uint32'),
        name: ProtoField(6, 'string')
      }),
      group: ProtoField(8, {
        groupCode: ProtoField(1, 'uint32'),
        groupType: ProtoField(2, 'uint32'),
        groupInfoSeq: ProtoField(3, 'uint64'),
        groupCard: ProtoField(4, 'string'),
        groupCardType: ProtoField(5, 'uint32'),
        groupLevel: ProtoField(6, 'uint32'),
        groupName: ProtoField(7, 'string'),
        extGroupKeyInfo: ProtoField(8, 'string'),
        msgFlag: ProtoField(9, 'uint32')
      })
    }),
    contentHead: ProtoField(2, {
      msgType: ProtoField(1, 'uint32'),
      subType: ProtoField(2, 'uint32'),
      c2cCmd: ProtoField(3, 'uint32'),
      random: ProtoField(4, 'uint32'),
      msgSeq: ProtoField(5, 'uint32'),
      msgTime: ProtoField(6, 'uint32'),
      pkgNum: ProtoField(7, 'uint32'),
      pkgIndex: ProtoField(8, 'uint32'),
      divSeq: ProtoField(9, 'uint32'),
      autoReply: ProtoField(10, 'uint32'),
      ntMsgSeq: ProtoField(11, 'uint64'),
      msgUid: ProtoField(12, 'uint64'),
      forward: ProtoField(15, {
        field1: ProtoField(1, 'uint32'),
        field2: ProtoField(2, 'uint32'),
        field3: ProtoField(3, 'uint32'),
        field4: ProtoField(4, 'string'),
        avatar: ProtoField(5, 'string')
      }, 'optional')
    }),
    body: ProtoField(3, {
      richText: ProtoField(1, {
        attr: ProtoField(1, {
          codePage: ProtoField(1, 'int32'),
          time: ProtoField(2, 'int32'),
          random: ProtoField(3, 'int32'),
          color: ProtoField(4, 'int32'),
          size: ProtoField(5, 'int32'),
          effect: ProtoField(6, 'int32'),
          charSet: ProtoField(7, 'int32'),
          pitchAndFamily: ProtoField(8, 'int32'),
          fontName: ProtoField(9, 'string'),
          reserveData: ProtoField(10, 'bytes')
        }),
        elems: ProtoField(2, Elem, 'repeated')
      }),
      msgContent: ProtoField(2, 'bytes'),
      msgEncryptContent: ProtoField(3, 'bytes')
    }, 'optional')
  })

  export const PbMultiMsgItem = ProtoMessage.of({
    fileName: ProtoField(1, 'string'),
    buffer: ProtoField(2, {
      msg: ProtoField(1, Message, 'repeated')
    })
  })

  export const PbMultiMsgTransmit = ProtoMessage.of({
    msg: ProtoField(1, Message, 'repeated'),
    pbItemList: ProtoField(2, PbMultiMsgItem, 'repeated')
  })

  export const PushMsg = ProtoMessage.of({
    message: ProtoField(1, Message)
  })

  export const NotifyMessageBody = ProtoMessage.of({
    type: ProtoField(1, 'uint32'),
    groupCode: ProtoField(4, 'uint32'),
    field13: ProtoField(13, 'uint32'),
    essenceMessage: ProtoField(33, {
      groupCode: ProtoField(1, 'uint32'),
      msgSequence: ProtoField(2, 'uint32'),
      random: ProtoField(3, 'uint32'),
      setFlag: ProtoField(4, 'uint32'),
      memberUin: ProtoField(5, 'uint32'),
      operatorUin: ProtoField(6, 'uint32'),
      timeStamp: ProtoField(7, 'uint32'),
      msgSequence2: ProtoField(8, 'uint32'),
      operatorNickName: ProtoField(9, 'string'),
      memberNickName: ProtoField(10, 'string'),
      setFlag2: ProtoField(11, 'uint32')
    }),
    reaction: ProtoField(44, {
      data: ProtoField(1, {
        body: ProtoField(1, {
          target: ProtoField(2, {
            sequence: ProtoField(1, 'uint32'),
          }),
          info: ProtoField(3, {
            code: ProtoField(1, 'string'),
            reactionType: ProtoField(2, 'uint32'),
            count: ProtoField(3, 'uint32'),
            operatorUid: ProtoField(4, 'string'),
            actionType: ProtoField(5, 'uint32')
          })
        })
      })
    })
  })

  export const QSmallFaceExtra = ProtoMessage.of({
    faceId: ProtoField(1, 'uint32'),
    text: ProtoField(2, 'string'),
    compatText: ProtoField(3, 'string')
  })

  export const GroupFileExtra = ProtoMessage.of({
    field1: ProtoField(1, 'uint32'),
    fileName: ProtoField(2, 'string'),
    display: ProtoField(3, 'string'),
    inner: ProtoField(7, {
      info: ProtoField(2, {
        busId: ProtoField(1, 'uint32'),
        fileId: ProtoField(2, 'string'),
        fileSize: ProtoField(3, 'uint32'),
        fileName: ProtoField(4, 'string'),
        field5: ProtoField(5, 'uint32', 'optional'),
        field7: ProtoField(7, 'string', 'optional'),
        fileMd5: ProtoField(8, 'string')
      })
    })
  })

  export const FileExtra = ProtoMessage.of({
    file: ProtoField(1, {
      fileType: ProtoField(1, 'uint32'),
      sig: ProtoField(2, 'bytes', 'optional'),
      fileUuid: ProtoField(3, 'string'),
      fileMd5: ProtoField(4, 'bytes', 'optional'),
      fileName: ProtoField(5, 'string'),
      fileSize: ProtoField(6, 'uint32'),
      note: ProtoField(7, 'bytes', 'optional'),
      reserved: ProtoField(8, 'uint32'),
      subCmd: ProtoField(9, 'uint32'),
      microCloud: ProtoField(10, 'uint32'),
      fileUrls: ProtoField(11, 'bytes', 'repeated'),
      downloadFlag: ProtoField(12, 'uint32'),
      dangerLevel: ProtoField(50, 'uint32'),
      lifeTime: ProtoField(51, 'uint32'),
      uploadTime: ProtoField(52, 'uint32'),
      absFileType: ProtoField(53, 'uint32'),
      clientType: ProtoField(54, 'uint32'),
      expireTime: ProtoField(55, 'uint32'),
      pbReserve: ProtoField(56, 'bytes', 'optional'),
      fileIdCrcMedia: ProtoField(57, 'string')
    })
  })

  /** MessageSvc.PbSendMsg - 发消息请求 */
  export const PbSendMsg = ProtoMessage.of({
    routingHead: ProtoField(1, {
      c2c: ProtoField(1, {
        toUin: ProtoField(1, 'uint32', 'optional'),
        toUid: ProtoField(2, 'string', 'optional'),
      }, 'optional'),
      group: ProtoField(2, {
        groupCode: ProtoField(1, 'uint32'),
      }, 'optional'),
      groupTemp: ProtoField(3, {
        groupCode: ProtoField(3, 'uint32'),
        toUid: ProtoField(4, 'string'),
      }, 'optional'),
      // C2C 文件消息走这个：把上传得到的 fileUuid + 元数据塞进 body.msgContent，
      // 配合 ccCmd=4 server 才会把它当作"离线文件"消息派发到对端。
      trans0X211: ProtoField(15, {
        toUin: ProtoField(1, 'uint64', 'optional'),
        ccCmd: ProtoField(2, 'uint32', 'optional'),
        uid: ProtoField(8, 'string', 'optional'),
      }, 'optional'),
    }),
    contentHead: ProtoField(2, {
      // 注意：发送 PbSendMsg 时，contentHead 是 SendContentHead
      // 而不是 OlPush 收到的 ContentHead（field 1=msgType）
      pkgNum: ProtoField(1, 'uint32', 'optional'),
      pkgIndex: ProtoField(2, 'uint32', 'optional'),
      divSeq: ProtoField(3, 'uint32', 'optional'),
      autoReply: ProtoField(4, 'uint32', 'optional'),
    }, 'optional'),
    body: ProtoField(3, {
      richText: ProtoField(1, {
        elems: ProtoField(2, Elem, 'repeated'),
      }, 'optional'),
      // C2C 文件用 msgContent 携带 FileExtra 序列化结果
      msgContent: ProtoField(2, 'bytes', 'optional'),
    }),
    clientSequence: ProtoField(4, 'uint32', 'optional'),
    random: ProtoField(5, 'uint32'),
    syncCookie: ProtoField(6, 'bytes', 'optional'),
    via: ProtoField(8, 'uint32', 'optional'),
    control: ProtoField(12, {
      msgFlag: ProtoField(1, 'uint32'),
    }, 'optional'),
    multiSendSeq: ProtoField(14, 'uint32', 'optional'),
  })

  export const PbSendMsgResp = ProtoMessage.of({
    resultCode: ProtoField(1, 'int32'),
    errMsg: ProtoField(2, 'string', 'optional'),
    sendTime: ProtoField(3, 'int64', 'optional'),
    msgInfoFlag: ProtoField(10, 'uint32', 'optional'),
    /** 真正的消息序号（群和私聊都用这个 field） */
    sequence: ProtoField(11, 'uint64', 'optional'),
    /** 客户端提交的序号 */
    clientSequence: ProtoField(14, 'uint64', 'optional'),
  })

  /**
   * SSO `pttTrans.TransGroupPttReq`：群语音转文字。
   * 客户端提交后服务器立即返回 ack，转写结果通过 MsgPush msgType=528 subType=61 异步推回。
   */
  export const PttTransGroupReq = ProtoMessage.of({
    field1: ProtoField(1, 'uint32'),
    body: ProtoField(2, {
      msgUid: ProtoField(1, 'uint64'),
      senderUin: ProtoField(2, 'uint32'),
      groupUin: ProtoField(3, 'uint32'),
      field4: ProtoField(4, 'uint32'),
      voiceMd5Hex: ProtoField(5, 'string'),
      field6: ProtoField(6, 'uint32'),
      field7: ProtoField(7, 'uint32'),
      field8: ProtoField(8, 'uint32'),
      voiceFileId: ProtoField(9, 'string'),
      field10: ProtoField(10, 'uint32'),
    }),
    field5: ProtoField(5, 'uint32'),
    field6: ProtoField(6, 'uint32'),
    field10: ProtoField(10, 'uint32'),
  })

  /** SSO `pttTrans.TransC2CPttReq`：私聊语音转文字。 */
  export const PttTransC2CReq = ProtoMessage.of({
    field1: ProtoField(1, 'uint32'),
    body: ProtoField(3, {
      msgUid: ProtoField(1, 'uint64'),
      senderUin: ProtoField(2, 'uint32'),
      receiverUin: ProtoField(3, 'uint32'),
      voiceFileId: ProtoField(4, 'string'),
      field5: ProtoField(5, 'uint32'),
      field6: ProtoField(6, 'uint32'),
      field7: ProtoField(7, 'uint32'),
      field8: ProtoField(8, 'uint32'),
      voiceMd5Hex: ProtoField(9, 'string'),
    }),
    field5: ProtoField(5, 'uint32'),
    field6: ProtoField(6, 'uint32'),
    field10: ProtoField(10, 'uint32'),
  })

  /**
   * MsgPush msgType=528 subType=61 推送的转写结果（msg.body.msgContent 解析成这个）。
   * Group / C2C 共用此 push schema，仅靠 msgUid 关联到原请求即可。
   */
  export const PttTransResultPush = ProtoMessage.of({
    field1: ProtoField(1, 'uint32'),
    body: ProtoField(2, {
      msgUid: ProtoField(1, 'uint64'),
      /** 1 = group, 2 = c2c */
      chatType: ProtoField(2, 'uint32'),
      field3: ProtoField(3, 'uint32'),
      field4: ProtoField(4, 'uint32'),
      field5: ProtoField(5, 'uint32'),
      field6: ProtoField(6, 'uint32'),
      field7: ProtoField(7, 'uint32'),
      /** 转写文字 */
      text: ProtoField(8, 'string'),
      senderUin: ProtoField(9, 'uint32'),
      /** group: groupCode；c2c: 收件人 uin */
      groupOrReceiverUin: ProtoField(10, 'uint32'),
    }),
  })

  /** SSO `Faceroam.OpReq` 收藏表情列表/删除请求 */
  export const FaceroamOpReq = ProtoMessage.of({
    comm: ProtoField(1, {
      imPlat: ProtoField(1, 'uint32'),
      osVersion: ProtoField(2, 'string'),
      qVersion: ProtoField(3, 'string', 'optional'),
    }),
    selfUin: ProtoField(2, 'uint64'),
    /** 1 = 列表, 2 = 删除 */
    subCmd: ProtoField(3, 'uint32'),
    /** 删除时填要删的 emoji_id 列表 */
    deleteList: ProtoField(5, {
      emojiId: ProtoField(1, 'string'),
    }, 'repeated'),
    field6: ProtoField(6, 'uint32', 'optional'),
  })

  /** Faceroam.OpReq 列表响应 */
  export const FaceroamListResp = ProtoMessage.of({
    retCode: ProtoField(1, 'uint32'),
    errMsg: ProtoField(2, 'string'),
    subCmd: ProtoField(3, 'uint32'),
    userInfo: ProtoField(4, {
      fileName: ProtoField(1, 'string', 'repeated'),
      deleteFile: ProtoField(2, 'string', 'repeated'),
      bid: ProtoField(3, 'string'),
      maxRoamSize: ProtoField(4, 'uint32'),
    }),
    /** 每个 emoji 对应的 type（与 fileName 等长） */
    emojiType: ProtoField(5, 'uint32', 'repeated'),
  })

  /** Faceroam.OpReq 删除响应 */
  export const FaceroamDeleteResp = ProtoMessage.of({
    retCode: ProtoField(1, 'uint32'),
    errMsg: ProtoField(2, 'string'),
    subCmd: ProtoField(3, 'uint32'),
    results: ProtoField(5, {
      emojiId: ProtoField(1, 'string'),
      status: ProtoField(2, 'uint32'),
    }, 'repeated'),
  })

  /** SSO `ImgStore.BDHExpressionRoam` 收藏表情上传请求（add）。 */
  export const BDHExpressionRoamReq = ProtoMessage.of({
    field1: ProtoField(1, 'uint32'),
    field2: ProtoField(2, 'uint32'),
    body: ProtoField(3, {
      field1: ProtoField(1, 'uint32'),
      uin: ProtoField(2, 'uint64'),
      field3: ProtoField(3, 'uint32'),
      /** 表情图 md5（16 字节二进制，不是 hex 字符串） */
      md5: ProtoField(4, 'bytes'),
      fileSize: ProtoField(5, 'uint32'),
      field7: ProtoField(7, 'uint32'),
      field8: ProtoField(8, 'uint32'),
      field9: ProtoField(9, 'uint32'),
      version: ProtoField(13, 'string'),
      field16: ProtoField(16, 'uint32'),
    }),
    /** 对应 highway commandId（add 走 cmd=9） */
    commandId: ProtoField(7, 'uint32'),
    extension: ProtoField(1001, 'bytes', 'optional'),
  })

  /** ImgStore.BDHExpressionRoam 响应：含 uKey + 上传服务器列表 + 最终 emoji 路径 */
  export const BDHExpressionRoamResp = ProtoMessage.of({
    field1: ProtoField(1, 'uint64'),
    field2: ProtoField(2, 'uint32'),
    body: ProtoField(3, {
      retCode: ProtoField(1, 'uint32'),
      field2: ProtoField(2, 'uint32'),
      field4: ProtoField(4, 'uint32'),
      uploadIps: ProtoField(6, 'uint32', 'repeated'),
      uploadPorts: ProtoField(7, 'uint32', 'repeated'),
      /** highway upload 用的 ticket */
      uKey: ProtoField(8, 'bytes', 'optional'),
      field9: ProtoField(9, 'uint32', 'optional'),
      field10: ProtoField(10, 'uint32', 'optional'),
      field11: ProtoField(11, 'uint32', 'optional'),
      field12: ProtoField(12, 'uint32', 'optional'),
      ext: ProtoField(1018, {
        domain: ProtoField(1, 'string'),
        path1: ProtoField(2, 'string', 'optional'),
        path2: ProtoField(3, 'string', 'optional'),
        emojiId: ProtoField(5, 'string'),
      }, 'optional'),
    }),
  })

  /** trpc.msg.register_proxy.RegisterProxy.InfoSyncPush 内 GroupNode（每个群的最新 seq 等） */
  export const InfoSyncPushGroupNode = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint64'),
    groupSeq: ProtoField(2, 'uint64'),
    readMsgSeq: ProtoField(3, 'uint64', 'optional'),
    latestMsgTime: ProtoField(8, 'uint64', 'optional'),
  })

  export const InfoSyncPush = ProtoMessage.of({
    groupNodes: ProtoField(6, InfoSyncPushGroupNode, 'repeated'),
  })
}
