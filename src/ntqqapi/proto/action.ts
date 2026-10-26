import { ProtoField, ProtoMessage } from '@saltify/typeproto'

export namespace Action {
  const LongMsgPeer = ProtoMessage.of({
    uid: ProtoField(2, 'string')
  })

  const LongMsgSettings = ProtoMessage.of({
    field1: ProtoField(1, 'uint32'),
    field2: ProtoField(2, 'uint32'),
    field3: ProtoField(3, 'uint32'),
    field4: ProtoField(4, 'uint32')
  })

  export const SendLongMsgReq = ProtoMessage.of({
    info: ProtoField(2, {
      type: ProtoField(1, 'uint32'),
      peer: ProtoField(2, LongMsgPeer),
      groupCode: ProtoField(3, 'uint32'),
      payload: ProtoField(4, 'bytes')
    }),
    settings: ProtoField(15, LongMsgSettings)
  })

  export const SendLongMsgResp = ProtoMessage.of({
    result: ProtoField(2, {
      resId: ProtoField(3, 'string')
    }),
    settings: ProtoField(15, LongMsgSettings)
  })

  export const PullPicsReq = ProtoMessage.of({
    uin: ProtoField(2, 'uint32'),
    field3: ProtoField(3, 'uint32'),
    word: ProtoField(6, 'string'),
    word2: ProtoField(7, 'string'),
    field8: ProtoField(8, 'uint32'),
    field9: ProtoField(9, 'uint32'),
    field14: ProtoField(14, 'uint32')
  })

  export const PullPicsResp = ProtoMessage.of({
    info: ProtoField(3, {
      url: ProtoField(5, 'string')
    }, 'repeated')
  })

  export const RecvLongMsgReq = ProtoMessage.of({
    info: ProtoField(1, {
      peer: ProtoField(1, LongMsgPeer),
      resId: ProtoField(2, 'string'),
      acquire: ProtoField(3, 'bool')
    }),
    settings: ProtoField(15, LongMsgSettings)
  })

  export const RecvLongMsgResp = ProtoMessage.of({
    result: ProtoField(1, {
      resId: ProtoField(3, 'string'),
      payload: ProtoField(4, 'bytes')
    }),
    settings: ProtoField(15, LongMsgSettings)
  })

  export const FetchUserLoginDaysReq = ProtoMessage.of({
    field2: ProtoField(2, 'uint32'),
    json: ProtoField(3, 'string')
  })

  export const FetchUserLoginDaysResp = ProtoMessage.of({
    json: ProtoField(4, 'string')
  })

  /** trpc.msg.register_proxy.RegisterProxy.SsoGetGroupMsg */
  export const SsoGetGroupMsgReq = ProtoMessage.of({
    groupInfo: ProtoField(1, {
      groupCode: ProtoField(1, 'uint32'),
      startSequence: ProtoField(2, 'uint32'),
      endSequence: ProtoField(3, 'uint32'),
    }),
    filter: ProtoField(2, 'uint32'),
  })

  export const SsoGetGroupMsgResp = ProtoMessage.of({
    retcode: ProtoField(1, 'uint32'),
    errorMsg: ProtoField(2, 'string', 'optional'),
    body: ProtoField(3, {
      groupCode: ProtoField(3, 'uint32'),
      startSequence: ProtoField(4, 'uint32'),
      endSequence: ProtoField(5, 'uint32'),
      messages: ProtoField(6, 'bytes', 'repeated'),
    }),
  })

  /** trpc.msg.register_proxy.RegisterProxy.SsoGetC2CMsg */
  export const SsoGetC2CMsgReq = ProtoMessage.of({
    peerUid: ProtoField(2, 'string'),
    startSequence: ProtoField(3, 'uint32'),
    endSequence: ProtoField(4, 'uint32'),
  })

  export const SsoGetC2CMsgResp = ProtoMessage.of({
    retcode: ProtoField(1, 'uint32'),
    errorMsg: ProtoField(2, 'string', 'optional'),
    messages: ProtoField(7, 'bytes', 'repeated'),
  })

  /** trpc.msg.register_proxy.RegisterProxy.SsoGetRoamMsg, 按时间拉 */
  export const SsoGetRoamMsgReq = ProtoMessage.of({
    peerUid: ProtoField(1, 'string'),
    time: ProtoField(2, 'uint32'),       // 0 表示从当前时间起
    random: ProtoField(3, 'uint32'),     // 0 即可
    count: ProtoField(4, 'uint32'),      // 最大 30
    direction: ProtoField(5, 'uint32'),  // 1=向上(更新)；2=向下(更早)
  })

  export const SsoGetRoamMsgResp = ProtoMessage.of({
    peerUid: ProtoField(3, 'string', 'optional'),
    isComplete: ProtoField(4, 'bool', 'optional'),
    timestamp: ProtoField(5, 'uint32', 'optional'),
    random: ProtoField(6, 'uint32', 'optional'),
    messages: ProtoField(7, 'bytes', 'repeated'),
  })

  /** trpc.msg.msg_svc.MsgService.SsoGroupRecallMsg */
  export const SsoGroupRecallMsgReq = ProtoMessage.of({
    type: ProtoField(1, 'uint32'),
    groupCode: ProtoField(2, 'uint32'),
    info: ProtoField(3, {
      sequence: ProtoField(1, 'uint32'),
    }),
  })

  /** trpc.msg.msg_svc.MsgService.SsoC2CRecallMsg */
  export const SsoC2CRecallMsgReq = ProtoMessage.of({
    type: ProtoField(1, 'uint32'),
    targetUid: ProtoField(3, 'string'),
    info: ProtoField(4, {
      /** PbSendMsg 时的 clientSequence */
      clientSequence: ProtoField(1, 'uint32'),
      random: ProtoField(2, 'uint32'),
      /** (0x01000000<<32) | random */
      messageUid: ProtoField(3, 'uint64'),
      /** PbSendMsgResp.sendTime */
      timestamp: ProtoField(4, 'uint32'),
      field5: ProtoField(5, 'uint32'),
      /** PbSendMsgResp.c2cMsgSeq */
      c2cMsgSeq: ProtoField(6, 'uint32'),
    }),
    field5: ProtoField(5, {
      field1: ProtoField(1, 'uint32'),
      field2: ProtoField(2, 'uint32'),
    }),
    field6: ProtoField(6, 'uint32'),
  })

  /** trpc.qq_new_tech.status_svc.StatusService.SetStatus */
  export const SetStatusReq = ProtoMessage.of({
    status: ProtoField(1, 'uint32'),
    extStatus: ProtoField(2, 'uint32'),
    batteryStatus: ProtoField(3, 'uint32'),
    customExt: ProtoField(4, {
      faceId: ProtoField(1, 'uint32'),
      text: ProtoField(2, 'string'),
      field3: ProtoField(3, 'uint32'),  // 1
    }, 'optional'),
  })

  export const SetStatusResp = ProtoMessage.of({
    retCode: ProtoField(1, 'uint32'),
    message: ProtoField(2, 'string'),
  })

  // ─── 群相册 (QunAlbum.trpc.qzone.webapp_qun_media.QunMedia.GetAlbumList) ───
  const QunAlbumPhotoUrl = ProtoMessage.of({
    url: ProtoField(1, 'string'),
    width: ProtoField(2, 'uint32'),
    height: ProtoField(3, 'uint32'),
  })

  const QunAlbumThumbnail = ProtoMessage.of({
    spec: ProtoField(1, 'uint32'),
    url: ProtoField(2, QunAlbumPhotoUrl),
  })

  const QunAlbumImage = ProtoMessage.of({
    lloc: ProtoField(3, 'string'),
    photoUrl: ProtoField(4, QunAlbumThumbnail, 'repeated'),
    defaultUrl: ProtoField(5, QunAlbumPhotoUrl, 'optional'),
  })

  const QunAlbumCover = ProtoMessage.of({
    type: ProtoField(1, 'uint32'),
    image: ProtoField(2, QunAlbumImage, 'optional'),
  })

  const QunAlbumCreator = ProtoMessage.of({
    nick: ProtoField(2, 'string'),
    uin: ProtoField(13, 'string'),
  })

  const QunAlbumRecord = ProtoMessage.of({
    albumId: ProtoField(1, 'string'),
    owner: ProtoField(2, 'string'),
    name: ProtoField(3, 'string'),
    desc: ProtoField(4, 'string'),
    createTime: ProtoField(5, 'uint32'),
    modifyTime: ProtoField(6, 'uint32'),
    lastUploadTime: ProtoField(7, 'uint32'),
    uploadNumber: ProtoField(8, 'uint32'),
    cover: ProtoField(9, QunAlbumCover, 'optional'),
    creator: ProtoField(10, QunAlbumCreator, 'optional'),
  })

  const QunAlbumMetaHeader = ProtoMessage.of({
    name: ProtoField(1, 'string'),
    value: ProtoField(2, 'string'),
  })

  const QunAlbumReqBody = ProtoMessage.of({
    groupCode: ProtoField(1, 'string'),
    albumId: ProtoField(2, 'bytes'),
  })

  export const GetAlbumListReq = ProtoMessage.of({
    field1: ProtoField(1, 'uint32'),
    field2: ProtoField(2, 'bytes'),
    field3: ProtoField(3, 'bytes'),
    body: ProtoField(4, QunAlbumReqBody),
    sessionId: ProtoField(5, 'string'),
    headers: ProtoField(10, QunAlbumMetaHeader, 'repeated'),
  })

  export const GetAlbumListResp = ProtoMessage.of({
    retCode: ProtoField(2, 'uint32'),
    retMsg: ProtoField(3, 'string'),
    body: ProtoField(4, {
      albums: ProtoField(1, QunAlbumRecord, 'repeated'),
    }, 'optional'),
  })

  /** QunAlbum.trpc.qzone.webapp_qun_media.QunMedia.AddAlbum */
  export const AddAlbumReq = ProtoMessage.of({
    requestId: ProtoField(1, 'uint32'),
    field2: ProtoField(2, 'bytes'),
    field3: ProtoField(3, 'bytes'),
    body: ProtoField(4, {
      info: ProtoField(1, {
        groupCode: ProtoField(2, 'string'),
        name: ProtoField(3, 'string'),
        desc: ProtoField(4, 'string'),
        field5: ProtoField(5, 'uint32'),
      }),
    }),
    sessionId: ProtoField(5, 'string'),
    headers: ProtoField(10, QunAlbumMetaHeader, 'repeated'),
  })

  export const AddAlbumResp = ProtoMessage.of({
    requestId: ProtoField(1, 'uint32'),
    retCode: ProtoField(2, 'uint32'),
    retMsg: ProtoField(3, 'string'),
    body: ProtoField(4, {
      info: ProtoField(1, {
        albumId: ProtoField(1, 'string'),
        groupCode: ProtoField(2, 'string'),
        name: ProtoField(3, 'string'),
        desc: ProtoField(4, 'string'),
      }),
    }, 'optional'),
  })

  /** QunAlbum.trpc.qzone.webapp_qun_media.QunMedia.DeleteAlbum */
  export const DeleteAlbumReq = ProtoMessage.of({
    requestId: ProtoField(1, 'uint32'),
    field2: ProtoField(2, 'bytes'),
    field3: ProtoField(3, 'bytes'),
    body: ProtoField(4, {
      groupCode: ProtoField(1, 'string'),
      albumId: ProtoField(2, 'string'),
    }),
    sessionId: ProtoField(5, 'string'),
    headers: ProtoField(10, QunAlbumMetaHeader, 'repeated'),
  })

  export const DeleteAlbumResp = ProtoMessage.of({
    retCode: ProtoField(2, 'uint32'),
    retMsg: ProtoField(3, 'string'),
  })

  const QunMediaImage = ProtoMessage.of({
    lloc: ProtoField(3, 'string'),
    photoUrl: ProtoField(4, QunAlbumThumbnail, 'repeated'),
    defaultUrl: ProtoField(5, QunAlbumPhotoUrl, 'optional'),
  })

  const QunMediaVideo = ProtoMessage.of({
    id: ProtoField(1, 'string'),
    url: ProtoField(2, 'string'),
    cover: ProtoField(3, {
      lloc: ProtoField(3, 'string'),
      photoUrl: ProtoField(4, QunAlbumThumbnail, 'repeated'),
      defaultUrl: ProtoField(5, QunAlbumPhotoUrl, 'optional'),
    }),
    width: ProtoField(4, 'uint32'),
    height: ProtoField(5, 'uint32'),
    videoTime: ProtoField(6, 'uint32'),
    videoUrl: ProtoField(7, {
      spec: ProtoField(1, 'uint32'),
      url: ProtoField(2, {
        url: ProtoField(1, 'string'),
        width: ProtoField(2, 'uint32'),
        height: ProtoField(3, 'uint32'),
      }),
    }, 'repeated'),
  })

  const QunMediaItem = ProtoMessage.of({
    type: ProtoField(1, 'uint32'),
    image: ProtoField(2, QunMediaImage, 'optional'),
    video: ProtoField(3, QunMediaVideo, 'optional'),
    desc: ProtoField(4, 'string'),
    uploader: ProtoField(6, 'string'),
    batchId: ProtoField(7, 'uint32'),
    uploadTime: ProtoField(8, 'uint32'),
    like: ProtoField(10, {
      key: ProtoField(1, 'string'),
    }, 'optional'),
  })

  /** QunAlbum.trpc.qzone.webapp_qun_media.QunMedia.GetMediaList */
  export const GetMediaListReq = ProtoMessage.of({
    field1: ProtoField(1, 'uint32'),
    field2: ProtoField(2, 'bytes'),
    field3: ProtoField(3, 'bytes'),
    body: ProtoField(4, {
      groupCode: ProtoField(1, 'string'),
      albumId: ProtoField(2, 'string'),
      field3: ProtoField(3, 'uint32'),
      field4: ProtoField(4, 'bytes'),
      attachInfo: ProtoField(5, 'string'),
    }),
    sessionId: ProtoField(5, 'string'),
    headers: ProtoField(10, QunAlbumMetaHeader, 'repeated'),
  })

  export const GetMediaListResp = ProtoMessage.of({
    retCode: ProtoField(2, 'uint32'),
    retMsg: ProtoField(3, 'string'),
    body: ProtoField(4, {
      album: ProtoField(1, QunAlbumRecord, 'optional'),
      mediaList: ProtoField(3, QunMediaItem, 'repeated'),
      nextAttachInfo: ProtoField(5, 'string'),
      nextHasMore: ProtoField(7, 'bool')
    }, 'optional'),
  })

  /** trpc.msg.msg_svc.MsgService.SsoGetPeerSeq, 只支持私聊 */
  export const SsoGetPeerSeqReq = ProtoMessage.of({
    peerUid: ProtoField(1, 'string'),
  })

  export const SsoGetPeerSeqResp = ProtoMessage.of({
    retCode: ProtoField(1, 'uint32'),
    retMsg: ProtoField(2, 'string'),
    /** c2cMsgSeq, 通常等于 seq2 */
    seq1: ProtoField(3, 'uint32'),
    /** 偶尔比 seq1 大 1 */
    seq2: ProtoField(4, 'uint32'),
    latestMsgTime: ProtoField(5, 'uint32'),
  })

  /** trpc.msg.msg_svc.MsgService.SsoReadedReport */
  export const SsoReadedReportReq = ProtoMessage.of({
    group: ProtoField(1, {
      groupCode: ProtoField(1, 'uint32'),
      startSequence: ProtoField(2, 'uint32')
    }, 'optional'),
    c2c: ProtoField(2, {
      targetUid: ProtoField(2, 'string'),
      time: ProtoField(3, 'uint32'),
      startSequence: ProtoField(4, 'uint32')
    }, 'optional')
  })

  export const SsoReadedReportResp = ProtoMessage.of({
    retCode: ProtoField(1, 'uint32'),
    retMsg: ProtoField(2, 'string')
  })
}
