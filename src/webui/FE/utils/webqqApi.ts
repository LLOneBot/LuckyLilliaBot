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

// 获取头像 URL
export function getUserAvatar(uin: string): string {
  return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640`
}

export function getGroupAvatar(groupCode: string): string {
  return `https://p.qlogo.cn/gh/${groupCode}/${groupCode}/640/`
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
  // 获取带分组的好友列表
  const buddyV2Result = await ntCall<{ data: any[] }>('ntFriendApi', 'getBuddyV2', [true])
  const buddyList = await ntCall<any[]>('ntFriendApi', 'getBuddyList', [])
  
  // 创建 uid -> SimpleInfo 的映射
  const buddyMap = new Map<string, any>()
  for (const buddy of buddyList) {
    buddyMap.set(buddy.uid, buddy)
  }
  
  // 构建分组数据
  const categories = (buddyV2Result.data || []).map((category: any) => {
    const friends = (category.buddyUids || [])
      .map((uid: string) => buddyMap.get(uid))
      .filter((buddy: any) => buddy)
      .map((buddy: any) => ({
        uid: buddy.uid,
        uin: buddy.uin,
        nickname: buddy.coreInfo?.nick || '',
        remark: buddy.coreInfo?.remark || '',
        avatar: getUserAvatar(buddy.uin),
        online: buddy.status?.status === 10 || false,
        topTime: buddy.relationFlags?.topTime || '0'
      }))
    
    return {
      categoryId: category.categoryId,
      categoryName: category.categroyName || '我的好友',
      categorySort: category.categorySortId,
      onlineCount: category.onlineCount || 0,
      memberCount: category.categroyMbCount || friends.length,
      friends
    }
  })
  
  // 按 categorySort 排序
  categories.sort((a: any, b: any) => a.categorySort - b.categorySort)
  
  return categories
}

// 获取群组列表
export async function getGroups(): Promise<GroupItem[]> {
  const groups = await ntCall<any[]>('ntGroupApi', 'getGroups', [false])
  return groups.map(group => ({
    groupCode: group.groupCode,
    groupName: group.groupName,
    remarkName: group.remarkName || '',
    avatar: getGroupAvatar(group.groupCode),
    memberCount: group.memberCount,
    isTop: group.isTop || false,
    msgMask: group.cmdUinMsgMask || 1
  }))
}

// 获取最近会话列表
export async function getRecentChats(): Promise<RecentChatItem[]> {
  const result = await ntCall<{ info: { changedList: any[] } }>('ntUserApi', 'getRecentContactListSnapShot', [50])
  
  // 获取群列表和好友列表的置顶信息
  const [groupsData, friendsData] = await Promise.all([
    getGroups(),
    getFriends()
  ])
  
  // 创建置顶信息映射
  const topMap = new Map<string, boolean>()
  
  // 群聊置顶信息（排除 msgMask === 2 的群）
  const toppedGroups: any[] = []
  groupsData.forEach(group => {
    // 群助手的群（msgMask === 2）不应该出现在最近联系列表
    if (group.msgMask === 2) {
      return
    }
    topMap.set(`2_${group.groupCode}`, group.isTop)
    if (group.isTop) {
      toppedGroups.push(group)
    }
  })
  
  // 好友置顶信息
  const toppedFriends: any[] = []
  friendsData.forEach(category => {
    category.friends.forEach(friend => {
      const isTop = !!(friend as any).topTime && (friend as any).topTime !== '0'
      topMap.set(`1_${friend.uin}`, isTop)
      if (isTop) {
        toppedFriends.push(friend)
      }
    })
  })
  
  // 创建已存在的会话 ID 集合
  const existingChatIds = new Set<string>()
  
  // 处理最近联系列表中的会话
  const recentChats = result.info.changedList
    .filter(item => {
      const peerId = item.peerUin || item.peerUid
      return peerId && peerId !== '0' && peerId !== ''
    })
    .map(item => {
      const chatType = item.chatType as 1 | 2 | 100
      const isGroup = chatType === 2
      const peerId = isGroup ? (item.peerUin || item.peerUid) : item.peerUin
      
      existingChatIds.add(`${chatType}_${peerId}`)
      
      // 从群列表或好友列表获取置顶状态
      const topKey = `${chatType}_${peerId}`
      const pinned = topMap.get(topKey) || false
      
      return {
        chatType,
        peerId,
        peerName: item.peerName || item.remark || item.peerUin,
        peerAvatar: isGroup ? getGroupAvatar(peerId) : getUserAvatar(item.peerUin),
        lastMessage: extractAbstractContent(item.abstractContent),
        lastTime: parseInt(item.msgTime) * 1000,
        unreadCount: parseInt(item.unreadCnt) || 0,
        pinned
      }
    })
    .filter(item => {
      // 过滤掉群助手的群（msgMask === 2）
      if (item.chatType === 2) {
        const group = groupsData.find(g => g.groupCode === item.peerId)
        if (group && group.msgMask === 2) {
          return false
        }
      }
      return true
    })
  
  // 添加置顶但不在最近联系列表中的群聊（排除群助手的群）
  toppedGroups.forEach(group => {
    const chatId = `2_${group.groupCode}`
    if (!existingChatIds.has(chatId)) {
      recentChats.push({
        chatType: 2,
        peerId: group.groupCode,
        peerName: group.groupName,
        peerAvatar: getGroupAvatar(group.groupCode),
        lastMessage: '',
        lastTime: Date.now(),
        unreadCount: 0,
        pinned: true
      })
    }
  })
  
  // 添加置顶但不在最近联系列表中的好友
  toppedFriends.forEach(friend => {
    const chatId = `1_${friend.uin}`
    if (!existingChatIds.has(chatId)) {
      recentChats.push({
        chatType: 1,
        peerId: friend.uin,
        peerName: friend.remark || friend.nickname,
        peerAvatar: getUserAvatar(friend.uin),
        lastMessage: '',
        lastTime: Date.now(),
        unreadCount: 0,
        pinned: true
      })
    }
  })
  
  // 排序：置顶的在前，然后按时间排序
  recentChats.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return b.lastTime - a.lastTime
  })
  
  return recentChats
}

// 提取消息摘要
function extractAbstractContent(abstractContent: any[]): string {
  if (!abstractContent || !Array.isArray(abstractContent)) return ''
  return abstractContent
    .map(item => {
      if (item.type === 1) return item.content || ''
      if (item.type === 2) return '[图片]'
      if (item.type === 3) return '[表情]'
      if (item.type === 6) return '[文件]'
      return ''
    })
    .join('')
}

// 获取消息历史
export async function getMessages(
  chatType: number,
  peerId: string,
  beforeMsgSeq?: string,
  limit: number = 20,
  afterMsgSeq?: string
): Promise<MessagesResponse> {
  const params = new URLSearchParams({
    chatType: String(chatType),
    peerId,
    limit: limit.toString()
  })
  if (beforeMsgSeq) {
    params.append('beforeMsgSeq', beforeMsgSeq)
  }
  if (afterMsgSeq) {
    params.append('afterMsgSeq', afterMsgSeq)
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

// 通过 URL 上传图片（后端下载）
export async function uploadImageByUrl(imageUrl: string): Promise<UploadResponse> {
  const response = await apiFetch<UploadResponse>('/api/webqq/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl })
  })
  if (!response.success) {
    throw new Error(response.message || '上传图片失败')
  }
  return response.data!
}

// 上传文件
export async function uploadFile(file: File): Promise<{ filePath: string; fileName: string; fileSize: number }> {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await apiFetch<{ filePath: string; fileName: string; fileSize: number }>('/api/webqq/upload-file', {
    method: 'POST',
    body: formData
  })
  if (!response.success) {
    throw new Error(response.message || '上传文件失败')
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
  const response = await apiFetch<T>(`/api/ntcall/${service}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args })
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

// 撤回消息
export async function recallMessage(chatType: number, peerUid: string, msgId: string): Promise<void> {
  const peer = { chatType, peerUid, guildId: '' }
  await ntCall('ntMsgApi', 'recallMsg', [peer, [msgId]])
}

// 获取用户显示名称（群聊用群名片，私聊用备注）
export async function getUserDisplayName(uid: string, groupCode?: string): Promise<string> {
  try {
    if (groupCode) {
      // 群聊：获取单个群成员信息，优先显示群名片
      const memberInfo = await ntCall<{ nick: string; cardName?: string } | null>('ntGroupApi', 'getGroupMember', [groupCode, uid, false])
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

// 戳一戳 - 使用 pmhq 服务
export async function sendPoke(chatType: number, targetUin: number, groupCode?: number): Promise<void> {
  if (chatType === 2 && groupCode) {
    // 群聊戳一戳
    await ntCall('pmhq', 'sendGroupPoke', [Number(groupCode), Number(targetUin)])
  } else {
    // 私聊戳一戳
    await ntCall('pmhq', 'sendFriendPoke', [Number(targetUin)])
  }
}

// 语音转文字
export async function translatePttToText(msgId: string, chatType: number, peerUid: string, voiceElement: any): Promise<string> {
  const peer = { chatType, peerUid, guildId: '' }
  const text = await ntCall<string>('ntMsgApi', 'translatePtt2Text', [msgId, peer, voiceElement])
  return text || ''
}

// 踢出群成员 - 使用 ntGroupApi
export async function kickGroupMember(groupCode: string, uid: string, refuseForever = false): Promise<void> {
  const result = await ntCall('ntGroupApi', 'kickMember', [groupCode, [uid], refuseForever, ''])
  if (result?.errCode !== 0) {
    throw new Error(result?.errMsg || '踢出失败')
  }
}

// 禁言群成员 - 使用 ntGroupApi
// duration 为秒数，0 为解除禁言
export async function muteGroupMember(groupCode: string, uid: string, duration: number): Promise<void> {
  await ntCall('ntGroupApi', 'banMember', [groupCode, [{ uid, timeStamp: duration }]])
}

// 设置群成员头衔 - 使用 pmhq（仅群主可用）
export async function setMemberTitle(groupCode: string, uid: string, title: string): Promise<void> {
  await ntCall('pmhq', 'setSpecialTitle', [parseInt(groupCode), uid, title])
}

// 获取语音消息 URL（通过代理）
export function getAudioProxyUrl(fileUuid: string, isGroup: boolean, filePath?: string): string {
  const token = getToken()
  let url = `/api/webqq/audio-proxy?fileUuid=${encodeURIComponent(fileUuid)}&isGroup=${isGroup}&token=${encodeURIComponent(token || '')}`
  if (filePath) {
    url += `&filePath=${encodeURIComponent(filePath)}`
  }
  return url
}

// 退出群聊（群主调用则解散群）
export async function quitGroup(groupCode: string): Promise<void> {
  const result = await ntCall<{ result: number; errMsg: string }>('ntGroupApi', 'quitGroup', [groupCode])
  if (result?.result !== 0) {
    throw new Error(result?.errMsg || '退群失败')
  }
}

// 用户资料
export interface UserProfile {
  uid: string
  uin: string
  nickname: string
  remark: string
  signature: string
  sex: number
  birthday: string
  location: string
  qid: string
  level: number
  avatar: string
  regTime?: number          // QQ注册时间（时间戳）
  // 群成员信息（仅群聊时有效）
  groupCard?: string        // 群名片
  groupRole?: 'owner' | 'admin' | 'member'  // 群角色
  groupTitle?: string       // 群头衔
  groupLevel?: number       // 群等级
  joinTime?: number         // 入群时间
  lastSpeakTime?: number    // 最后发言时间
}

// 获取用户详细资料 - 使用 ntUserApi
export async function getUserProfile(uid?: string, uin?: string, groupCode?: string): Promise<UserProfile> {
  let targetUid = uid
  
  // 如果只有 uin，先转换为 uid
  if (!targetUid && uin) {
    targetUid = await ntCall<string>('ntUserApi', 'getUidByUin', [uin])
  }
  
  if (!targetUid) {
    throw new Error('无法获取用户信息')
  }
  
  // fetchUserDetailInfo 返回 { detail: { [uid]: UserDetailInfo } }（Map 已被序列化为对象）
  const result = await ntCall<{ detail: Record<string, any> }>('ntUserApi', 'fetchUserDetailInfo', [targetUid])
  const userInfo = result.detail[targetUid]
  
  if (!userInfo) {
    throw new Error('用户不存在')
  }
  
  // 获取 uin
  let targetUin = uin || userInfo.uin
  if (!targetUin) {
    targetUin = await ntCall<string>('ntUserApi', 'getUinByUid', [targetUid])
  }
  
  const simpleInfo = userInfo.simpleInfo
  const coreInfo = simpleInfo?.coreInfo
  const baseInfo = simpleInfo?.baseInfo
  const commonExt = userInfo.commonExt
  
  // 获取 QQ 等级
  let level = commonExt?.qqLevel?.level || 0
  // 如果等级为 0，通过 pmhq.fetchUserLevel 获取
  if (level === 0 && targetUin) {
    try {
      level = await ntCall<number>('pmhq', 'fetchUserLevel', [parseInt(targetUin)])
    } catch {
      // 获取等级失败，忽略
    }
  }
  
  const profile: UserProfile = {
    uid: targetUid,
    uin: targetUin || '',
    nickname: coreInfo?.nick || '',
    remark: coreInfo?.remark || '',
    signature: baseInfo?.longNick || '',
    sex: baseInfo?.sex ?? 0,
    birthday: baseInfo?.birthday_year ? `${baseInfo.birthday_year}-${baseInfo.birthday_month}-${baseInfo.birthday_day}` : '',
    location: '',
    qid: baseInfo?.qid || '',
    level,
    regTime: commonExt?.regTime || undefined,
    avatar: `https://q1.qlogo.cn/g?b=qq&nk=${targetUin}&s=640`
  }
  
  // 如果是群聊，获取群成员信息
  if (groupCode) {
    try {
      const memberInfo = await ntCall<{
        nick: string
        cardName?: string
        role: number
        memberSpecialTitle?: string
        memberLevel?: number
        memberRealLevel?: number
        joinTime?: number
        lastSpeakTime?: number
      } | null>('ntGroupApi', 'getGroupMember', [groupCode, targetUid, false])
      
      if (memberInfo) {
        profile.groupCard = memberInfo.cardName || ''
        profile.groupRole = memberInfo.role === 4 ? 'owner' : memberInfo.role === 3 ? 'admin' : 'member'
        profile.groupTitle = memberInfo.memberSpecialTitle || ''
        // 优先使用 memberRealLevel，如果没有则使用 memberLevel
        profile.groupLevel = memberInfo.memberRealLevel || memberInfo.memberLevel || 0
        profile.joinTime = memberInfo.joinTime
        profile.lastSpeakTime = memberInfo.lastSpeakTime
      }
    } catch {
      // 获取群成员信息失败，忽略
    }
  }
  
  return profile
}

// 创建 SSE 连接（带自动重连）
export function createEventSource(
  onMessage: (event: any) => void, 
  onError?: (error: any) => void,
  onReconnect?: () => void
): EventSource {
  const token = getToken()
  const url = token ? `/api/webqq/events?token=${encodeURIComponent(token)}` : '/api/webqq/events'
  
  let eventSource: EventSource
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let isClosed = false
  
  const connect = () => {
    eventSource = new EventSource(url)
    
    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessage(data)
      } catch (e) {
        console.error('解析 SSE 消息失败:', e)
      }
    })
    
    eventSource.addEventListener('connected', () => {
      console.log('[SSE] 连接已建立')
      reconnectAttempts = 0
    })
    
    eventSource.onopen = () => {
      console.log('[SSE] 连接打开')
      // 如果是重连成功，触发回调
      if (reconnectAttempts > 0) {
        console.log('[SSE] 重连成功')
        onReconnect?.()
      }
      reconnectAttempts = 0
    }
    
    eventSource.onerror = (error) => {
      console.error('[SSE] 连接错误:', error)
      
      if (isClosed) return
      
      // 关闭当前连接
      eventSource.close()
      
      // 计算重连延迟（指数退避，最大 30 秒）
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
      reconnectAttempts++
      
      console.log(`[SSE] 将在 ${delay}ms 后尝试第 ${reconnectAttempts} 次重连...`)
      
      reconnectTimer = setTimeout(() => {
        if (!isClosed) {
          console.log('[SSE] 正在重连...')
          connect()
        }
      }, delay)
      
      onError?.(error)
    }
    
    return eventSource
  }
  
  eventSource = connect()
  
  // 返回一个包装的 EventSource，支持正确关闭
  const wrappedEventSource = {
    close: () => {
      isClosed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      eventSource.close()
      console.log('[SSE] 连接已关闭')
    },
    get readyState() {
      return eventSource.readyState
    },
    get url() {
      return eventSource.url
    },
    addEventListener: eventSource.addEventListener.bind(eventSource),
    removeEventListener: eventSource.removeEventListener.bind(eventSource),
    dispatchEvent: eventSource.dispatchEvent.bind(eventSource),
    onerror: eventSource.onerror,
    onmessage: eventSource.onmessage,
    onopen: eventSource.onopen,
    CONNECTING: EventSource.CONNECTING,
    OPEN: EventSource.OPEN,
    CLOSED: EventSource.CLOSED,
    withCredentials: eventSource.withCredentials
  } as EventSource
  
  return wrappedEventSource
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

// 群资料
export interface GroupProfile {
  groupCode: string
  groupName: string
  remarkName?: string
  avatar: string
  memberCount: number
  maxMemberCount?: number
  ownerUin?: string
  ownerName?: string
  createTime?: number
  description?: string
  announcement?: string
}

// 获取群详细资料
export async function getGroupProfile(groupCode: string): Promise<GroupProfile> {
  const groupAll = await ntCall<any>('ntGroupApi', 'getGroupAllInfo', [groupCode])
  
  // 打印群介绍调试
  console.log('[WebQQ] 群资料:', {
    groupCode: groupAll.groupCode,
    groupName: groupAll.groupName,
    fingerMemo: groupAll.fingerMemo,
    fingerMemoLength: groupAll.fingerMemo?.length,
    groupMemo: groupAll.groupMemo,
    groupMemoLength: groupAll.groupMemo?.length,
    richFingerMemo: groupAll.richFingerMemo,
  })
  
  // 获取群主信息
  let ownerName = ''
  if (groupAll.ownerUid) {
    try {
      const ownerUin = await ntCall<string>('ntUserApi', 'getUinByUid', [groupAll.ownerUid])
      const ownerInfo = await ntCall<{ coreInfo?: { nick?: string } }>('ntUserApi', 'getUserSimpleInfo', [groupAll.ownerUid, false])
      ownerName = ownerInfo?.coreInfo?.nick || ownerUin || ''
    } catch {
      // 忽略错误
    }
  }
  
  return {
    groupCode: groupAll.groupCode,
    groupName: groupAll.groupName,
    remarkName: groupAll.remarkName || '',
    avatar: getGroupAvatar(groupAll.groupCode),
    memberCount: groupAll.memberNum,
    maxMemberCount: groupAll.maxMemberNum,
    ownerUin: groupAll.ownerUid ? await ntCall<string>('ntUserApi', 'getUinByUid', [groupAll.ownerUid]).catch(() => '') : '',
    ownerName,
    createTime: groupAll.cmdUinJoinTime || undefined,
    description: groupAll.richFingerMemo || groupAll.fingerMemo || '',
    announcement: groupAll.groupMemo || ''
  }
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

// 删除好友
export async function deleteFriend(uid: string): Promise<void> {
  const result = await ntCall<{ result: number; errMsg: string }>('ntFriendApi', 'delBuddy', [uid])
  if (result?.result !== 0) {
    throw new Error(result?.errMsg || '删除好友失败')
  }
}

// 设置会话置顶
export async function setRecentChatTop(chatType: number, peerId: string, isTop: boolean): Promise<void> {
  if (chatType === 2) {
    // 群聊使用 GroupService.setTop
    const result = await ntCall<{ result: number; errMsg: string }>('ntGroupApi', 'setTop', [peerId, isTop])
    if (result?.result !== 0) {
      throw new Error(result?.errMsg || '设置置顶失败')
    }
  } else {
    // 私聊和临时会话使用 BuddyService.setTop
    const result = await ntCall<{ result: number; errMsg: string }>('ntFriendApi', 'setTop', [peerId, isTop])
    if (result?.result !== 0) {
      throw new Error(result?.errMsg || '设置置顶失败')
    }
  }
}

// 群消息接收方式枚举
export enum GroupMsgMask {
  AllowNotify = 1,      // 接收并提醒
  BoxNotNotify = 2,     // 收进群助手不提醒
  NotAllow = 3,         // 屏蔽群消息
  AllowNotNotify = 4,   // 接收但不提醒
}

// 设置群消息接收方式
export async function setGroupMsgMask(groupCode: string, msgMask: GroupMsgMask): Promise<void> {
  const result = await ntCall<{ result: number; errMsg: string }>('ntGroupApi', 'setGroupMsgMask', [groupCode, msgMask])
  if (result?.result !== 0) {
    throw new Error(result?.errMsg || '设置消息接收方式失败')
  }
}
