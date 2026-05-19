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

  /** trpc.msg.register_proxy.RegisterProxy.SsoGetGroupMsg - 拉群历史消息 */
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

  /** trpc.msg.register_proxy.RegisterProxy.SsoGetC2CMsg - 拉私聊历史消息 */
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

  /** trpc.msg.msg_svc.MsgService.SsoGroupRecallMsg - 撤回群消息 */
  export const SsoGroupRecallMsgReq = ProtoMessage.of({
    type: ProtoField(1, 'uint32'),
    groupCode: ProtoField(2, 'uint32'),
    info: ProtoField(3, {
      sequence: ProtoField(1, 'uint32'),
    }),
  })

  /** trpc.msg.msg_svc.MsgService.SsoC2CRecallMsg - 撤回私聊消息 */
  export const SsoC2CRecallMsgReq = ProtoMessage.of({
    type: ProtoField(1, 'uint32'),
    targetUid: ProtoField(3, 'string'),
    info: ProtoField(4, {
      clientSequence: ProtoField(1, 'uint32'),
      random: ProtoField(2, 'uint32'),
      messageUid: ProtoField(3, 'uint64'),
      timestamp: ProtoField(4, 'uint32'),
      field5: ProtoField(5, 'uint32'),
      ntMsgSeq: ProtoField(6, 'uint32'),
    }),
    field5: ProtoField(5, {
      field1: ProtoField(1, 'uint32'),
      field2: ProtoField(2, 'uint32'),
    }),
    field6: ProtoField(6, 'uint32'),
  })

  /** trpc.qq_new_tech.status_svc.StatusService.SetStatus */
  export const SetStatusReq = ProtoMessage.of({
    field1: ProtoField(1, 'uint32'),    // 10 (or 0 per v1)
    status: ProtoField(2, 'uint32'),
    extStatus: ProtoField(3, 'uint32'),
    customExt: ProtoField(4, {
      faceId: ProtoField(1, 'uint32'),
      text: ProtoField(2, 'string'),
      field3: ProtoField(3, 'uint32'),  // 1
    }, 'optional'),
  })

  export const SetStatusResp = ProtoMessage.of({
    message: ProtoField(2, 'string'),
  })
}
