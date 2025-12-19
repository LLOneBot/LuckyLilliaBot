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
}
