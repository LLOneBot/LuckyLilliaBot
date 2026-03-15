// WebQQ 页面类型定义

// 从 ntqqapi 导入消息相关类型
import type {
  TextElement,
  PicElement,
  FileElement,
  PttElement,
  VideoElement,
  FaceElement,
  ReplyElement,
  GrayTipElement,
  ArkElement,
  MarketFaceElement,
  MessageElement,
  RawMessage,
} from '@ntqqapi/types'

export { ChatType, ElementType } from '@ntqqapi/types'
export type {
  TextElement,
  PicElement,
  FileElement,
  PttElement,
  VideoElement,
  FaceElement,
  ReplyElement,
  GrayTipElement,
  ArkElement,
  MarketFaceElement,
  MessageElement,
  RawMessage,
}

// ==================== WebQQ 业务类型 ====================

// ChatType: 1=私聊, 2=群聊, 100=临时会话
export type WebChatType = 1 | 2 | 100

// 好友项
export interface FriendItem {
  uid: string
  uin: string
  nickname: string
  remark: string
  avatar: string
  online: boolean
  topTime?: string
}

// 好友分组
export interface FriendCategory {
  categoryId: number
  categoryName: string
  categorySort: number
  onlineCount: number
  memberCount: number
  friends: FriendItem[]
}

// 群组项
export interface GroupItem {
  groupCode: string
  groupName: string
  remarkName?: string
  avatar: string
  memberCount: number
  isTop?: boolean
  msgMask?: number
}

// 最近会话项
export interface RecentChatItem {
  chatType: WebChatType
  peerId: string
  peerName: string
  peerAvatar: string
  lastMessage: string
  lastTime: number
  unreadCount: number
  pinned?: boolean  // 是否置顶
}

// 聊天会话
export interface ChatSession {
  chatType: WebChatType
  peerId: string
  peerName: string
  peerAvatar: string
}

// 群成员项
export interface GroupMemberItem {
  uid: string
  uin: string
  nickname: string
  card: string
  avatar: string
  role: 'owner' | 'admin' | 'member'
  level?: number
  specialTitle?: string
}

// API 响应类型
export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
}

// 消息历史响应（返回原始 RawMessage 数组）
export interface MessagesResponse {
  messages: RawMessage[]
  hasMore: boolean
}

// 发送消息请求
export interface SendMessageRequest {
  chatType: WebChatType
  peerId: string
  content: { 
    type: 'text' | 'image' | 'reply' | 'at' | 'face' | 'file'
    text?: string
    imagePath?: string
    msgId?: string
    msgSeq?: string
    uid?: string
    uin?: string
    name?: string
    faceId?: number
    filePath?: string
    fileName?: string
  }[]
}

// 上传响应
export interface UploadResponse {
  imagePath: string
  filename: string
}

// ==================== 系统通知类型 ====================

// 群通知类型
export enum GroupNotifyType {
  InvitedByMember = 1,
  RefuseInvited = 2,
  RefusedByAdminiStrator = 3,
  AgreedTojoinDirect = 4,
  InvitedNeedAdminiStratorPass = 5,
  AgreedToJoinByAdminiStrator = 6,
  RequestJoinNeedAdminiStratorPass = 7,
  SetAdmin = 8,
  KickMemberNotifyAdmin = 9,
  KickMemberNotifyKicked = 10,
  MemberLeaveNotifyAdmin = 11,
  CancelAdminNotifyCanceled = 12,
  CancelAdminNotifyAdmin = 13,
  TransferGroupNotifyOldowner = 14,
  TransferGroupNotifyAdmin = 15,
}

// 群通知状态
export enum GroupNotifyStatus {
  Init = 0,
  Unhandle = 1,
  Agreed = 2,
  Refused = 3,
  Ignored = 4,
}

// 群通知项
export interface GroupNotifyItem {
  seq: string
  notifyType: GroupNotifyType
  status: GroupNotifyStatus
  doubt: boolean
  group: { groupCode: string; groupName: string }
  user1: { uid: string; nickName: string; uin: string }
  user2: { uid: string; nickName: string; uin: string }
  postscript: string
  actionTime: string
  flag: string
}

// 好友申请项
export interface FriendRequestItem {
  friendUid: string
  friendUin: string
  friendNick: string
  friendAvatarUrl: string
  reqTime: string
  extWords: string
  isDecide: boolean
  reqType: number
  addSource: string
  flag: string
}

// 被过滤的好友申请项
export interface DoubtBuddyItem {
  uid: string
  nick: string
  age: number
  sex: number
  reqTime: string
  msg: string
  source: string
  reason: string
  groupCode: string
  commFriendNum: number
  flag: string
}

// 通知类型（用于前端统一展示）
export type NotificationItem =
  | { type: 'group-notify'; data: GroupNotifyItem; time: number }
  | { type: 'friend-request'; data: FriendRequestItem; time: number }
  | { type: 'doubt-buddy'; data: DoubtBuddyItem; time: number }
  | { type: 'group-dismiss'; data: { groupCode: string; groupName: string }; time: number }
  | { type: 'group-quit'; data: { groupCode: string; groupName: string }; time: number }

