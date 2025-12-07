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
  UploadPrivateFileInput,
  UploadPrivateFileOutput,
  GetPrivateFileDownloadUrlInput,
  GetPrivateFileDownloadUrlOutput,
} from '@saltify/milky-types'
import z from 'zod'
import { defineApi, Failed, MilkyApiHandler, Ok } from '@/milky/common/api'
import { resolveMilkyUri } from '@/milky/common/download'
import { transformGroupFileList } from '@/milky/transform/entity'
import { selfInfo, TEMP_DIR } from '@/common/globalVars'
import { writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { SendElement } from '@/ntqqapi/entities'

const UploadPrivateFile = defineApi(
  'upload_private_file',
  UploadPrivateFileInput,
  UploadPrivateFileOutput,
  async (ctx, payload) => {
    const data = await resolveMilkyUri(payload.file_uri)
    const tempPath = path.join(TEMP_DIR, `file-${randomUUID()}-${payload.file_name}`)
    await writeFile(tempPath, data)
    const file = await SendElement.file(ctx, tempPath, payload.file_name)
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!uid) {
      return Failed(-404, 'User not found')
    }
    const peer = { chatType: 1, peerUid: uid, guildId: '' }
    const result = await ctx.app.sendMessage(ctx, peer, [file], [tempPath])
    return Ok({ file_id: result.elements[0].fileElement!.fileUuid })
  }
)

const UploadGroupFile = defineApi(
  'upload_group_file',
  UploadGroupFileInput,
  UploadGroupFileOutput,
  async (ctx, payload) => {
    const data = await resolveMilkyUri(payload.file_uri)
    const tempPath = path.join(TEMP_DIR, `file-${randomUUID()}-${payload.file_name}`)
    await writeFile(tempPath, data)
    const file = await SendElement.file(ctx, tempPath, payload.file_name, payload.parent_folder_id)
    const peer = { chatType: 2, peerUid: payload.group_id.toString(), guildId: '' }
    const result = await ctx.app.sendMessage(ctx, peer, [file], [tempPath])
    return Ok({ file_id: result.elements[0].fileElement!.fileUuid })
  }
)

const GetPrivateFileDownloadUrl = defineApi(
  'get_private_file_download_url',
  GetPrivateFileDownloadUrlInput,
  GetPrivateFileDownloadUrlOutput,
  async (ctx, payload) => {
    const url = await ctx.app.pmhq.getPrivateFileUrl(
      selfInfo.uid,
      payload.file_id
    )
    return Ok({ download_url: url })
  }
)

const GetGroupFileDownloadUrl = defineApi(
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

const GetGroupFiles = defineApi(
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
        showOnlinedocFolder: 0,
        folderId: payload.parent_folder_id
      }

      const data = await ctx.ntGroupApi.getGroupFileList(
        payload.group_id.toString(),
        fileListParam
      )

      const { files, folders } = transformGroupFileList(data)

      allFiles.push(...files)
      allFolders.push(...folders)

      // Check if we've reached the end
      isEnd = data.isEnd

      // Update startIndex for next iteration
      if (!isEnd) {
        startIndex = data.nextIndex
      }
    }

    return Ok({ files: allFiles, folders: allFolders })
  }
)

const MoveGroupFile = defineApi(
  'move_group_file',
  MoveGroupFileInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.moveGroupFile(
      payload.group_id.toString(),
      [payload.file_id],
      payload.parent_folder_id,
      payload.target_folder_id
    )
    if (result.moveGroupFileResult.result.retCode !== 0) {
      return Failed(-500, result.moveGroupFileResult.result.clientWording)
    }
    return Ok({})
  }
)

const RenameGroupFile = defineApi(
  'rename_group_file',
  RenameGroupFileInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.renameGroupFile(
      payload.group_id.toString(),
      payload.file_id,
      payload.parent_folder_id,
      payload.new_file_name
    )
    if (result.renameGroupFileResult.result.retCode !== 0) {
      return Failed(-500, result.renameGroupFileResult.result.clientWording)
    }
    return Ok({})
  }
)

const DeleteGroupFile = defineApi(
  'delete_group_file',
  DeleteGroupFileInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.deleteGroupFile(
      payload.group_id.toString(),
      [payload.file_id],
      [102] // busId for group files
    )
    if (result.transGroupFileResult.result.retCode !== 0) {
      return Failed(-500, result.transGroupFileResult.result.clientWording)
    }
    return Ok({})
  }
)

const CreateGroupFolder = defineApi(
  'create_group_folder',
  CreateGroupFolderInput,
  CreateGroupFolderOutput,
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.createGroupFileFolder(
      payload.group_id.toString(),
      payload.folder_name
    )
    if (result.resultWithGroupItem.result.retCode !== 0) {
      return Failed(-500, result.resultWithGroupItem.result.clientWording)
    }
    return Ok({ folder_id: result.resultWithGroupItem.groupItem.folderInfo.folderId })
  }
)

const RenameGroupFolder = defineApi(
  'rename_group_folder',
  RenameGroupFolderInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.renameGroupFolder(
      payload.group_id.toString(),
      payload.folder_id,
      payload.new_folder_name
    )
    if (result.resultWithGroupItem.result.retCode !== 0) {
      return Failed(-500, result.resultWithGroupItem.result.clientWording)
    }
    return Ok({})
  }
)

const DeleteGroupFolder = defineApi(
  'delete_group_folder',
  DeleteGroupFolderInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.deleteGroupFileFolder(
      payload.group_id.toString(),
      payload.folder_id
    )
    if (result.groupFileCommonResult.retCode !== 0) {
      return Failed(-500, result.groupFileCommonResult.clientWording)
    }
    return Ok({})
  }
)

export const FileApi: MilkyApiHandler[] = [
  UploadPrivateFile,
  UploadGroupFile,
  GetPrivateFileDownloadUrl,
  GetGroupFileDownloadUrl,
  GetGroupFiles,
  MoveGroupFile,
  RenameGroupFile,
  DeleteGroupFile,
  CreateGroupFolder,
  RenameGroupFolder,
  DeleteGroupFolder,
]
