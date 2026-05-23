import { ProtoField, ProtoMessage } from '@saltify/typeproto'

export namespace Misc {
  export const UserInfoLabel = ProtoMessage.of({
    labels: ProtoField(1, {
      content: ProtoField(4, 'string')
    }, 'repeated')
  })

  export const UserInfoBusiness = ProtoMessage.of({
    body: ProtoField(3, {
      msg: ProtoField(1, 'string'),
      lists: ProtoField(3, {
        type: ProtoField(1, 'uint32'),
        field2: ProtoField(2, 'uint32'),
        isYear: ProtoField(3, 'uint32'),
        level: ProtoField(4, 'uint32'),
        isPro: ProtoField(5, 'uint32'),
        icon1: ProtoField(6, 'string'),
        icon2: ProtoField(7, 'string')
      }, 'repeated')
    })
  })
}
