import BaseAction from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number
  group_name: string
}

export default class SetGroupName extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupName

  protected async _handle(payload: Payload): Promise<null> {
    await this.ctx.ntGroupApi.setGroupName(payload.group_id.toString(), payload.group_name)
    return null
  }
}
