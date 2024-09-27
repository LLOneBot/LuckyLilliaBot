import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { pathToFileURL } from 'node:url'
import { ChatType } from '@/ntqqapi/types'
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
    if (file.length > 0) {
      const { msgId, chatType, peerUid, elementId } = file[0]
      const path = await this.ctx.ntFileApi.downloadMedia(msgId, chatType, peerUid, elementId)
      return {
        url: pathToFileURL(path).href
      }
    } else {
      const groupId = payload.group_id.toString()
      const modelId = await this.search(groupId, payload.file_id)
      if (modelId) {
        const peer = {
          chatType: ChatType.Group,
          peerUid: groupId,
          guildId: ''
        }
        const path = await this.ctx.ntFileApi.downloadFileForModelId(peer, modelId)
        return {
          url: pathToFileURL(path).href
        }
      }
      throw new Error('file not found')
    }
  }

  private async search(groupId: string, fileId: string, folderId?: string) {
    let modelId: string | undefined
    let nextIndex: number | undefined
    let folders: GroupFileInfo['item'] = []
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
        modelId = file.fileInfo?.fileModelId
        break
      }
      folders.push(...res.item.filter(item => item.folderInfo?.totalFileCount))
      nextIndex = res.nextIndex
    }
    if (!modelId) {
      for (const item of folders) {
        const res = await this.search(groupId, fileId, item.folderInfo?.folderId)
        if (res) {
          modelId = res
          break
        }
      }
    }
    return modelId
  }
}
