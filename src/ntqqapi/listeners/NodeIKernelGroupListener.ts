import { Group, GroupListUpdateType, GroupMember, GroupNotify } from '@/ntqqapi/types'

export interface IGroupListener {
  onGroupListUpdate(updateType: GroupListUpdateType, groupList: Group[]): void

  onGroupExtListUpdate(...args: unknown[]): void

  onGroupSingleScreenNotifies(doubt: boolean, seq: string, notifies: GroupNotify[]): void

  onGroupNotifiesUpdated(dboubt: boolean, notifies: GroupNotify[]): void

  onGroupNotifiesUnreadCountUpdated(...args: unknown[]): void

  onGroupDetailInfoChange(...args: unknown[]): void

  onGroupAllInfoChange(...args: unknown[]): void

  onGroupsMsgMaskResult(...args: unknown[]): void

  onGroupConfMemberChange(...args: unknown[]): void

  onGroupBulletinChange(...args: unknown[]): void

  onGetGroupBulletinListResult(...args: unknown[]): void

  onMemberListChange(arg: {
    sceneId: string,
    ids: string[],
    infos: Map<string, GroupMember>,
    finish: boolean,
    hasRobot: boolean
  }): void

  onMemberInfoChange(groupCode: string, changeType: number, members: Map<string, GroupMember>): void

  onSearchMemberChange(...args: unknown[]): void

  onGroupBulletinRichMediaDownloadComplete(...args: unknown[]): void

  onGroupBulletinRichMediaProgressUpdate(...args: unknown[]): void

  onGroupStatisticInfoChange(...args: unknown[]): void

  onJoinGroupNotify(...args: unknown[]): void

  onShutUpMemberListChanged(...args: unknown[]): void

  onGroupBulletinRemindNotify(...args: unknown[]): void

  onGroupFirstBulletinNotify(...args: unknown[]): void

  onJoinGroupNoVerifyFlag(...args: unknown[]): void

  onGroupArkInviteStateResult(...args: unknown[]): void
  
  // 发现于Win 9.9.9 23159
  onGroupMemberLevelInfoChange(...args: unknown[]): void
}