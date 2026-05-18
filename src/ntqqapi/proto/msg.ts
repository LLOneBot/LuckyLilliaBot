import { ProtoField, ProtoMessage } from '@saltify/typeproto'

export namespace Msg {
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
      level: ProtoField(3, 'uint32', 'optional'),
      uin: ProtoField(9, 'uint64', 'optional'),
    }, 'optional'),
    videoFile: ProtoField(19, {
      fileUuid: ProtoField(1, 'string', 'optional'),
      fileMd5: ProtoField(2, 'bytes', 'optional'),
      fileName: ProtoField(3, 'string', 'optional'),
      fileFormat: ProtoField(4, 'uint32', 'optional'),
      fileTime: ProtoField(5, 'uint32', 'optional'),
      fileSize: ProtoField(6, 'uint32', 'optional'),
      thumbWidth: ProtoField(7, 'uint32', 'optional'),
      thumbHeight: ProtoField(8, 'uint32', 'optional'),
      thumbFileMd5: ProtoField(9, 'bytes', 'optional'),
    }, 'optional'),
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
        friendName: ProtoField(6, 'string')
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
    }),
    contentHead: ProtoField(2, {
      // 注意：发送 PbSendMsg 时，contentHead 是 SendContentHead（参考 Lagrange）
      // 而不是 OlPush 收到的 ContentHead（field 1=msgType）
      pkgNum: ProtoField(1, 'uint32', 'optional'),
      pkgIndex: ProtoField(2, 'uint32', 'optional'),
      divSeq: ProtoField(3, 'uint32', 'optional'),
      autoReply: ProtoField(4, 'uint32', 'optional'),
    }, 'optional'),
    body: ProtoField(3, {
      richText: ProtoField(1, {
        elems: ProtoField(2, Elem, 'repeated'),
      }),
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
}
