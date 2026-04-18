import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { OB11GroupFile, OB11GroupFileFolder } from '../../types'
import { InferProtoModel } from '@saltify/typeproto'
import { Oidb } from '@/ntqqapi/proto'

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
    const data: InferProtoModel<typeof Oidb.GetGroupFileListRespItem>[] = []

    let nextIndex: number | undefined
    while (nextIndex !== 0) {
      const res = await this.ctx.pmhq.getGroupFileList(groupId, '/', nextIndex ?? 0, 100)
      if (res.listResp.retCode !== 0) {
        if (res.listResp.retCode === -3) {
          throw new Error('你没有加入该群聊')
        } else {
          throw new Error(res.listResp.clientWording)
        }
      }
      data.push(...res.listResp.items)
      nextIndex = res.listResp.nextIndex
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
            creator: folder.creatorUin,
            creator_name: folder.creatorName,
            total_file_count: folder.totalFileCount
          }
        })
    }
  }
}
