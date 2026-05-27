import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
}

interface Response {
  file_count: number
  limit_count: number
  used_space: number
  total_space: number
}

export class GetGroupFileSystemInfo extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetGroupFileSystemInfo
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  async _handle(payload: Payload) {
    const groupId = +payload.group_id
    const [count, space] = await Promise.all([
      this.ctx.ntGroupApi.getGroupFileCount(groupId),
      this.ctx.ntGroupApi.getGroupFileSpace(groupId),
    ])
    return {
      file_count: count.fileCount,
      limit_count: count.limitCount,
      used_space: Number(space.usedSpace),
      total_space: Number(space.totalSpace),
    }
  }
}
