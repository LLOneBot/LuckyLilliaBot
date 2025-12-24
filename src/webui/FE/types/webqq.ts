// WebQQ 页面类型定义

// ==================== 从 ntqqapi/types/msg.ts 复制的核心类型 ====================
// 这些类型需要在前端定义，因为前端的 @ 别名指向 FE 目录，无法直接导入后端类型

export enum ChatType {
  C2C = 1,
  Group = 2,
  TempC2CFromGroup = 100,
}

export enum ElementType {
  Text = 1,
  Pic = 2,
  File = 3,
  Ptt = 4,
  Video = 5,
  Face = 6,
  Reply = 7,
  GrayTip = 8,
  Ark = 10,
  MarketFace = 11,
}

export interface TextElement {
  content: string
  atType: number
  atUid: string
  atTinyId: string
  atNtUid: string
}

export interface PicElement {
  picSubType: number
  fileName: string
  fileSize: string
  picWidth: number
  picHeight: number
  original: boolean
  md5HexStr: string
  sourcePath: string
  originImageUrl: string
  fileUuid: string
  summary: string
}

export interface FileElement {
  fileName: string
  filePath: string
  fileSize: string
  fileUuid: string
}

export interface PttElement {
  duration: number
  fileName: string
  filePath: string
  fileSize: string
}

export interface VideoElement {
  fileName: string
  filePath: string
  fileSize: string
  thumbPath: Map<number, string>
}

export interface FaceElement {
  faceIndex: number
  faceType: number
  faceText?: string
}

export interface ReplyElement {
  replayMsgId: string
  replayMsgSeq: string
  sourceMsgText: string
  senderUid: string
}

export interface MessageElement {
  elementType: ElementType
  elementId: string
  textElement?: TextElement
  picElement?: PicElement
  fileElement?: FileElement
  pttElement?: PttElement
  videoElement?: VideoElement
  faceElement?: FaceElement
  replyElement?: ReplyElement
}

export interface RawMessage {
  msgId: string
  msgType: ElementType
  subMsgType: number
  msgTime: string
  msgSeq: string
  msgRandom: string
  senderUid: string
  senderUin: string
  peerUid: string
  peerUin: string
  guildId: string
  sendNickName: string
  sendMemberName?: string
  sendRemarkName?: string
  chatType: ChatType
  sendStatus?: number
  recallTime: string
  elements: MessageElement[]
  peerName: string
  isOnlineMsg: boolean
}

// ==================== WebQQ 业务类型 ====================

// 好友项
export interface FriendItem {
  uid: string
  uin: string
  nickname: string
  remark: string
  avatar: string
  online: boolean
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
  avatar: string
  memberCount: number
}

// 最近会话项
export interface RecentChatItem {
  chatType: 'friend' | 'group'
  peerId: string
  peerName: string
  peerAvatar: string
  lastMessage: string
  lastTime: number
  unreadCount: number
}

// 聊天会话
export interface ChatSession {
  chatType: 'friend' | 'group'
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
  chatType: 'friend' | 'group'
  peerId: string
  content: { type: 'text' | 'image'; text?: string; imagePath?: string }[]
}

// 上传响应
export interface UploadResponse {
  imagePath: string
  filename: string
}
