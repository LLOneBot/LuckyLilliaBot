export enum GroupNotifyTypes {
  INVITE_ME = 1,
  INVITED_JOIN = 4, // 有人接受了邀请入群
  JOIN_REQUEST_BY_INVITED = 5,  // 有人邀请了别人入群
  JOIN_REQUEST = 7,
  ADMIN_SET = 8,
  KICK_MEMBER = 9,
  MEMBER_EXIT = 11, // 主动退出
  ADMIN_UNSET = 12, // 我被取消管理员
  ADMIN_UNSET_OTHER = 13, // 其他人取消管理员
}

export interface GroupNotifies {
  doubt: boolean
  nextStartSeq: string
  notifies: GroupNotify[]
}

export enum GroupNotifyStatus {
  IGNORE = 0,
  WAIT_HANDLE = 1,
  APPROVE = 2,
  REJECT = 3,
}

export interface GroupNotify {
  time: number // 自己添加的字段，时间戳，毫秒, 用于判断收到短时间内收到重复的notify
  seq: string // 唯一标识符，转成数字再除以1000应该就是时间戳？
  type: GroupNotifyTypes
  status: GroupNotifyStatus // 0是已忽略？，1是未处理，2是已同意
  group: { groupCode: string; groupName: string }
  user1: { uid: string; nickName: string } // 被设置管理员的人
  user2: { uid: string; nickName: string } // 操作者
  actionUser: { uid: string; nickName: string } //未知
  actionTime: string
  invitationExt: {
    srcType: number // 0?未知
    groupCode: string
    waitStatus: number
  }
  postscript: string // 加群用户填写的验证信息
  repeatSeqs: []
  warningTips: string
}

export enum GroupRequestOperateTypes {
  approve = 1,
  reject = 2,
}

export interface FriendRequest {
  friendUid: string
  reqTime: string // 时间戳,秒
  extWords: string // 申请人填写的验证消息
  isUnread: boolean
  friendNick: string
  sourceId: number
  groupCode: string
}

export interface FriendRequestNotify {
  data: {
    unreadNums: number
    buddyReqs: FriendRequest[]
  }
}
