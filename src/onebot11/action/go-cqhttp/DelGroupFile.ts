import BaseAction from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: string | number
  file_id: string
  busid?: 102
}

export class DelGroupFile extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_DelGroupFile

  async _handle(payload: Payload) {
    await this.ctx.ntGroupApi.deleteGroupFile(payload.group_id.toString(), [payload.file_id])
    return null
  }
}