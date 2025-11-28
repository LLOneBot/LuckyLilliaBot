import {
  UploadGroupFileInput,
  UploadGroupFileOutput,
  GetGroupFileDownloadUrlInput,
  GetGroupFileDownloadUrlOutput,
  GetGroupFilesInput,
  GetGroupFilesOutput,
  MoveGroupFileInput,
  RenameGroupFileInput,
  DeleteGroupFileInput,
  CreateGroupFolderInput,
  CreateGroupFolderOutput,
  RenameGroupFolderInput,
  DeleteGroupFolderInput,
  GroupFileEntity,
  GroupFolderEntity,
} from '@saltify/milky-types'
import z from 'zod'
import { defineApi, Failed, Ok } from '@/milky/common/api'
import { resolveMilkyUri } from '@/milky/common/download'
import { transformGroupFileList } from '@/milky/transform/entity'

export const UploadGroupFile = defineApi(
  'upload_group_file',
  UploadGroupFileInput,
  UploadGroupFileOutput,
  async (ctx, payload) => {
    const data = await resolveMilkyUri(payload.file_uri)
    const { TEMP_DIR } = await import('@/common/globalVars')
    const { writeFile } = await import('node:fs/promises')
    const { randomUUID } = await import('node:crypto')
    const path = await import('node:path')
    const tempPath = path.join(TEMP_DIR, `file-${randomUUID()}-${payload.file_name}`)
    await writeFile(tempPath, data)

    // TODO: uploadFile doesn't support group file upload directly
    // The method signature is: uploadFile(filePath: string, elementType?: ElementType, elementSubType?: number)
    // Need to find the correct API for group file upload
    const result = await ctx.ntFileApi.uploadFile(tempPath)

    return Failed(1, 'Group file upload not yet implemented')
  }
)

export const GetGroupFileDownloadUrl = defineApi(
  'get_group_file_download_url',
  GetGroupFileDownloadUrlInput,
  GetGroupFileDownloadUrlOutput,
  async (ctx, payload) => {
    // Use pmhq API to get group file download URL
    const url = await ctx.app.pmhq.getGroupFileUrl(
      Number(payload.group_id),
      payload.file_id
    )
    return Ok({ download_url: url })
  }
)

export const GetGroupFiles = defineApi(
  'get_group_files',
  GetGroupFilesInput,
  GetGroupFilesOutput,
  async (ctx, payload) => {
    const allFiles: GroupFileEntity[] = []
    const allFolders: GroupFolderEntity[] = []
    let startIndex = 0
    let isEnd = false

    // Fetch all pages until isEnd is true
    while (!isEnd) {
      const fileListParam = {
        sortType: 1,
        fileCount: 100,
        startIndex: startIndex,
        sortOrder: 2,
        showOnlinedocFolder: 0
      }

      const data = await ctx.ntGroupApi.getGroupFileList(
        payload.group_id.toString(),
        fileListParam
      )

      // Transform and filter by parent_folder_id
      const { files, folders } = transformGroupFileList(
        payload.group_id,
        data,
        payload.parent_folder_id
      )

      allFiles.push(...files)
      allFolders.push(...folders)

      // Check if we've reached the end
      isEnd = data.isEnd

      // Update startIndex for next iteration
      if (!isEnd) {
        startIndex = data.nextIndex
      } else {
        break
      }
    }

    return Ok({ files: allFiles, folders: allFolders })
  }
)

export const MoveGroupFile = defineApi(
  'move_group_file',
  MoveGroupFileInput,
  z.object({}),
  async (ctx, payload) => {
    // moveGroupFile signature: (groupId: string, fileIdList: string[], curFolderId: string, dstFolderId: string)
    await ctx.ntGroupApi.moveGroupFile(
      payload.group_id.toString(),
      [payload.file_id],
      payload.parent_folder_id,
      payload.target_folder_id
    )
    return Ok({})
  }
)

export const RenameGroupFile = defineApi(
  'rename_group_file',
  RenameGroupFileInput,
  z.object({}),
  async (ctx, payload) => {
    // TODO: renameGroupFile method doesn't exist in ntGroupApi
    // Need to find the correct API or implement it
    return Failed(1, 'Rename group file not yet implemented')
  }
)

export const DeleteGroupFile = defineApi(
  'delete_group_file',
  DeleteGroupFileInput,
  z.object({}),
  async (ctx, payload) => {
    // deleteGroupFile signature: (groupId: string, fileIdList: string[], busIdList: number[])
    await ctx.ntGroupApi.deleteGroupFile(
      payload.group_id.toString(),
      [payload.file_id],
      [102] // busId for group files
    )
    return Ok({})
  }
)

export const CreateGroupFolder = defineApi(
  'create_group_folder',
  CreateGroupFolderInput,
  CreateGroupFolderOutput,
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.createGroupFileFolder(
      payload.group_id.toString(),
      payload.folder_name
    )
    return Ok({ folder_id: result.resultWithGroupItem.groupItem.folderInfo.folderId })
  }
)

export const RenameGroupFolder = defineApi(
  'rename_group_folder',
  RenameGroupFolderInput,
  z.object({}),
  async (ctx, payload) => {
    await ctx.ntGroupApi.renameGroupFolder(
      payload.group_id.toString(),
      payload.folder_id,
      payload.new_folder_name
    )
    return Ok({})
  }
)

export const DeleteGroupFolder = defineApi(
  'delete_group_folder',
  DeleteGroupFolderInput,
  z.object({}),
  async (ctx, payload) => {
    await ctx.ntGroupApi.deleteGroupFileFolder(
      payload.group_id.toString(),
      payload.folder_id
    )
    return Ok({})
  }
)

export const FileApi = [
  UploadGroupFile,
  GetGroupFileDownloadUrl,
  GetGroupFiles,
  MoveGroupFile,
  RenameGroupFile,
  DeleteGroupFile,
  CreateGroupFolder,
  RenameGroupFolder,
  DeleteGroupFolder,
]
