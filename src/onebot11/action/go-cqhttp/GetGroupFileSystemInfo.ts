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
    const groupId = payload.group_id.toString()
    const fileCount = await this.ctx.ntGroupApi.getGroupFileCount(groupId)
    if (fileCount.result !== 0) {
      throw new Error(fileCount.errMsg)
    }
    const fileSpace = await this.ctx.ntGroupApi.getGroupFileSpace(groupId)
    if (fileSpace.result !== 0) {
      throw new Error(fileSpace.errMsg)
    }
    return {
      file_count: fileCount.groupFileCounts[0],
      limit_count: 10000,
      used_space: +fileSpace.groupSpaceResult.usedSpace,
      total_space: +fileSpace.groupSpaceResult.totalSpace,
    }
  }
}
