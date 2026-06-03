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
import { TEMP_DIR } from '@/common/globalVars'
import { unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { noop } from 'cosmokit'

const UploadPrivateFile = defineApi(
  'upload_private_file',
  UploadPrivateFileInput,
  UploadPrivateFileOutput,
  async (ctx, payload) => {
    const data = await resolveMilkyUri(payload.file_uri)
    const tempPath = path.join(TEMP_DIR, `file-${randomUUID()}`)
    await writeFile(tempPath, data)
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id)
    if (!uid) {
      return Failed(-404, 'User not found')
    }
    const info = await ctx.ntFileApi.uploadPrivateFile(uid, tempPath, payload.file_name)
    unlink(tempPath).catch(noop)
    const result = await ctx.ntMsgApi.sendPrivateFileMessage({
      toUin: payload.user_id,
      toUid: uid,
      fileUuid: info.fileId,
      fileName: payload.file_name,
      fileSize: info.fileSize,
      file10MMd5: info.file10MMd5,
      crcMedia: info.crcMedia,
    })
    if (result.resultCode !== 0) {
      return Failed(-500, result.errMsg ?? '')
    }
    return Ok({ file_id: info.fileId })
  }
)

const UploadGroupFile = defineApi(
  'upload_group_file',
  UploadGroupFileInput,
  UploadGroupFileOutput,
  async (ctx, payload) => {
    const data = await resolveMilkyUri(payload.file_uri)
    const tempPath = path.join(TEMP_DIR, `file-${randomUUID()}`)
    await writeFile(tempPath, data)
    const info = await ctx.ntFileApi.uploadGroupFile(payload.group_id, tempPath, payload.file_name, payload.parent_folder_id)
    unlink(tempPath).catch(noop)
    const result = await ctx.ntMsgApi.sendGroupFileMessage(payload.group_id, info.fileId)
    if (result.retCode !== 0) {
      return Failed(-500, result.retMsg)
    }
    return Ok({ file_id: info.fileId })
  }
)

const GetPrivateFileDownloadUrl = defineApi(
  'get_private_file_download_url',
  GetPrivateFileDownloadUrlInput,
  GetPrivateFileDownloadUrlOutput,
  async (ctx, payload) => {
    const result = await ctx.ntFileApi.getFileUrl(payload.file_id, false)
    if (result.retCode !== 0) {
      return Failed(-500, result.retMsg)
    }
    return Ok({ download_url: result.url })
  }
)

const GetGroupFileDownloadUrl = defineApi(
  'get_group_file_download_url',
  GetGroupFileDownloadUrlInput,
  GetGroupFileDownloadUrlOutput,
  async (ctx, payload) => {
    const result = await ctx.ntFileApi.getFileUrl(
      payload.file_id,
      true,
      payload.group_id
    )
    if (result.retCode !== 0) {
      return Failed(-500, result.retMsg)
    }
    return Ok({ download_url: result.url })
  }
)

const GetGroupFiles = defineApi(
  'get_group_files',
  GetGroupFilesInput,
  GetGroupFilesOutput,
  async (ctx, payload) => {
    const allFiles: GroupFileEntity[] = []
    const allFolders: GroupFolderEntity[] = []

    let nextIndex: number | undefined
    while (nextIndex !== 0) {
      const data = await ctx.ntGroupApi.getGroupFileList(payload.group_id, payload.parent_folder_id, nextIndex ?? 0, 100)
      if (data.retCode !== 0) {
        return Failed(-500, data.clientWording)
      }

      const { files, folders } = transformGroupFileList(data.items, payload.group_id)
      allFiles.push(...files)
      allFolders.push(...folders)

      nextIndex = data.nextIndex
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
      payload.group_id,
      payload.file_id,
      payload.parent_folder_id,
      payload.target_folder_id
    )
    if (result.retCode !== 0) {
      return Failed(-500, result.clientWording)
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
      payload.group_id,
      payload.file_id,
      payload.parent_folder_id,
      payload.new_file_name
    )
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
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
      payload.group_id,
      payload.file_id
    )
    if (result.retCode !== 0) {
      return Failed(-500, result.clientWording)
    }
    return Ok({})
  }
)

const CreateGroupFolder = defineApi(
  'create_group_folder',
  CreateGroupFolderInput,
  CreateGroupFolderOutput,
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.createGroupFolder(
      payload.group_id,
      payload.folder_name
    )
    if (result.retCode !== 0) {
      return Failed(-500, result.clientWording)
    }
    return Ok({ folder_id: result.folderInfo.folderId })
  }
)

const RenameGroupFolder = defineApi(
  'rename_group_folder',
  RenameGroupFolderInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.renameGroupFolder(
      payload.group_id,
      payload.folder_id,
      payload.new_folder_name
    )
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const DeleteGroupFolder = defineApi(
  'delete_group_folder',
  DeleteGroupFolderInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.deleteGroupFolder(
      payload.group_id,
      payload.folder_id
    )
    if (result.retCode !== 0) {
      return Failed(-500, result.clientWording)
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
