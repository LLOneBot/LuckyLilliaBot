import BaseAction from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  name: string
  parent_id?: '/'
}

export class CreateGroupFileFolder extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_CreateGroupFileFolder

  async _handle(payload: Payload) {
    await this.ctx.ntGroupApi.createGroupFileFolder(payload.group_id.toString(), payload.name)
    return null
  }
}