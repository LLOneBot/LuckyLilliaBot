import React, { useState, useEffect } from 'react'
import { Check, X, Loader2, UserPlus, Users, LogOut, AlertTriangle, ShieldAlert } from 'lucide-react'
import { useWebQQStore } from '../../../stores/webqqStore'
import { handleGroupNotification, handleFriendRequest, approveDoubtBuddy, getUserAvatar, getGroupAvatar } from '../../../utils/webqqApi'
import { GroupNotifyType, GroupNotifyStatus } from '../../../types/webqq'
import type { GroupNotifyItem, FriendRequestItem, DoubtBuddyItem } from '../../../types/webqq'
import { showToast } from '../../common'

function formatTime(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// 获取群通知的描述文本
function getGroupNotifyDescription(item: GroupNotifyItem): string {
  const user1 = item.user1.nickName || item.user1.uin || '未知用户'
  const user2 = item.user2.nickName || item.user2.uin || ''

  switch (item.notifyType) {
    case GroupNotifyType.RequestJoinNeedAdminiStratorPass:
      return `${user1} 申请加入群`
    case GroupNotifyType.InvitedByMember:
      return `${user2} 邀请你加入群`
    case GroupNotifyType.InvitedNeedAdminiStratorPass:
      return `${user2} 邀请 ${user1} 加入群`
    case GroupNotifyType.AgreedTojoinDirect:
      return `${user1} 已加入群`
    case GroupNotifyType.AgreedToJoinByAdminiStrator:
      return `管理员已同意 ${user1} 加入群`
    case GroupNotifyType.RefuseInvited:
      return `${user1} 拒绝了邀请`
    case GroupNotifyType.RefusedByAdminiStrator:
      return `管理员拒绝了 ${user1} 的加群请求`
    case GroupNotifyType.SetAdmin:
      return `${user1} 被设为管理员`
    case GroupNotifyType.KickMemberNotifyAdmin:
      return `${user1} 被 ${user2} 移出群`
    case GroupNotifyType.KickMemberNotifyKicked:
      return `你被 ${user2} 移出群`
    case GroupNotifyType.MemberLeaveNotifyAdmin:
      return `${user1} 退出了群`
    case GroupNotifyType.CancelAdminNotifyCanceled:
      return `你被取消了管理员`
    case GroupNotifyType.CancelAdminNotifyAdmin:
      return `${user1} 被取消了管理员`
    case GroupNotifyType.TransferGroupNotifyOldowner:
      return `群主已转让给 ${user2}`
    case GroupNotifyType.TransferGroupNotifyAdmin:
      return `${user1} 将群主转让给 ${user2}`
    default:
      return '群通知'
  }
}

// 判断是否为可操作的通知（需要审批）
function isActionable(item: GroupNotifyItem): boolean {
  return (
    item.status === GroupNotifyStatus.Unhandle &&
    (item.notifyType === GroupNotifyType.RequestJoinNeedAdminiStratorPass ||
     item.notifyType === GroupNotifyType.InvitedByMember ||
     item.notifyType === GroupNotifyType.InvitedNeedAdminiStratorPass)
  )
}

// 获取状态文本
function getStatusText(item: GroupNotifyItem): string | null {
  switch (item.status) {
    case GroupNotifyStatus.Agreed:
      return '已同意'
    case GroupNotifyStatus.Refused:
      return '已拒绝'
    case GroupNotifyStatus.Ignored:
      return '已忽略'
    default:
      return null
  }
}

// 通知操作按钮样式
const btnApprove = 'flex items-center gap-1 px-3 py-1 text-xs text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-md transition-colors disabled:opacity-50'
const btnReject = 'flex items-center gap-1 px-3 py-1 text-xs text-theme-secondary hover:bg-neutral-100 dark:hover:bg-neutral-700/50 rounded-md transition-colors disabled:opacity-50'
const btnRejectConfirm = 'flex items-center gap-1 px-3 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors disabled:opacity-50'
const btnCancel = 'px-3 py-1 text-xs text-theme-muted hover:text-theme hover:bg-theme-item rounded-md transition-colors'

// 群通知卡片
const GroupNotifyCard: React.FC<{ item: GroupNotifyItem; time: number }> = ({ item, time }) => {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const updateNotificationStatus = useWebQQStore(state => state.updateNotificationStatus)

  const handleAction = async (action: 'approve' | 'reject', reason?: string) => {
    setLoading(action)
    try {
      await handleGroupNotification(item.flag, action, reason)
      updateNotificationStatus('group-notify', item.flag, action === 'approve' ? GroupNotifyStatus.Agreed : GroupNotifyStatus.Refused)
      showToast(action === 'approve' ? '已同意' : '已拒绝', 'success')
      setShowRejectInput(false)
    } catch (e: any) {
      showToast(e.message || '操作失败', 'error')
    } finally {
      setLoading(null)
    }
  }

  const statusText = getStatusText(item)
  const actionable = isActionable(item)
  const avatarUrl = getGroupAvatar(item.group.groupCode)

  return (
    <div className="flex items-start gap-3 px-3 py-3 hover:bg-theme-item-hover transition-colors">
      <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full flex-shrink-0 object-cover" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-theme truncate">{item.group.groupName}</span>
          {item.doubt && <span className="text-xs text-amber-500 flex-shrink-0">被过滤</span>}
          <span className="text-xs text-theme-hint flex-shrink-0">{formatTime(time)}</span>
        </div>
        <div className="text-xs text-theme-secondary mt-0.5">{getGroupNotifyDescription(item)}</div>
        {item.postscript && (
          <div className="text-xs text-theme-hint mt-1 bg-theme-input rounded px-2 py-1 break-words whitespace-pre-wrap">
            验证信息：{item.postscript}
          </div>
        )}
        {actionable && !showRejectInput && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handleAction('approve')}
              disabled={loading !== null}
              className={btnApprove}
            >
              {loading === 'approve' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              同意
            </button>
            <button
              onClick={() => setShowRejectInput(true)}
              disabled={loading !== null}
              className={btnReject}
            >
              <X size={12} />
              拒绝
            </button>
          </div>
        )}
        {actionable && showRejectInput && (
          <div className="mt-2 space-y-1.5">
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="拒绝理由（可选）"
              className="w-full px-2 py-1 text-xs bg-theme-input text-theme rounded border border-theme-divider focus:outline-none focus:border-pink-400"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAction('reject', rejectReason) }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleAction('reject', rejectReason)}
                disabled={loading !== null}
                className={btnRejectConfirm}
              >
                {loading === 'reject' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                确认拒绝
              </button>
              <button
                onClick={() => { setShowRejectInput(false); setRejectReason('') }}
                disabled={loading !== null}
                className={btnCancel}
              >
                取消
              </button>
            </div>
          </div>
        )}
        {statusText && (
          <div className={`text-xs mt-1 ${item.status === GroupNotifyStatus.Agreed ? 'text-pink-500' : item.status === GroupNotifyStatus.Refused ? 'text-theme-secondary' : 'text-theme-hint'}`}>
            {statusText}
          </div>
        )}
      </div>
    </div>
  )
}

// 好友申请卡片
const FriendRequestCard: React.FC<{ item: FriendRequestItem; time: number }> = ({ item, time }) => {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [decided, setDecided] = useState(item.isDecide)
  const [result, setResult] = useState<'approve' | 'reject' | null>(null)
  const updateNotificationStatus = useWebQQStore(state => state.updateNotificationStatus)

  const handleAction = async (action: 'approve' | 'reject') => {
    setLoading(action)
    try {
      await handleFriendRequest(item.flag, action)
      updateNotificationStatus('friend-request', item.flag, 0)
      setDecided(true)
      setResult(action)
      showToast(action === 'approve' ? '已同意' : '已拒绝', 'success')
    } catch (e: any) {
      showToast(e.message || '操作失败', 'error')
    } finally {
      setLoading(null)
    }
  }

  const avatarUrl = item.friendAvatarUrl || getUserAvatar(item.friendUin)

  return (
    <div className="flex items-start gap-3 px-3 py-3 hover:bg-theme-item-hover transition-colors">
      <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full flex-shrink-0 object-cover" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-theme truncate">{item.friendNick || item.friendUin}</span>
          <span className="text-xs text-theme-hint flex-shrink-0">{formatTime(time)}</span>
        </div>
        <div className="text-xs text-theme-secondary mt-0.5">请求添加你为好友</div>
        {item.extWords && (
          <div className="text-xs text-theme-hint mt-1 bg-theme-input rounded px-2 py-1 break-words whitespace-pre-wrap">
            验证信息：{item.extWords}
          </div>
        )}
        {item.addSource && (
          <div className="text-xs text-theme-hint mt-0.5">来源：{item.addSource}</div>
        )}
        {!decided && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handleAction('approve')}
              disabled={loading !== null}
              className={btnApprove}
            >
              {loading === 'approve' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              同意
            </button>
            <button
              onClick={() => handleAction('reject')}
              disabled={loading !== null}
              className={btnReject}
            >
              {loading === 'reject' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              拒绝
            </button>
          </div>
        )}
        {decided && (
          <div className={`text-xs mt-1 ${result === 'approve' ? 'text-pink-500' : result === 'reject' ? 'text-theme-secondary' : 'text-theme-hint'}`}>
            {result === 'approve' ? '已同意' : result === 'reject' ? '已拒绝' : '已处理'}
          </div>
        )}
      </div>
    </div>
  )
}

// 被过滤好友申请卡片
const DoubtBuddyCard: React.FC<{ item: DoubtBuddyItem; time: number }> = ({ item, time }) => {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [decided, setDecided] = useState(false)
  const [result, setResult] = useState<'approve' | 'reject' | null>(null)
  const updateNotificationStatus = useWebQQStore(state => state.updateNotificationStatus)

  const handleAction = async (action: 'approve' | 'reject') => {
    setLoading(action)
    try {
      if (action === 'approve') {
        await approveDoubtBuddy(item.uid)
      } else {
        await handleFriendRequest(`${item.uid}|${item.reqTime}`, 'reject')
      }
      updateNotificationStatus('doubt-buddy', item.flag, 0)
      setDecided(true)
      setResult(action)
      showToast(action === 'approve' ? '已同意' : '已拒绝', 'success')
    } catch (e: any) {
      showToast(e.message || '操作失败', 'error')
    } finally {
      setLoading(null)
    }
  }

  const avatarUrl = getUserAvatar(item.uid)

  return (
    <div className="flex items-start gap-3 px-3 py-3 hover:bg-theme-item-hover transition-colors">
      <div className="relative flex-shrink-0">
        <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
        <div className="absolute -bottom-0.5 -right-0.5 bg-amber-500 rounded-full p-0.5">
          <ShieldAlert size={10} className="text-white" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-theme truncate">{item.nick || item.uid}</span>
          <span className="text-xs text-amber-500 flex-shrink-0">被过滤</span>
          <span className="text-xs text-theme-hint flex-shrink-0">{formatTime(time)}</span>
        </div>
        <div className="text-xs text-theme-secondary mt-0.5">请求添加你为好友</div>
        {item.msg && (
          <div className="text-xs text-theme-hint mt-1 bg-theme-input rounded px-2 py-1 break-words whitespace-pre-wrap">
            验证信息：{item.msg}
          </div>
        )}
        {item.source && (
          <div className="text-xs text-theme-hint mt-0.5">来源：{item.source}</div>
        )}
        {item.reason && (
          <div className="text-xs text-amber-500/80 mt-0.5">过滤原因：{item.reason}</div>
        )}
        {!decided && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handleAction('approve')}
              disabled={loading !== null}
              className={btnApprove}
            >
              {loading === 'approve' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              同意
            </button>
            <button
              onClick={() => handleAction('reject')}
              disabled={loading !== null}
              className={btnReject}
            >
              {loading === 'reject' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              拒绝
            </button>
          </div>
        )}
        {decided && (
          <div className={`text-xs mt-1 ${result === 'approve' ? 'text-pink-500' : 'text-theme-secondary'}`}>
            {result === 'approve' ? '已同意' : '已拒绝'}
          </div>
        )}
      </div>
    </div>
  )
}

// 信息类通知卡片（群解散、退群等）
const InfoNotifyCard: React.FC<{ type: 'group-dismiss' | 'group-quit'; data: { groupCode: string; groupName: string }; time: number }> = ({ type, data, time }) => {
  const avatarUrl = getGroupAvatar(data.groupCode)
  const Icon = type === 'group-dismiss' ? AlertTriangle : LogOut
  const message = type === 'group-dismiss' ? '群已解散' : '已退出群聊'

  return (
    <div className="flex items-start gap-3 px-3 py-3 hover:bg-theme-item-hover transition-colors">
      <div className="relative flex-shrink-0">
        <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
        <div className="absolute -bottom-0.5 -right-0.5 bg-orange-500 rounded-full p-0.5">
          <Icon size={10} className="text-white" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-theme truncate">{data.groupName || data.groupCode}</span>
          <span className="text-xs text-theme-hint flex-shrink-0">{formatTime(time)}</span>
        </div>
        <div className="text-xs text-orange-500 mt-0.5">{message}</div>
      </div>
    </div>
  )
}

// 主通知面板
type NotifyTab = 'friend' | 'group'

const NotificationPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const notifications = useWebQQStore(state => state.notifications)
  const clearNotificationUnread = useWebQQStore(state => state.clearNotificationUnread)
  const loadGroupNotifications = useWebQQStore(state => state.loadGroupNotifications)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<NotifyTab>('friend')

  useEffect(() => {
    clearNotificationUnread()
  }, [clearNotificationUnread])

  const handleRefresh = async () => {
    setLoading(true)
    try {
      await loadGroupNotifications()
    } finally {
      setLoading(false)
    }
  }

  // 分类通知
  const friendRequests = notifications.filter(n => n.type === 'friend-request' || n.type === 'doubt-buddy')
  const groupNotifies = notifications.filter(n => n.type === 'group-notify' || n.type === 'group-dismiss' || n.type === 'group-quit')

  // 未处理数量
  const friendPendingCount = friendRequests.filter(n =>
    (n.type === 'friend-request' && !n.data.isDecide) || n.type === 'doubt-buddy'
  ).length
  const groupPendingCount = groupNotifies.filter(n => n.type === 'group-notify' && isActionable(n.data)).length

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-theme-divider">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('friend')}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'friend'
                ? 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/30'
                : 'text-theme-muted hover:text-theme hover:bg-theme-item'
            }`}
          >
            <UserPlus size={13} />
            好友申请
            {friendPendingCount > 0 && (
              <span className="ml-0.5 min-w-[16px] h-[16px] bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center px-1">{friendPendingCount}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('group')}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'group'
                ? 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/30'
                : 'text-theme-muted hover:text-theme hover:bg-theme-item'
            }`}
          >
            <Users size={13} />
            群通知
            {groupPendingCount > 0 && (
              <span className="ml-0.5 min-w-[16px] h-[16px] bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center px-1">{groupPendingCount}</span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-xs text-pink-500 hover:text-pink-600 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : '刷新'}
          </button>
        </div>
      </div>

      {/* 通知列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {(activeTab === 'friend' ? friendRequests : groupNotifies).length === 0 ? (
          <div className="flex items-center justify-center h-32 text-theme-hint text-sm">
            {activeTab === 'friend' ? '暂无好友申请' : '暂无群通知'}
          </div>
        ) : (
          <div className="divide-y divide-theme-divider">
            {activeTab === 'friend'
              ? friendRequests.map((notification, index) => {
                  if (notification.type === 'friend-request') {
                    return (
                      <FriendRequestCard
                        key={`fr-${notification.data.flag}-${index}`}
                        item={notification.data}
                        time={notification.time}
                      />
                    )
                  }
                  if (notification.type === 'doubt-buddy') {
                    return (
                      <DoubtBuddyCard
                        key={`db-${notification.data.flag}-${index}`}
                        item={notification.data}
                        time={notification.time}
                      />
                    )
                  }
                  return null
                })
              : groupNotifies.map((notification, index) => {
                  if (notification.type === 'group-notify') {
                    return <GroupNotifyCard key={`gn-${notification.data.flag}-${index}`} item={notification.data} time={notification.time} />
                  }
                  if (notification.type === 'group-dismiss' || notification.type === 'group-quit') {
                    return <InfoNotifyCard key={`info-${notification.type}-${index}`} type={notification.type} data={notification.data} time={notification.time} />
                  }
                  return null
                })
            }
          </div>
        )}
      </div>
    </div>
  )
}

export default NotificationPanel
