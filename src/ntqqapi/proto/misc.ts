import { ProtoField, ProtoMessage } from '@saltify/typeproto'

export namespace Misc {
  export const UserInfoLabel = ProtoMessage.of({
    labels: ProtoField(1, {
      content: ProtoField(4, 'string')
    }, 'repeated')
  })
}
