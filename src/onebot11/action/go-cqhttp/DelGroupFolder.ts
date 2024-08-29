import BaseAction from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  folder_id: string
}

export class GoCQHTTPDelGroupFolder extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_DelGroupFolder

  async _handle(payload: Payload) {
    await this.ctx.ntGroupApi.deleteGroupFileFolder(payload.group_id.toString(), payload.folder_id)
    return null
  }
}