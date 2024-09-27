import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { OB11GroupFile, OB11GroupFileFolder } from '@/onebot11/types'
import { GroupFileInfo } from '@/ntqqapi/types'

interface Payload {
  group_id: number | string
  folder_id: string
}

interface Response {
  files: OB11GroupFile[]
  folders: OB11GroupFileFolder[]
}

export class GetGroupFilesByFolder extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetGroupFilesByFolder
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    folder_id: Schema.string().required()
  })

  async _handle(payload: Payload) {
    const groupId = payload.group_id.toString()
    const data: GroupFileInfo['item'] = []

    let nextIndex: number | undefined
    while (nextIndex !== 0) {
      const res = await this.ctx.ntGroupApi.getGroupFileList(groupId, {
        sortType: 1,
        fileCount: 100,
        startIndex: nextIndex ?? 0,
        sortOrder: 2,
        showOnlinedocFolder: 0,
        folderId: payload.folder_id
      })
      data.push(...res.item)
      nextIndex = res.nextIndex
    }

    return {
      files: data.filter(item => item.fileInfo)
        .map(item => {
          const file = item.fileInfo!
          return {
            group_id: +item.peerId,
            file_id: file.fileId,
            file_name: file.fileName,
            busid: file.busId,
            file_size: +file.fileSize,
            upload_time: file.uploadTime,
            dead_time: file.deadTime,
            modify_time: file.modifyTime,
            download_times: file.downloadTimes,
            uploader: +file.uploaderUin,
            uploader_name: file.uploaderName
          }
        }),
      folders: []
    }
  }
}
