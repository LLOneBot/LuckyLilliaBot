import BaseAction from '../BaseAction'
import { GroupRequestOperateTypes } from '@/ntqqapi/types'
import { ActionName } from '../types'

interface Payload {
  flag: string
  approve?: boolean | string
  reason?: string
}

export default class SetGroupAddRequest extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupAddRequest

  protected async _handle(payload: Payload): Promise<null> {
    const flag = payload.flag.toString()
    const approve = payload.approve?.toString() !== 'false'
    await this.ctx.ntGroupApi.handleGroupRequest(flag,
      approve ? GroupRequestOperateTypes.approve : GroupRequestOperateTypes.reject,
      payload.reason || ''
    )
    return null
  }
}
