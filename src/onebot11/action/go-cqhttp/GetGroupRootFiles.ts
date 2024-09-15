import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'
import { OB11GroupFile, OB11GroupFileFolder } from '../../types'

interface Payload {
  group_id: string | number
  file_count: string | number
}

interface Response {
  files: OB11GroupFile[]
  folders: OB11GroupFileFolder[]
}

export class GetGroupRootFiles extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetGroupRootFiles

  async _handle(payload: Payload) {
    const data = await this.ctx.ntGroupApi.getGroupFileList(payload.group_id.toString(), {
      sortType: 1,
      fileCount: +(payload.file_count ?? 50),
      startIndex: 0,
      sortOrder: 2,
      showOnlinedocFolder: 0,
    })

    this.ctx.logger.info(data)

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
      folders: data.filter(item => item.folderInfo)
        .map(item => {
          const folder = item.folderInfo!
          return {
            group_id: +item.peerId,
            folder_id: folder.folderId,
            folder_name: folder.folderName,
            create_time: folder.createTime,
            creator: +folder.createUin,
            creator_name: folder.creatorName,
            total_file_count: folder.totalFileCount
          }
        })
    }
  }
}
