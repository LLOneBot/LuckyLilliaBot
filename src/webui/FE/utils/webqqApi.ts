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
  GroupNotifyItem,
  FriendRequestItem,
  DoubtBuddyItem,
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
export function getUserAvatar(uin: string | number): string {
  return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640`
}

export function getGroupAvatar(groupCode: string): string {
  return `https://p.qlogo.cn/gh/${groupCode}/${groupCode}/640/`
}

// 获取图片 rkey（前端直连 QQ 图片 CDN 用，拼在 originImageUrl 后面）
export async function getImageRkey(): Promise<{ private_rkey: string; group_rkey: string }> {
  const response = await apiFetch<{ private_rkey: string; group_rkey: string }>('/api/webqq/rkey')
  if (!response.success) {
    throw new Error(response.message || '获取 rkey 失败')
  }
  return response.data!
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
  // BE 端 /api/webqq/friends 调 ntFriendApi.getFriends(true)，返
  // { friends: any[], categories: Record<number, any> }
  const response = await apiFetch<{
    friends: any[],
    categories: Record<number, any>
  }>('/api/webqq/friends')
  if (!response.success) {
    throw new Error(response.message || '获取好友列表失败')
  }
  const result = response.data!

  // 构建分组数据
  const categories = Object.values(result.categories).map((category) => {
    const friends = result.friends
      .filter((friend) => friend.categoryId === category.categoryId)
      .map((friend) => ({
        uid: friend.uid,
        uin: friend.uin.toString(),
        nickname: friend.nick,
        remark: friend.remark,
        avatar: getUserAvatar(friend.uin),
        online: friend.status !== 0
      }))

    return {
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      categorySort: category.categorySortId,
      onlineCount: friends.filter(friend => friend.online).length,
      memberCount: category.categoryMemberCount,
      friends
    }
  })

  // 按 categorySort 排序
  categories.sort((a, b) => a.categorySort - b.categorySort)

  return categories
}

// 获取群组列表
export async function getGroups(): Promise<GroupItem[]> {
  const response = await apiFetch<any[]>('/api/webqq/groups')
  if (!response.success) {
    throw new Error(response.message || '获取群组列表失败')
  }
  const groups = response.data || []
  return groups.map(group => ({
    groupCode: group.groupCode.toString(),
    groupName: group.groupName,
    remarkName: group.remarkName || '',
    avatar: getGroupAvatar(group.groupCode),
    memberCount: group.memberCount,
    isTop: group.isTop || false,
    msgMask: group.cmdUinMsgMask || 1
  }))
}

// 获取置顶列表
export async function getPins(): Promise<{ friends: string[], groups: string[] }> {
  const response = await apiFetch<{ friends: any[], groups: any[] }>('/api/webqq/pins')
  if (!response.success) {
    throw new Error(response.message || '获取置顶列表失败')
  }
  const pins = response.data!
  return {
    friends: pins.friends.map(item => item.uid),
    groups: pins.groups.map(item => item.groupCode.toString())
  }
}

// 获取最近会话列表
//
// 之前依赖 ntUserApi.getRecentContactListSnapShot 反射调用，那块逻辑已废弃 (老
// wrapper 模式专属)。当前直接返回空，FE 的最近会话由前端 SSE 实时累积维护。
export async function getRecentChats(): Promise<RecentChatItem[]> {
  return []
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

// 转发目标 / 源会话标识
export interface ForwardEndpoint {
  chatType: number
  peerId: string
}

// 单条转发 (re-send): 把源会话某条消息重新发到目标会话
export async function forwardSingleMessage(src: ForwardEndpoint, msgSeq: number, target: ForwardEndpoint): Promise<void> {
  const response = await apiFetch<{ msgId: string }>('/api/webqq/messages/forward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      srcChatType: src.chatType, srcPeerId: src.peerId, msgSeq,
      targetChatType: target.chatType, targetPeerId: target.peerId,
    })
  })
  if (!response.success) {
    throw new Error(response.message || '转发失败')
  }
}

// 多选合并转发: 把源会话多条消息合并成聊天记录卡片发到目标会话
export async function forwardMultiMessages(src: ForwardEndpoint, msgSeqs: number[], target: ForwardEndpoint): Promise<void> {
  const response = await apiFetch<{ msgId: string }>('/api/webqq/messages/forward-multi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      srcChatType: src.chatType, srcPeerId: src.peerId, msgSeqs,
      targetChatType: target.chatType, targetPeerId: target.peerId,
    })
  })
  if (!response.success) {
    throw new Error(response.message || '合并转发失败')
  }
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

// 通用 NT API 调用 已删除：FE 不再通过反射调任意服务方法。
// 所有功能改成调 webqqApi 暴露的 typed 函数 (背后是具体的 BE endpoint)。

// 获取视频播放 URL
export async function getVideoUrl(fileUuid: string, isGroup?: boolean): Promise<string> {
  if (!fileUuid) {
    throw new Error('getVideoUrl: 需要 fileUuid')
  }
  const params = new URLSearchParams({
    fileUuid,
    isGroup: String(isGroup ?? false)
  })
  const response = await apiFetch<string>(`/api/webqq/video-url?${params}`)
  if (!response.success) {
    throw new Error(response.message || '获取视频 URL 失败')
  }
  return response.data || ''
}

// 撤回消息
export async function recallMessage(chatType: number, peerUid: string, msgId: string): Promise<void> {
  const response = await apiFetch<void>('/api/webqq/messages/recall', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatType, peerUid, msgId })
  })
  if (!response.success) {
    throw new Error(response.message || '撤回失败')
  }
}

// 贴表情（QQ 表情用 faceId 数字字符串，Unicode emoji 用码点字符串）
export async function setEmojiLike(chatType: number, peerUid: string, msgSeq: number, emojiId: string, set: boolean): Promise<void> {
  // BE 端用的是 setGroupMsgReaction（虽然名字带 group，但 server 端对私聊也用同 cmd）
  // groupCode 取自 peerUid（群聊 peerUid 本来就是 groupCode；私聊 peerUid 是 uid，setGroupMsgReaction 内部会拒）
  const groupCode = chatType === 2 ? peerUid : peerUid
  const response = await apiFetch<void>('/api/webqq/messages/emoji-like', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode, msgSeq, emojiId, set })
  })
  if (!response.success) {
    throw new Error(response.message || '贴表情失败')
  }
}

// 用户简略信息（用于 getUserDisplayName 这种轻量查询）
interface UserSimple {
  uid: string
  uin: string
  nick: string
  remark: string
  level: number
  registerTime: number
  bio: string
  qid: string
  gender: number
  age: number
  birthdayYear: number
  birthdayMonth: number
  birthdayDay: number
  labels: string[]
  city: string
  country: string
  school: string
  isVip: boolean
  isYearsVip: boolean
  vipLevel: number
}

// 群成员简略信息
interface GroupMemberFull {
  uid: string
  uin: number
  nick: string
  cardName?: string
  role: number
  memberSpecialTitle?: string
  memberLevel?: number
  memberRealLevel?: number
  joinTime?: number
  lastSpeakTime?: number
}

// 获取群单个成员
async function getGroupMemberDetail(groupCode: string, uid: string): Promise<GroupMemberFull | null> {
  const params = new URLSearchParams({ groupCode, uid })
  const response = await apiFetch<GroupMemberFull | null>(`/api/webqq/group-member?${params}`)
  if (!response.success) {
    throw new Error(response.message || '获取群成员失败')
  }
  return response.data ?? null
}

// 获取用户详情
async function getUser(uid?: string, uin?: string): Promise<UserSimple> {
  const params = new URLSearchParams()
  if (uid) params.set('uid', uid)
  if (uin) params.set('uin', uin)
  const response = await apiFetch<UserSimple>(`/api/webqq/user?${params}`)
  if (!response.success) {
    throw new Error(response.message || '获取用户详情失败')
  }
  return response.data!
}

// uin → uid
async function uin2uid(uin: string, groupCode?: string): Promise<string> {
  const params = new URLSearchParams({ uin })
  if (groupCode) params.set('groupCode', groupCode)
  const response = await apiFetch<string>(`/api/webqq/uid?${params}`)
  if (!response.success) {
    throw new Error(response.message || 'uin 转 uid 失败')
  }
  return response.data || ''
}

// uid → uin
async function uid2uin(uid: string): Promise<string> {
  const params = new URLSearchParams({ uid })
  const response = await apiFetch<string>(`/api/webqq/uin?${params}`)
  if (!response.success) {
    throw new Error(response.message || 'uid 转 uin 失败')
  }
  return response.data || ''
}

// 获取用户显示名称（群聊用群名片，私聊用备注）
export async function getUserDisplayName(uid: string, groupCode?: string): Promise<string> {
  try {
    if (groupCode) {
      const member = await getGroupMemberDetail(groupCode, uid)
      if (member) {
        return member.cardName || member.nick || '未知用户'
      }
    }
    const user = await getUser(uid)
    return user.remark || user.nick || '未知用户'
  } catch {
    return '未知用户'
  }
}

// 戳一戳
export async function sendPoke(chatType: number, targetUin: number, groupCode?: number): Promise<void> {
  const url = chatType === 2 ? '/api/webqq/group/poke' : '/api/webqq/friend/poke'
  const body = chatType === 2 ? { groupCode, uin: targetUin } : { uin: targetUin }
  const response = await apiFetch<void>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.success) {
    throw new Error(response.message || '戳一戳失败')
  }
}

// 语音转文字
export async function translatePttToText(msgId: string, chatType: number, peerUid: string, _voiceElement: unknown): Promise<string> {
  // BE 端从 store 自己取 voiceElement，不需要 FE 再传
  const response = await apiFetch<string>('/api/webqq/messages/ptt-to-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgId, chatType, peerUid })
  })
  if (!response.success) {
    throw new Error(response.message || '语音转文字失败')
  }
  return response.data || ''
}

// 踢出群成员
export async function kickGroupMember(groupCode: string, uid: string, refuseForever = false): Promise<void> {
  const response = await apiFetch<void>('/api/webqq/group/kick', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode, uid, refuseForever })
  })
  if (!response.success) {
    throw new Error(response.message || '踢出失败')
  }
}

// 禁言群成员（duration 秒数，0 解禁）
export async function muteGroupMember(groupCode: string, uid: string, duration: number): Promise<void> {
  const response = await apiFetch<void>('/api/webqq/group/ban', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode, uid, duration })
  })
  if (!response.success) {
    throw new Error(response.message || '禁言失败')
  }
}

// 设置群成员头衔（仅群主可用）
export async function setMemberTitle(groupCode: string, uid: string, title: string): Promise<void> {
  const response = await apiFetch<void>('/api/webqq/group/special-title', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode, uid, title })
  })
  if (!response.success) {
    throw new Error(response.message || '设置头衔失败')
  }
}

// 设置/取消群管理员
export async function setMemberAdmin(groupCode: string, uid: string, isAdmin: boolean): Promise<void> {
  const response = await apiFetch<void>('/api/webqq/group/member-role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode, uid, isAdmin })
  })
  if (!response.success) {
    throw new Error(response.message || '设置管理员失败')
  }
}

// 收藏表情
export interface FavEmojiInfo {
  emoId: number
  resId: string
  url: string
  desc: string
}

export async function fetchFavEmojiList(): Promise<FavEmojiInfo[]> {
  const response = await apiFetch<{ emojiInfoList: FavEmojiInfo[] }>('/api/webqq/fav-emoji')
  if (!response.success) {
    throw new Error(response.message || '获取收藏表情失败')
  }
  return response.data?.emojiInfoList || []
}

export async function deleteFavEmoji(resId: string): Promise<{ result: number; errMsg: string }> {
  const response = await apiFetch<{ result: number; errMsg: string }>('/api/webqq/fav-emoji/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emojiIds: [resId] })
  })
  if (!response.success) {
    throw new Error(response.message || '删除收藏表情失败')
  }
  return response.data!
}

export async function addFavEmoji(filePath: string): Promise<{ result: number; errMsg?: string; isExist?: boolean }> {
  const response = await apiFetch<{ result: number; errMsg?: string; isExist?: boolean }>('/api/webqq/fav-emoji/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath })
  })
  if (!response.success) {
    throw new Error(response.message || '添加收藏表情失败')
  }
  return response.data!
}

// 从 URL 下载图片并添加为收藏表情。webui 右键聊天图片"添加到表情"用：
// FE 把消息里的图片 URL (拼好 host 的 originImageUrl) 传给 BE，BE 复用 image-proxy 的
// rkey 注入 + host 白名单逻辑下载图片到 temp 文件再调 addCustomFace。
export async function addFavEmojiFromUrl(url: string): Promise<{ result: number; errMsg?: string; isExist?: boolean }> {
  const response = await apiFetch<{ result: number; errMsg?: string; isExist?: boolean }>('/api/webqq/fav-emoji/add-from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  })
  if (!response.success) {
    throw new Error(response.message || '添加收藏表情失败')
  }
  return response.data!
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
  const response = await apiFetch<void>('/api/webqq/group/quit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode })
  })
  if (!response.success) {
    throw new Error(response.message || '退群失败')
  }
}

// ===== 群文件 =====

export interface GroupFileItem {
  fileId: string
  fileName: string
  fileSize: number
  busId: number
  uploadTime: number
  deadTime: number
  modifyTime: number
  downloadTimes: number
  uploaderUin: string
  uploaderName: string
}

export interface GroupFolderItem {
  folderId: string
  folderName: string
  createTime: number
  creatorUin: string
  creatorName: string
  fileCount: number
  modifyTime: number
}

export interface GroupFileList {
  files: GroupFileItem[]
  folders: GroupFolderItem[]
}

// 群文件列表（folderId 缺省为根目录 '/'）
export async function getGroupFileList(groupCode: string, folderId = '/'): Promise<GroupFileList> {
  const response = await apiFetch<GroupFileList>(
    `/api/webqq/group-files?groupCode=${encodeURIComponent(groupCode)}&folderId=${encodeURIComponent(folderId)}`
  )
  if (!response.success) {
    throw new Error(response.message || '获取群文件列表失败')
  }
  return response.data || { files: [], folders: [] }
}

// 群文件空间信息
export async function getGroupFileSpace(groupCode: string): Promise<{ fileCount: number; limitCount: number; usedSpace: number; totalSpace: number }> {
  const response = await apiFetch<{ fileCount: number; limitCount: number; usedSpace: number; totalSpace: number }>(
    `/api/webqq/group-file-space?groupCode=${encodeURIComponent(groupCode)}`
  )
  if (!response.success) {
    throw new Error(response.message || '获取群文件空间失败')
  }
  return response.data!
}

// 获取群文件下载链接（腾讯 CDN 直链）
export async function getGroupFileUrl(groupCode: string, fileId: string): Promise<string> {
  const response = await apiFetch<{ url: string }>(
    `/api/webqq/group-file-url?groupCode=${encodeURIComponent(groupCode)}&fileId=${encodeURIComponent(fileId)}`
  )
  if (!response.success) {
    throw new Error(response.message || '获取下载链接失败')
  }
  return response.data!.url
}

// 上传群文件：先经 /upload-file 拿 filePath，再调 group-file/upload 走 highway 上传 + feed 到群
export async function uploadGroupFile(groupCode: string, file: File, folderId = '/'): Promise<string> {
  const { filePath, fileName } = await uploadFile(file)
  const response = await apiFetch<{ fileId: string }>('/api/webqq/group-file/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode, filePath, fileName, folderId })
  })
  if (!response.success) {
    throw new Error(response.message || '上传群文件失败')
  }
  return response.data!.fileId
}

// 删除群文件
export async function deleteGroupFile(groupCode: string, fileId: string, busId: number): Promise<void> {
  const response = await apiFetch<void>('/api/webqq/group-file/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode, fileId, busId })
  })
  if (!response.success) {
    throw new Error(response.message || '删除群文件失败')
  }
}

// 重命名群文件
export async function renameGroupFile(groupCode: string, fileId: string, parentFolderId: string, newName: string): Promise<void> {
  const response = await apiFetch<void>('/api/webqq/group-file/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode, fileId, parentFolderId, newName })
  })
  if (!response.success) {
    throw new Error(response.message || '重命名群文件失败')
  }
}

// 新建文件夹（根目录）
export async function createGroupFolder(groupCode: string, folderName: string): Promise<void> {
  const response = await apiFetch<void>('/api/webqq/group-folder/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode, folderName })
  })
  if (!response.success) {
    throw new Error(response.message || '新建文件夹失败')
  }
}

// 删除文件夹
export async function deleteGroupFolder(groupCode: string, folderId: string): Promise<void> {
  const response = await apiFetch<void>('/api/webqq/group-folder/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode, folderId })
  })
  if (!response.success) {
    throw new Error(response.message || '删除文件夹失败')
  }
}

// 重命名文件夹
export async function renameGroupFolder(groupCode: string, folderId: string, newName: string): Promise<void> {
  const response = await apiFetch<void>('/api/webqq/group-folder/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode, folderId, newName })
  })
  if (!response.success) {
    throw new Error(response.message || '重命名文件夹失败')
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

// 获取用户详细资料
//
// 注意：之前 FE 直接 ntCall 'fetchUserDetailInfo' 拿的是嵌套很深的
// { simpleInfo: { coreInfo, baseInfo }, commonExt: { qqLevel } } 结构 (NT 内部 wrapper)。
// 现在 BE /user endpoint 走的是 ntUserApi.getUserByUid/getUserByUin，返已经解析好的 User 对象
// (含 nick / remark / level / registerTime / qid / labels 等扁平字段)。FE 直接用这个 shape。
export async function getUserProfile(uid?: string, uin?: string, groupCode?: string): Promise<UserProfile> {
  let targetUid = uid

  // 如果只有 uin，先转换为 uid（BE /uid endpoint）
  if (!targetUid && uin) {
    targetUid = await uin2uid(uin)
  }

  if (!targetUid) {
    throw new Error('无法获取用户信息')
  }

  const user = await getUser(targetUid)
  const targetUin = uin || user.uin || (await uid2uin(targetUid))

  const profile: UserProfile = {
    uid: targetUid,
    uin: targetUin || '',
    nickname: user.nick || '',
    remark: user.remark || '',
    signature: user.bio || '',
    sex: user.gender ?? 0,
    birthday: user.birthdayYear ? `${user.birthdayYear}-${user.birthdayMonth}-${user.birthdayDay}` : '',
    location: [user.country, user.city].filter(Boolean).join(' ') || '',
    qid: user.qid || '',
    level: user.level || 0,
    regTime: user.registerTime || undefined,
    avatar: `https://q1.qlogo.cn/g?b=qq&nk=${targetUin}&s=640`
  }

  // 如果是群聊，获取群成员信息
  if (groupCode) {
    try {
      const member = await getGroupMemberDetail(groupCode, targetUid)
      if (member) {
        profile.groupCard = member.cardName || ''
        profile.groupRole = member.role === 4 ? 'owner' : member.role === 3 ? 'admin' : 'member'
        profile.groupTitle = member.memberSpecialTitle || ''
        profile.groupLevel = member.memberRealLevel || member.memberLevel || 0
        profile.joinTime = member.joinTime
        profile.lastSpeakTime = member.lastSpeakTime
      }
    } catch {
      // 获取群成员信息失败，忽略
    }
  }

  return profile
}

// 创建 SSE 连接（带自动重连）
export function createEventSource(
  onMessage: (event: unknown) => void,
  onError?: (error: unknown) => void,
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

// 获取合并转发消息内容
export interface ForwardMessageSegment {
  type: 'text' | 'image' | 'face' | 'forward'
  data: {
    text?: string
    url?: string
    width?: number
    height?: number
    faceId?: number
    resId?: string
    title?: string
  }
}

export interface ForwardMessageItem {
  senderName: string
  senderUin: number
  time: number
  segments: ForwardMessageSegment[]
}

export async function getForwardMessages(resId: string): Promise<ForwardMessageItem[]> {
  const response = await apiFetch<ForwardMessageItem[]>(`/api/webqq/forward-msg?resId=${encodeURIComponent(resId)}`)
  if (!response.success) {
    throw new Error(response.message || '获取合并转发消息失败')
  }
  return response.data || []
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
//
// BE /group-detail 调 ntGroupApi.getGroup() 返回的是已经简化好的 Group 对象
// (扁平字段：groupCode/groupName/ownerUid/createdAt/maxMemberCount/memberCount/
//  description/announcementPreview)。FE 直接用这个 shape，不再像旧版本通过 ntCall
// 拿 wrapper 内部的 fingerMemo/groupMemo/cmdUinJoinTime 等原始字段。
export async function getGroupProfile(groupCode: string): Promise<GroupProfile> {
  const response = await apiFetch<{
    groupCode: number
    groupName: string
    ownerUid: string
    createdAt?: number
    maxMemberCount?: number
    memberCount?: number
    description?: string
    announcementPreview?: string
    remark?: string
  }>(`/api/webqq/group-detail?groupCode=${groupCode}`)
  if (!response.success) {
    throw new Error(response.message || '获取群详情失败')
  }
  const groupAll = response.data!

  // 获取群主信息
  let ownerName = ''
  let ownerUinStr = ''
  if (groupAll.ownerUid) {
    try {
      ownerUinStr = await uid2uin(groupAll.ownerUid)
      const ownerUser = await getUser(groupAll.ownerUid)
      ownerName = ownerUser.nick || ownerUinStr || ''
    } catch {
      // 忽略错误
    }
  }

  return {
    groupCode: String(groupAll.groupCode),
    groupName: groupAll.groupName,
    remarkName: groupAll.remark || '',
    avatar: getGroupAvatar(String(groupAll.groupCode)),
    memberCount: groupAll.memberCount ?? 0,
    maxMemberCount: groupAll.maxMemberCount,
    ownerUin: ownerUinStr,
    ownerName,
    createTime: groupAll.createdAt || undefined,
    description: groupAll.description || '',
    announcement: groupAll.announcementPreview || ''
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
  const response = await apiFetch<void>('/api/webqq/friend/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid })
  })
  if (!response.success) {
    throw new Error(response.message || '删除好友失败')
  }
}

// 设置会话置顶
export async function setRecentChatTop(chatType: number, peerId: string, isTop: boolean): Promise<void> {
  if (chatType === 2) {
    // 群聊
    const response = await apiFetch<void>('/api/webqq/group/set-top', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupCode: peerId, isTop })
    })
    if (!response.success) {
      throw new Error(response.message || '设置置顶失败')
    }
  } else {
    // 私聊：peerId 是 uin → 先转 uid (BE 端 setFriendPin 需要 uid)
    const uid = await uin2uid(peerId)
    if (!uid) throw new Error('无法获取用户信息')
    const response = await apiFetch<void>('/api/webqq/friend/set-top', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, isTop })
    })
    if (!response.success) {
      throw new Error(response.message || '设置置顶失败')
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
  const response = await apiFetch<void>('/api/webqq/group/msg-mask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupCode, msgMask })
  })
  if (!response.success) {
    throw new Error(response.message || '设置消息接收方式失败')
  }
}

// ==================== 系统通知 API ====================

// 获取群通知列表
export async function getGroupNotifications(): Promise<GroupNotifyItem[]> {
  const response = await apiFetch<GroupNotifyItem[]>('/api/webqq/notifications/group')
  if (!response.success) {
    throw new Error(response.message || '获取群通知失败')
  }
  return response.data || []
}

// 处理群通知（同意/拒绝）
export async function handleGroupNotification(flag: string, action: 'approve' | 'reject', reason?: string): Promise<void> {
  const response = await apiFetch<void>('/api/webqq/notifications/group/handle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flag, action, reason })
  })
  if (!response.success) {
    throw new Error(response.message || '处理群通知失败')
  }
}

// 处理好友申请（同意/拒绝）
export async function handleFriendRequest(flag: string, action: 'approve' | 'reject'): Promise<void> {
  const response = await apiFetch<void>('/api/webqq/notifications/friend/handle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flag, action })
  })
  if (!response.success) {
    throw new Error(response.message || '处理好友申请失败')
  }
}

// 获取好友申请历史
export async function getFriendRequests(): Promise<FriendRequestItem[]> {
  const response = await apiFetch<FriendRequestItem[]>('/api/webqq/notifications/friend')
  if (!response.success) {
    throw new Error(response.message || '获取好友申请失败')
  }
  return response.data || []
}

// 获取被过滤的好友申请
export async function getDoubtBuddyRequests(): Promise<DoubtBuddyItem[]> {
  const response = await apiFetch<DoubtBuddyItem[]>('/api/webqq/notifications/friend/doubt')
  if (!response.success) {
    throw new Error(response.message || '获取被过滤好友申请失败')
  }
  return response.data || []
}

// 同意被过滤的好友申请
export async function approveDoubtBuddy(uid: string): Promise<void> {
  const response = await apiFetch<void>('/api/webqq/notifications/friend/doubt/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid })
  })
  if (!response.success) {
    throw new Error(response.message || '处理被过滤好友申请失败')
  }
}
