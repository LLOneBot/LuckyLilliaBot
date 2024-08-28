import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { NTQQFriendApi } from '../../../ntqqapi/api/friend'

interface Payload {
  flag: string
  approve?: boolean | string
  remark?: string
}

export default class SetFriendAddRequest extends BaseAction<Payload, null> {
  actionName = ActionName.SetFriendAddRequest

  protected async _handle(payload: Payload): Promise<null> {
    const approve = payload.approve?.toString() !== 'false'
    await this.ctx.ntFriendApi.handleFriendRequest(payload.flag, approve)
    return null
  }
}
