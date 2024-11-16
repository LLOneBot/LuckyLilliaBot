import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: string,
  remark?: string
}

export class SetGroupRemark extends BaseAction<Payload, unknown> {
  actionName = ActionName.SetGroupRemark

  protected async _handle(payload: Payload): Promise<unknown>{
    return this.ctx.ntGroupApi.setGroupRemark(payload.group_id.toString(), payload.remark)
  }
}
