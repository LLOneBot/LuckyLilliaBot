import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { OB11GroupFile, OB11GroupFileFolder } from '@/onebot11/types'

interface Payload {
  group_id: string | number
  folder_id: string
  file_count: string | number
}

interface Response {
  files: OB11GroupFile[]
  folders: OB11GroupFileFolder[]
}

export class GetGroupFilesByFolder extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetGroupFilesByFolder
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    folder_id: Schema.string().required(),
    file_count: Schema.union([Number, String]).default(50)
  })

  async _handle(payload: Payload) {
    const data = await this.ctx.ntGroupApi.getGroupFileList(payload.group_id.toString(), {
      sortType: 1,
      fileCount: +payload.file_count,
      startIndex: 0,
      sortOrder: 2,
      showOnlinedocFolder: 0,
      folderId: payload.folder_id
    })
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
