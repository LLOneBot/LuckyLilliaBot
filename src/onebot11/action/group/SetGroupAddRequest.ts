import BaseAction from '../BaseAction'
import { GroupRequestOperateTypes } from '../../../ntqqapi/types'
import { ActionName } from '../types'
import { NTQQGroupApi } from '../../../ntqqapi/api/group'

interface Payload {
  flag: string
  // sub_type: "add" | "invite",
  // type: "add" | "invite"
  approve: boolean
  reason: string
}

export default class SetGroupAddRequest extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupAddRequest

  protected async _handle(payload: Payload): Promise<null> {
    const seq = payload.flag.toString()
    const approve = payload.approve.toString() === 'true'
    await NTQQGroupApi.handleGroupRequest(
      seq,
      approve ? GroupRequestOperateTypes.approve : GroupRequestOperateTypes.reject,
      payload.reason,
    )
    return null
  }
}
