import { FriendEntity, GroupEntity, GroupFileEntity, GroupFolderEntity, GroupMemberEntity } from '@saltify/milky-types'
import { CategoryFriend, GroupAllInfo, Sex, SimpleInfo } from '@/ntqqapi/types'
import { GroupMember, GroupFileInfo } from '@/ntqqapi/types'

export function transformGender(gender: Sex): 'male' | 'female' | 'unknown' {
  if (gender === Sex.Male) return 'male'
  if (gender === Sex.Female) return 'female'
  return 'unknown'
}

export function transformFriend(friend: SimpleInfo, category: CategoryFriend): FriendEntity {
  return {
    user_id: +friend.uin,
    nickname: friend.coreInfo.nick,
    sex: transformGender(friend.baseInfo.sex),
    qid: friend.baseInfo.qid,
    remark: friend.coreInfo.remark,
    category: {
      category_id: category.categoryId,
      category_name: category.categroyName,
    },
  }
}

export function transformGroup(group: GroupAllInfo): GroupEntity {
  return {
    group_id: +group.groupCode,
    group_name: group.groupName,
    member_count: group.memberNum,
    max_member_count: group.maxMemberNum,
  }
}

export function transformGroupMemberRole(role: number): GroupMemberEntity['role'] {
  if (role === 4) return 'owner'  // 群主
  if (role === 3) return 'admin'  // 管理员
  return 'member'
}

export function transformGroupMember(member: GroupMember, groupId: number): GroupMemberEntity {
  return {
    user_id: +member.uin,
    nickname: member.nick,
    sex: 'unknown',
    group_id: groupId,
    card: member.cardName,
    title: member.memberSpecialTitle,
    level: member.memberRealLevel,
    role: transformGroupMemberRole(member.role),
    join_time: member.joinTime,
    last_sent_time: member.lastSpeakTime,
    shut_up_end_time: member.shutUpTime || undefined,
  }
}

export function transformGroupFileList(data: GroupFileInfo): {
  files: GroupFileEntity[],
  folders: GroupFolderEntity[]
} {
  const files: GroupFileEntity[] = []
  const folders: GroupFolderEntity[] = []

  if (data.item.length === 0) {
    return { files, folders }
  }

  for (const item of data.item) {
    if (item.folderInfo) {
      folders.push({
        group_id: +item.peerId,
        folder_id: item.folderInfo.folderId,
        parent_folder_id: item.folderInfo.parentFolderId,
        folder_name: item.folderInfo.folderName,
        created_time: item.folderInfo.createTime,
        last_modified_time: item.folderInfo.modifyTime,
        creator_id: +item.folderInfo.createUin,
        file_count: item.folderInfo.totalFileCount,
      })
    } else if (item.fileInfo) {
      files.push({
        group_id: +item.peerId,
        file_id: item.fileInfo.fileId,
        file_name: item.fileInfo.fileName,
        parent_folder_id: item.fileInfo.parentFolderId,
        file_size: +item.fileInfo.fileSize,
        uploaded_time: item.fileInfo.uploadTime,
        expire_time: item.fileInfo.deadTime || undefined,
        uploader_id: +item.fileInfo.uploaderUin,
        downloaded_times: item.fileInfo.downloadTimes,
      })
    }
  }

  return { files, folders }
}
