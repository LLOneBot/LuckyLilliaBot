import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'
import { GroupMsgMask } from '@/ntqqapi/api'

interface Payload {
  group_id: string,
  mask: GroupMsgMask
}

export class SetGroupMsgMask extends BaseAction<Payload, unknown> {
  actionName = ActionName.SetGroupMsgMask

  protected async _handle(payload: Payload): Promise<unknown>{
    return this.ctx.ntGroupApi.setGroupMsgMask(payload.group_id.toString(), +payload.mask)
  }
}
