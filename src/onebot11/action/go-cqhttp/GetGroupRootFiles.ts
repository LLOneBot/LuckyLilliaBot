import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { OB11GroupFile, OB11GroupFileFolder } from '../../types'

interface Payload {
  group_id: number | string
}

interface Response {
  files: OB11GroupFile[]
  folders: OB11GroupFileFolder[]
}

export class GetGroupRootFiles extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetGroupRootFiles
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  async _handle(payload: Payload) {
    const groupId = +payload.group_id
    const data = []

    let nextIndex: number | undefined
    while (nextIndex !== 0) {
      const res = await this.ctx.ntGroupApi.getGroupFileList(groupId, '/', nextIndex ?? 0, 100)
      if (res.retCode !== 0) {
        throw new Error(res.clientWording)
      }
      data.push(...res.items)
      nextIndex = res.nextIndex
    }

    return {
      files: data.filter(item => item.fileInfo)
        .map(item => {
          const file = item.fileInfo!
          return {
            group_id: groupId,
            file_id: file.fileId,
            file_name: file.fileName,
            busid: file.busId,
            file_size: file.fileSize,
            upload_time: file.uploadedTime,
            dead_time: file.expireTime,
            modify_time: file.modifiedTime,
            download_times: file.downloadedTimes,
            uploader: file.uploaderUin,
            uploader_name: file.uploaderName
          }
        }),
      folders: data.filter(item => item.folderInfo)
        .map(item => {
          const folder = item.folderInfo!
          return {
            group_id: groupId,
            folder_id: folder.folderId,
            folder_name: folder.folderName,
            create_time: folder.createTime,
            creator: folder.createUin,
            creator_name: folder.creatorName,
            total_file_count: folder.totalFileCount,
            modify_time: folder.modifyTime,
            modifier: folder.modifyUin,
            modifier_name: folder.modifyName
          }
        })
    }
  }
}
