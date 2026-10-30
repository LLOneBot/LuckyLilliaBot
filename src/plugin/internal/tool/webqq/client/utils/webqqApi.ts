import { apiFetch } from './api'
import { webui } from '../context'
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

// Only ask for a spec the account really has: an avatar that tops out at 100px
// (animated ones do) has no 640, and the CDN serves the default penguin with a 200.
export function getUserAvatar(uin: string | number, size = 140): string {
  return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=${size}`
}

// Keep 640 here -- spec 0 on group avatars is the untouched original, seen at 2MB.
export function getGroupAvatar(groupCode: string): string {
  return `https://p.qlogo.cn/gh/${groupCode}/${groupCode}/640/`
}

export async function getImageRkey(): Promise<{ private_rkey: string; group_rkey: string }> {
  const response = await apiFetch<{ private_rkey: string; group_rkey: string }>('/api/webqq/rkey')
  if (!response.success) {
    throw new Error(response.message || '获取 rkey 失败')
  }
  return response.data!
}

/** The logged-in account, which getSelfUid() / getSelfUin() then give. */
export async function getLoginInfo(): Promise<{ online: boolean; uid: string; uin: string; nick: string }> {
  const response = await apiFetch<{ online: boolean; uid: string; uin: string; nick: string }>('/api/webqq/self')
  if (!response.success) {
    throw new Error(response.message || '获取登录信息失败')
  }
  const data = response.data!
  setSelfInfo(data.uid, data.uin)
  return data
}

export async function getFriends(): Promise<FriendCategory[]> {
  const response = await apiFetch<{
    friends: any[],
    categories: Record<number, any>
  }>('/api/webqq/friends')
  if (!response.success) {
    throw new Error(response.message || '获取好友列表失败')
  }
  const result = response.data!

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

  categories.sort((a, b) => a.categorySort - b.categorySort)

  return categories
}

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

// 返回空: 最近会话由前端靠 SSE 累积
export async function getRecentChats(): Promise<RecentChatItem[]> {
  return []
}

export async function getMessages(
  chatType: number,
  peerId: string,
  beforeMsgSeq?: string | number,
  limit: number = 20,
  afterMsgSeq?: string | number
): Promise<MessagesResponse> {
  const params = new URLSearchParams({
    chatType: String(chatType),
    peerId,
    limit: limit.toString()
  })
  if (beforeMsgSeq) {
    params.append('beforeMsgSeq', String(beforeMsgSeq))
  }
  if (afterMsgSeq) {
    params.append('afterMsgSeq', String(afterMsgSeq))
  }

  const response = await apiFetch<MessagesResponse>(`/api/webqq/messages?${params}`)
  if (!response.success) {
    throw new Error(response.message || '获取消息历史失败')
  }
  return response.data || { messages: [], hasMore: false }
}

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

export interface ForwardEndpoint {
  chatType: number
  peerId: string
}

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

// 由后端下载
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

export async function getGroupMembers(groupCode: string): Promise<GroupMemberItem[]> {
  const response = await apiFetch<GroupMemberItem[]>(`/api/webqq/members?groupCode=${groupCode}`)
  if (!response.success) {
    throw new Error(response.message || '获取群成员失败')
  }
  return response.data || []
}

export async function getUserInfo(uid: string): Promise<{ uid: string; uin: string; nickname: string; remark: string }> {
  const response = await apiFetch<{ uid: string; uin: string; nickname: string; remark: string }>(`/api/webqq/user-info?uid=${encodeURIComponent(uid)}`)
  if (!response.success) {
    throw new Error(response.message || '获取用户信息失败')
  }
  return response.data!
}

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

// emojiId: QQ 表情是 faceId, Unicode emoji 是码点
export async function setEmojiLike(chatType: number, peerUid: string, msgSeq: number, emojiId: string, set: boolean): Promise<void> {
  // 群和私聊都走 setGroupMsgReaction; 私聊的 peerUid 是 uid, 会被拒
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

interface GroupMemberFull {
  uid: string
  uin: number
  nick: string
  cardName?: string
  role: number
  specialTitle?: string
  level?: number
  joinedAt?: number
  lastSpokeAt?: number
}

async function getGroupMemberDetail(groupCode: string, uid: string): Promise<GroupMemberFull | null> {
  const params = new URLSearchParams({ groupCode, uid })
  const response = await apiFetch<GroupMemberFull | null>(`/api/webqq/group-member?${params}`)
  if (!response.success) {
    throw new Error(response.message || '获取群成员失败')
  }
  return response.data ?? null
}

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

async function uin2uid(uin: string, groupCode?: string): Promise<string> {
  const params = new URLSearchParams({ uin })
  if (groupCode) params.set('groupCode', groupCode)
  const response = await apiFetch<string>(`/api/webqq/uid?${params}`)
  if (!response.success) {
    throw new Error(response.message || 'uin 转 uid 失败')
  }
  return response.data || ''
}

async function uid2uin(uid: string): Promise<string> {
  const params = new URLSearchParams({ uid })
  const response = await apiFetch<string>(`/api/webqq/uin?${params}`)
  if (!response.success) {
    throw new Error(response.message || 'uid 转 uin 失败')
  }
  return response.data || ''
}

// 群聊用群名片, 私聊用备注
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

export async function translatePttToText(msgId: string, chatType: number, peerUid: string, _voiceElement: unknown): Promise<string> {
  // 后端自己从 store 取 voiceElement
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

// duration 单位秒, 0 = 解禁
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

// 仅群主可用
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

export function getAudioProxyUrl(fileUuid: string, isGroup: boolean, filePath?: string): string {
  let url = `/api/webqq/audio-proxy?fileUuid=${encodeURIComponent(fileUuid)}&isGroup=${isGroup}`
  if (filePath) {
    url += `&filePath=${encodeURIComponent(filePath)}`
  }
  return webui().authUrl(url)
}

// 群主退群就是解散
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

export async function getGroupFileList(groupCode: string, folderId = '/'): Promise<GroupFileList> {
  const response = await apiFetch<GroupFileList>(
    `/api/webqq/group-files?groupCode=${encodeURIComponent(groupCode)}&folderId=${encodeURIComponent(folderId)}`
  )
  if (!response.success) {
    throw new Error(response.message || '获取群文件列表失败')
  }
  return response.data || { files: [], folders: [] }
}

export async function getGroupFileSpace(groupCode: string): Promise<{ fileCount: number; limitCount: number; usedSpace: number; totalSpace: number }> {
  const response = await apiFetch<{ fileCount: number; limitCount: number; usedSpace: number; totalSpace: number }>(
    `/api/webqq/group-file-space?groupCode=${encodeURIComponent(groupCode)}`
  )
  if (!response.success) {
    throw new Error(response.message || '获取群文件空间失败')
  }
  return response.data!
}

export async function getGroupFileUrl(groupCode: string, fileId: string): Promise<string> {
  const response = await apiFetch<{ url: string }>(
    `/api/webqq/group-file-url?groupCode=${encodeURIComponent(groupCode)}&fileId=${encodeURIComponent(fileId)}`
  )
  if (!response.success) {
    throw new Error(response.message || '获取下载链接失败')
  }
  return response.data!.url
}

// isSelfSend 决定后端的 receiverUid 用自己的还是对方的 uid
export async function getPrivateFileUrl(peerUid: string, fileId: string, isSelfSend: boolean): Promise<string> {
  const response = await apiFetch<{ url: string }>(
    `/api/webqq/private-file-url?peerUid=${encodeURIComponent(peerUid)}&fileId=${encodeURIComponent(fileId)}&isSelfSend=${isSelfSend}`
  )
  if (!response.success) {
    throw new Error(response.message || '获取下载链接失败')
  }
  return response.data!.url
}

// 经 image-proxy 抓成同源 blob 再下载: 跨域时 download 属性被忽略, 私聊图会被存成 "download"
export async function downloadImageByUrl(url: string, suggestedName?: string): Promise<void> {
  // blob: / data: 是本地的图, 直接抓
  const isLocal = url.startsWith('blob:') || url.startsWith('data:')
  const resp = isLocal
    ? await fetch(url)
    : await webui().fetch(`/api/webqq/image-proxy?url=${encodeURIComponent(url)}`)
  if (!resp.ok) {
    throw new Error('下载图片失败')
  }
  const blob = await resp.blob()
  let name = suggestedName || 'image'
  if (!/\.[a-z0-9]+$/i.test(name)) {
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
    name = `${name}.${ext}`
  }
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objUrl)
}

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

// 只能建在根目录
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
  regTime?: number
  // 以下只有群聊时有
  groupCard?: string
  groupRole?: 'owner' | 'admin' | 'member'
  groupTitle?: string
  groupLevel?: number
  joinTime?: number
  lastSpeakTime?: number
}

export async function getUserProfile(uid?: string, uin?: string, groupCode?: string): Promise<UserProfile> {
  let targetUid = uid

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
    avatar: getUserAvatar(targetUin || '')
  }

  if (groupCode) {
    try {
      const member = await getGroupMemberDetail(groupCode, targetUid)
      if (member) {
        profile.groupCard = member.cardName || ''
        profile.groupRole = member.role === 4 ? 'owner' : member.role === 3 ? 'admin' : 'member'
        profile.groupTitle = member.specialTitle || ''
        profile.groupLevel = member.level || 0
        profile.joinTime = member.joinedAt
        profile.lastSpeakTime = member.lastSpokeAt
      }
    } catch {
      // 获取群成员信息失败，忽略
    }
  }

  return profile
}

// 自动重连
export function createEventSource(
  onMessage: (event: unknown) => void,
  onError?: (error: unknown) => void,
  onReconnect?: () => void
): EventSource {
  const url = webui().authUrl('/api/webqq/events')

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
      if (reconnectAttempts > 0) {
        console.log('[SSE] 重连成功')
        onReconnect?.()
      }
      reconnectAttempts = 0
    }

    eventSource.onerror = (error) => {
      console.error('[SSE] 连接错误:', error)

      if (isClosed) return

      eventSource.close()

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

  // close 时也停掉重连
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

export function filterGroups(groups: GroupItem[], query: string): GroupItem[] {
  if (!query.trim()) return groups
  const lowerQuery = query.toLowerCase()
  return groups.filter(group =>
    group.groupName.toLowerCase().includes(lowerQuery) ||
    group.groupCode.includes(query)
  )
}

export function filterMembers(members: GroupMemberItem[], query: string): GroupMemberItem[] {
  if (!query.trim()) return members
  const lowerQuery = query.toLowerCase()
  return members.filter(member =>
    member.nickname.toLowerCase().includes(lowerQuery) ||
    member.card.toLowerCase().includes(lowerQuery) ||
    member.uin.includes(query)
  )
}

export function isValidImageFormat(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() || ''
  return ['jpg', 'jpeg', 'png', 'gif'].includes(ext)
}

export function isEmptyMessage(text: string): boolean {
  return !text || text.trim().length === 0
}

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

export async function setRecentChatTop(chatType: number, peerId: string, isTop: boolean): Promise<void> {
  if (chatType === 2) {
    const response = await apiFetch<void>('/api/webqq/group/set-top', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupCode: peerId, isTop })
    })
    if (!response.success) {
      throw new Error(response.message || '设置置顶失败')
    }
  } else {
    // 私聊的 peerId 是 uin, setFriendPin 要 uid
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

export enum GroupMsgMask {
  AllowNotify = 1,      // 接收并提醒
  BoxNotNotify = 2,     // 收进群助手不提醒
  NotAllow = 3,         // 屏蔽群消息
  AllowNotNotify = 4,   // 接收但不提醒
}

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

export async function getGroupNotifications(): Promise<GroupNotifyItem[]> {
  const response = await apiFetch<GroupNotifyItem[]>('/api/webqq/notifications/group')
  if (!response.success) {
    throw new Error(response.message || '获取群通知失败')
  }
  return response.data || []
}

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

export async function getFriendRequests(): Promise<FriendRequestItem[]> {
  const response = await apiFetch<FriendRequestItem[]>('/api/webqq/notifications/friend')
  if (!response.success) {
    throw new Error(response.message || '获取好友申请失败')
  }
  return response.data || []
}

// 被过滤的好友申请
export async function getDoubtBuddyRequests(): Promise<DoubtBuddyItem[]> {
  const response = await apiFetch<DoubtBuddyItem[]>('/api/webqq/notifications/friend/doubt')
  if (!response.success) {
    throw new Error(response.message || '获取被过滤好友申请失败')
  }
  return response.data || []
}

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
