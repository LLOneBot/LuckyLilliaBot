import { FriendEntity, GroupEntity, GroupFileEntity, GroupFolderEntity, GroupMemberEntity } from '../generated/schema'
import { Friend, Group, GroupMemberRole, Sex } from '@/ntqqapi/types'
import { GroupMember } from '@/ntqqapi/types'
import { InferProtoModel } from '@saltify/typeproto'
import { Oidb } from '@/ntqqapi/proto'

export function transformGender(gender: Sex): 'male' | 'female' | 'unknown' {
  if (gender === Sex.Male) return 'male'
  if (gender === Sex.Female) return 'female'
  return 'unknown'
}

export function transformFriend(friend: Friend): FriendEntity {
  return {
    user_id: friend.uin,
    nickname: friend.nick,
    sex: transformGender(friend.gender),
    qid: friend.qid,
    remark: friend.remark,
    category: {
      category_id: friend.categoryId,
      category_name: friend.categoryName,
    },
  }
}

export function transformGroup(group: Group): GroupEntity {
  return {
    group_id: group.groupCode,
    group_name: group.groupName,
    member_count: group.memberCount,
    max_member_count: group.maxMemberCount,
    remark: group.remark,
    created_time: group.createdAt,
    description: group.description,
    question: group.question,
    announcement: group.announcementPreview,
  }
}

export function transformGroupMemberRole(role: GroupMemberRole): GroupMemberEntity['role'] {
  if (role === GroupMemberRole.Owner) return 'owner'
  if (role === GroupMemberRole.Admin) return 'admin'
  return 'member'
}

export function transformGroupMember(member: GroupMember, groupId: number): GroupMemberEntity {
  return {
    user_id: member.uin,
    nickname: member.nick,
    sex: 'unknown',
    group_id: groupId,
    card: member.cardName,
    title: member.specialTitle,
    level: member.level,
    role: transformGroupMemberRole(member.role),
    join_time: member.joinedAt,
    last_sent_time: member.lastSpokeAt,
    shut_up_end_time: member.shutupExpireTime || undefined,
  }
}

export function transformGroupFileList(items: InferProtoModel<typeof Oidb.GetGroupFileListRespItem>[], groupId: number): {
  files: GroupFileEntity[],
  folders: GroupFolderEntity[]
} {
  const files: GroupFileEntity[] = []
  const folders: GroupFolderEntity[] = []

  for (const item of items) {
    if (item.folderInfo) {
      folders.push({
        group_id: groupId,
        folder_id: item.folderInfo.folderId,
        parent_folder_id: item.folderInfo.parentDirectoryId,
        folder_name: item.folderInfo.folderName,
        created_time: item.folderInfo.createTime,
        last_modified_time: item.folderInfo.modifiedTime,
        creator_id: item.folderInfo.creatorUin,
        file_count: item.folderInfo.totalFileCount,
      })
    } else if (item.fileInfo) {
      files.push({
        group_id: groupId,
        file_id: item.fileInfo.fileId,
        file_name: item.fileInfo.fileName,
        parent_folder_id: item.fileInfo.parentDirectory,
        file_size: item.fileInfo.fileSize,
        uploaded_time: item.fileInfo.uploadedTime,
        expire_time: item.fileInfo.expireTime || undefined,
        uploader_id: item.fileInfo.uploaderUin,
        downloaded_times: item.fileInfo.downloadedTimes,
      })
    }
  }

  return { files, folders }
}
