import { ProtoField, ProtoMessage } from '@saltify/typeproto'

export namespace Notify {
  export const GroupMemberChange = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    memberUid: ProtoField(3, 'string'),
    type: ProtoField(4, 'uint32'),
    adminUid: ProtoField(5, 'string')
  })

  export const ProfileLike = ProtoMessage.of({
    msgType: ProtoField(1, 'uint32'),
    subType: ProtoField(2, 'uint32'),
    content: ProtoField(203, {
      msg: ProtoField(14, {
        count: ProtoField(1, 'uint32'),
        time: ProtoField(2, 'uint32'),
        detail: ProtoField(3, {
          txt: ProtoField(1, 'string'),
          uin: ProtoField(3, 'uint32'),
          nickname: ProtoField(5, 'string')
        })
      })
    })
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

  export const FriendDeleteOrPinChange = ProtoMessage.of({
    body: ProtoField(1, {
      type: ProtoField(2, 'uint32'),
      pinChanged: ProtoField(20, {
        body: ProtoField(1, {
          uid: ProtoField(1, 'string'),
          groupCode: ProtoField(2, 'uint32', 'optional'),
          info: ProtoField(400, {
            timestamp: ProtoField(2, 'bytes'),
          })
        })
      }, 'optional')
    })
  })

  export const GroupRecall = ProtoMessage.of({
    operatorUid: ProtoField(1, 'string', 'optional'),
    info: ProtoField(3, {
      sequence: ProtoField(1, 'uint64'),
      time: ProtoField(2, 'uint32'),
      random: ProtoField(3, 'uint32'),
      authorUid: ProtoField(6, 'string'),
    }),
    tipInfo: ProtoField(9, {
      tip: ProtoField(2, 'string', 'optional')
    }, 'optional'),
  })

  export const FriendRecall = ProtoMessage.of({
    body: ProtoField(1, {
      fromUid: ProtoField(1, 'string'),
      toUid: ProtoField(2, 'string'),
      clientSequence: ProtoField(3, 'uint32'),
      sequence: ProtoField(20, 'uint64'),
      tipInfo: ProtoField(13, {
        tip: ProtoField(2, 'string', 'optional')
      }, 'optional'),
    })
  })

  export const FriendRequest = ProtoMessage.of({
    body: ProtoField(1, {
      fromUid: ProtoField(2, 'string'),
      message: ProtoField(10, 'string', 'optional'),
      via: ProtoField(11, 'string', 'optional'),
    })
  })

  export const GroupReaction = ProtoMessage.of({
    data: ProtoField(1, {
      data: ProtoField(1, {
        target: ProtoField(2, {
          sequence: ProtoField(1, 'uint32')
        }),
        data: ProtoField(3, {
          code: ProtoField(1, 'string'),
          count: ProtoField(3, 'uint32', 'optional'),
          operatorUid: ProtoField(4, 'string'),
          type: ProtoField(5, 'uint32'),
        }),
      }),
    }),
  })

  export const GeneralGrayTip = ProtoMessage.of({
    bizType: ProtoField(1, 'uint32'),
    templateParams: ProtoField(7, {
      key: ProtoField(1, 'string'),
      value: ProtoField(2, 'string'),
    }, 'repeated'),
  })

  export const GroupMute = ProtoMessage.of({
    groupCode: ProtoField(1, 'uint32'),
    operatorUid: ProtoField(4, 'string', 'optional'),
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
}
