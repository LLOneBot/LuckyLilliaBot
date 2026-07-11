import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  name: string
  parent_id?: '/'
}

interface Response {
  folder_id: string
}

export class CreateGroupFileFolder extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_CreateGroupFileFolder
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    name: Schema.string().required(),
  })

  async _handle(payload: Payload) {
    const result = await this.ctx.ntGroupApi.createGroupFolder(+payload.group_id, payload.name)
    if (result.retCode !== 0) {
      throw new Error(result.clientWording)
    }
    return {
      folder_id: result.folderInfo.folderId
    }
  }
}
