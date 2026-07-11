import { ProtoField, ProtoMessage } from '@saltify/typeproto'

export namespace Notify {
  export const GroupMemberChange = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    memberUid: ProtoField(3, 'string'),
    type: ProtoField(4, 'uint32'),
    adminUid: ProtoField(5, 'string')
  })

  const GroupAdminExtra = ProtoMessage.of({
    adminUid: ProtoField(1, 'string'),
    isPromote: ProtoField(2, 'bool')
  })

  export const GroupAdminChange = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    flag: ProtoField(2, 'uint32'),
    isPromote: ProtoField(3, 'bool'),
    body: ProtoField(4, {
      extraDisable: ProtoField(1, GroupAdminExtra, 'optional'),
      extraEnable: ProtoField(2, GroupAdminExtra, 'optional')
    })
  })

  export const FriendRelatedOrPinChange = ProtoMessage.of({
    body: ProtoField(1, {
      type: ProtoField(2, 'uint32'),
      friendDeleted: ProtoField(14, {
        uid: ProtoField(1, 'string')
      }, 'optional'),
      pinChanged: ProtoField(20, {
        body: ProtoField(1, {
          uid: ProtoField(1, 'string'),
          groupCode: ProtoField(2, 'uint32', 'optional'),
          info: ProtoField(400, {
            timestamp: ProtoField(2, 'bytes')
          })
        })
      }, 'optional'),
      profileLike: ProtoField(203, {
        msg: ProtoField(14, {
          count: ProtoField(1, 'uint32'),
          time: ProtoField(2, 'uint32'),
          detail: ProtoField(3, {
            txt: ProtoField(1, 'string'),
            uin: ProtoField(3, 'uint32'),
            nickname: ProtoField(5, 'string')
          })
        })
      }, 'optional')
    })
  })

  export const GroupRecall = ProtoMessage.of({
    operatorUid: ProtoField(1, 'string', 'optional'),
    recallMessages: ProtoField(3, {
      sequence: ProtoField(1, 'uint32'),
      time: ProtoField(2, 'uint32'),
      random: ProtoField(3, 'uint32'),
      type: ProtoField(4, 'uint32'),
      flag: ProtoField(5, 'uint32'),
      authorUid: ProtoField(6, 'string'),
    }, 'repeated'),
    userDef: ProtoField(5, 'bytes', 'optional'),
    groupType: ProtoField(6, 'uint32', 'optional'),
    opType: ProtoField(7, 'uint32', 'optional'),
    tipInfo: ProtoField(9, {
      tip: ProtoField(2, 'string', 'optional')
    }, 'optional'),
  })

  export const FriendRecall = ProtoMessage.of({
    body: ProtoField(1, {
      fromUid: ProtoField(1, 'string'),
      toUid: ProtoField(2, 'string'),
      clientSequence: ProtoField(3, 'uint32'),
      /** 被撤回消息的 msgUid（C2C 公式 (0x01000000<<32)|random） */
      msgUid: ProtoField(4, 'uint64'),
      /** 被撤回消息的 32-bit random，server 跨双端一致 */
      random: ProtoField(6, 'uint32'),
      tipInfo: ProtoField(13, {
        tip: ProtoField(2, 'string')
      }, 'optional'),
      sequence: ProtoField(20, 'uint32'),
    })
  })

  export const FriendRequest = ProtoMessage.of({
    body: ProtoField(1, {
      fromUid: ProtoField(2, 'string'),
      message: ProtoField(10, 'string'),
      via: ProtoField(11, 'string'),
    }, 'optional')
  })

  export const GroupReaction = ProtoMessage.of({
    data: ProtoField(1, {
      data: ProtoField(1, {
        target: ProtoField(2, {
          sequence: ProtoField(1, 'uint32'),
        }),
        data: ProtoField(3, {
          code: ProtoField(1, 'string'),
          reactionType: ProtoField(2, 'uint32'),
          count: ProtoField(3, 'uint32'),
          operatorUid: ProtoField(4, 'string'),
          actionType: ProtoField(5, 'uint32'),
        }),
      }),
    }),
  })

  export const GeneralGrayTip = ProtoMessage.of({
    bizType: ProtoField(1, 'uint32'),
    busiId: ProtoField(2, 'uint32'),
    ctrlFlag: ProtoField(3, 'uint32'),
    c2cType: ProtoField(4, 'uint32', 'optional'),
    serviceType: ProtoField(5, 'uint32', 'optional'),
    templId: ProtoField(6, 'uint32'),
    templParam: ProtoField(7, ['string', 'string']),
    content: ProtoField(8, 'string'),
    tipsSeqId: ProtoField(10, 'uint32'),
  })

  export const GroupMute = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    operatorUid: ProtoField(4, 'string'),
    info: ProtoField(5, {
      state: ProtoField(3, {
        targetUid: ProtoField(1, 'string', 'optional'),
        duration: ProtoField(2, 'uint32'),
      }),
    }),
  })

  export const GroupInvitation = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    invitorUid: ProtoField(5, 'string'),
  })

  export const GroupJoinRequest = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    memberUid: ProtoField(3, 'string'),
  })

  export const GroupInvitedJoinRequest = ProtoMessage.of({
    info: ProtoField(2, {
      inner: ProtoField(1, {
        groupCode: ProtoField(1, 'uint32'),
        targetUid: ProtoField(5, 'string'),
        invitorUid: ProtoField(6, 'string'),
      }),
    }),
  })

  export const GroupEssenceChange = ProtoMessage.of({
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
    setFlag2: ProtoField(11, 'uint32'),
  })

  /**
   * 0x2DC subtype 16/17/20 内部包装 (after 5-byte header [groupCode + 1 byte] + uint16BE 长度)
   */
  export const NotifyMessageBody = ProtoMessage.of({
    notifyType: ProtoField(1, 'uint32', 'optional'),
    groupCode: ProtoField(4, 'uint32', 'optional'),
    eventParam: ProtoField(5, 'bytes', 'optional'),
    recall: ProtoField(11, GroupRecall, 'optional'),
    subType: ProtoField(13, 'uint32', 'optional'),
    operatorUid: ProtoField(21, 'string', 'optional'),
    generalGrayTip: ProtoField(26, GeneralGrayTip, 'optional'),
    essenceMessage: ProtoField(33, GroupEssenceChange, 'optional'),
    msgSequence: ProtoField(37, 'uint64', 'optional'),
    reaction: ProtoField(44, GroupReaction, 'optional'),
  })

  /**
   * 0x2DC subType=16 + field13=12 = GroupNameChange。
   * 实测 push 把 NotifyMessageBody.eventParam (field 5) 设成这个 sub-msg 的 bytes。
   *   field 1 (uint32)  = 1 (常量?)
   *   field 2 (string)  = 新群名 ← 我们要的
   */
  export const GroupNameChangeBody = ProtoMessage.of({
    field1: ProtoField(1, 'uint32', 'optional'),
    newName: ProtoField(2, 'string'),
  })

  export const GroupRemoved = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32')
  })

  export const GroupJoined = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    adminUid: ProtoField(3, 'string')
  })

  export const FriendAdded = ProtoMessage.of({
    body: ProtoField(2, {
      friendUid: ProtoField(1, 'string')
    })
  })

  export const GroupMemberSpecialTitleChange = ProtoMessage.of({
    tipText: ProtoField(2, 'string'),
    memberUin: ProtoField(5, 'uint32')
  })
}
