import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { GroupFileInfo } from '@/ntqqapi/types'

export interface Payload {
  group_id: number | string
  file_id: string
  busid?: number
}

export interface Response {
  url: string
}

export class GetGroupFileUrl extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetGroupFileUrl
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    file_id: Schema.string().required()
  })

  protected async _handle(payload: Payload) {
    const file = await this.ctx.store.getFileCacheById(payload.file_id)
    const url = await this.ctx.app.pmhq.getGroupFileUrl(+payload.group_id, payload.file_id)
    if (file.length > 0) {
      return { url: url + encodeURIComponent(file[0].fileName) }
    } else {
      const groupId = payload.group_id.toString()
      const fileName = await this.search(groupId, payload.file_id)
      if (fileName) {
        return { url: url + encodeURIComponent(fileName) }
      } else {
        return { url }
      }
    }
  }

  private async search(groupId: string, fileId: string, folderId?: string) {
    let fileName: string | undefined
    let nextIndex: number | undefined
    const folders: GroupFileInfo['item'] = []
    while (nextIndex !== 0) {
      const res = await this.ctx.ntGroupApi.getGroupFileList(groupId, {
        sortType: 1,
        fileCount: 100,
        startIndex: nextIndex ?? 0,
        sortOrder: 2,
        showOnlinedocFolder: 0,
        folderId
      })
      const file = res.item.find(item => item.fileInfo?.fileId === fileId)
      if (file) {
        fileName = file.fileInfo?.fileName
        break
      }
      folders.push(...res.item.filter(item => item.folderInfo?.totalFileCount))
      nextIndex = res.nextIndex
    }
    if (!fileName) {
      for (const item of folders) {
        const res = await this.search(groupId, fileId, item.folderInfo?.folderId)
        if (res) {
          fileName = res
          break
        }
      }
    }
    return fileName
  }
}
