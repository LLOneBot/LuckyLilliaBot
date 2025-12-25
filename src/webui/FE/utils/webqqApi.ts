// WebQQ API 工具函数
import { apiFetch, getToken } from './api'
import type {
  FriendCategory,
  GroupItem,
  RecentChatItem,
  GroupMemberItem,
  MessagesResponse,
  SendMessageRequest,
  UploadResponse,
  RawMessage
} from '../types/webqq'

// 获取当前登录用户的 uid
let selfUid: string | null = null
let selfUin: string | null = null

export function setSelfInfo(uid: string, uin: string) {
  selfUid = uid
  selfUin = uin
}

export function getSelfUid(): string | null {
  return selfUid
}

export function getSelfUin(): string | null {
  return selfUin
}

// 获取登录信息
export async function getLoginInfo(): Promise<{ uid: string; uin: string; nick: string }> {
  const response = await apiFetch<{ uid: string; uin: string; nick: string }>('/api/login-info')
  if (!response.success) {
    throw new Error(response.message || '获取登录信息失败')
  }
  const data = response.data!
  // 设置全局 selfUid 和 selfUin
  setSelfInfo(data.uid, data.uin)
  return data
}

// 获取好友列表（带分组）
export async function getFriends(): Promise<FriendCategory[]> {
  const response = await apiFetch<FriendCategory[]>('/api/webqq/friends')
  if (!response.success) {
    throw new Error(response.message || '获取好友列表失败')
  }
  return response.data || []
}

// 获取群组列表
export async function getGroups(): Promise<GroupItem[]> {
  const response = await apiFetch<GroupItem[]>('/api/webqq/groups')
  if (!response.success) {
    throw new Error(response.message || '获取群组列表失败')
  }
  return response.data || []
}

// 获取最近会话列表
export async function getRecentChats(): Promise<RecentChatItem[]> {
  const response = await apiFetch<RecentChatItem[]>('/api/webqq/recent')
  if (!response.success) {
    throw new Error(response.message || '获取最近会话失败')
  }
  return response.data || []
}

// 获取消息历史
export async function getMessages(
  chatType: 'friend' | 'group',
  peerId: string,
  beforeMsgId?: string,
  limit: number = 20
): Promise<MessagesResponse> {
  const params = new URLSearchParams({
    chatType,
    peerId,
    limit: limit.toString()
  })
  if (beforeMsgId) {
    params.append('beforeMsgId', beforeMsgId)
  }
  
  const response = await apiFetch<MessagesResponse>(`/api/webqq/messages?${params}`)
  if (!response.success) {
    throw new Error(response.message || '获取消息历史失败')
  }
  return response.data || { messages: [], hasMore: false }
}

// 发送消息
export async function sendMessage(request: SendMessageRequest): Promise<{ msgId: string }> {
  const response = await apiFetch<{ msgId: string }>('/api/webqq/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })
  if (!response.success) {
    throw new Error(response.message || '发送消息失败')
  }
  return response.data || { msgId: '' }
}

// 上传图片
export async function uploadImage(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('image', file)
  
  const response = await apiFetch<UploadResponse>('/api/webqq/upload', {
    method: 'POST',
    body: formData
  })
  if (!response.success) {
    throw new Error(response.message || '上传图片失败')
  }
  return response.data!
}

// 获取群成员列表
export async function getGroupMembers(groupCode: string): Promise<GroupMemberItem[]> {
  const response = await apiFetch<GroupMemberItem[]>(`/api/webqq/members?groupCode=${groupCode}`)
  if (!response.success) {
    throw new Error(response.message || '获取群成员失败')
  }
  return response.data || []
}

// 获取用户信息（通过 uid）
export async function getUserInfo(uid: string): Promise<{ uid: string; uin: string; nickname: string; remark: string }> {
  const response = await apiFetch<{ uid: string; uin: string; nickname: string; remark: string }>(`/api/webqq/user-info?uid=${encodeURIComponent(uid)}`)
  if (!response.success) {
    throw new Error(response.message || '获取用户信息失败')
  }
  return response.data!
}

// 通用 NT API 调用
export async function ntCall<T = any>(service: string, method: string, args: any[] = []): Promise<T> {
  const response = await apiFetch<T>('/api/webqq/nt-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, method, args })
  })
  if (!response.success) {
    throw new Error(response.message || 'NT API 调用失败')
  }
  return response.data!
}

// 获取视频播放 URL
export async function getVideoUrl(chatType: number, peerUid: string, msgId: string, elementId: string): Promise<string> {
  const peer = { chatType, peerUid, guildId: '' }
  return await ntCall<string>('ntFileApi', 'getVideoUrl', [peer, msgId, elementId])
}

// 获取用户显示名称（群聊用群名片，私聊用备注）
export async function getUserDisplayName(uid: string, groupCode?: string): Promise<string> {
  try {
    if (groupCode) {
      // 群聊：获取群成员信息，优先显示群名片
      const members = await ntCall<{ result: { infos: Record<string, any> } }>('ntGroupApi', 'getGroupMembers', [groupCode])
      const memberInfo = members?.result?.infos?.[uid]
      if (memberInfo) {
        return memberInfo.cardName || memberInfo.nick || '未知用户'
      }
    }
    // 私聊或群成员未找到：获取好友信息，优先显示备注
    const userInfo = await ntCall<{ coreInfo?: { nick?: string; remark?: string } }>('ntUserApi', 'getUserSimpleInfo', [uid, false])
    return userInfo?.coreInfo?.remark || userInfo?.coreInfo?.nick || '未知用户'
  } catch {
    return '未知用户'
  }
}

// 创建 SSE 连接
export function createEventSource(onMessage: (event: any) => void, onError?: (error: any) => void): EventSource {
  // SSE doesn't support custom headers, so we pass the token as a query parameter
  const token = getToken()
  const url = token ? `/api/webqq/events?token=${encodeURIComponent(token)}` : '/api/webqq/events'
  const eventSource = new EventSource(url)
  
  // 监听自定义 message 事件（后端发送 event: message）
  eventSource.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data)
      onMessage(data)
    } catch (e) {
      console.error('解析 SSE 消息失败:', e)
    }
  })
  
  eventSource.addEventListener('connected', () => {
    // SSE 连接已建立
  })
  
  eventSource.onerror = (error) => {
    console.error('WebQQ SSE 连接错误:', error)
    if (onError) {
      onError(error)
    }
  }
  
  return eventSource
}

// 搜索过滤群组
export function filterGroups(groups: GroupItem[], query: string): GroupItem[] {
  if (!query.trim()) return groups
  const lowerQuery = query.toLowerCase()
  return groups.filter(group =>
    group.groupName.toLowerCase().includes(lowerQuery) ||
    group.groupCode.includes(query)
  )
}

// 搜索过滤群成员
export function filterMembers(members: GroupMemberItem[], query: string): GroupMemberItem[] {
  if (!query.trim()) return members
  const lowerQuery = query.toLowerCase()
  return members.filter(member =>
    member.nickname.toLowerCase().includes(lowerQuery) ||
    member.card.toLowerCase().includes(lowerQuery) ||
    member.uin.includes(query)
  )
}

// 验证图片格式
export function isValidImageFormat(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() || ''
  return ['jpg', 'jpeg', 'png', 'gif'].includes(ext)
}

// 验证消息是否为空
export function isEmptyMessage(text: string): boolean {
  return !text || text.trim().length === 0
}

// 格式化时间戳
export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  
  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()
  
  if (isYesterday) {
    return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
