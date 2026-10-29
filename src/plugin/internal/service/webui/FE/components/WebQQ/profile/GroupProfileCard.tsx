import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Users, Crown, Shield, Calendar, LogOut } from 'lucide-react'
import { getSelfUin } from '../../../utils/webqqApi'

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

interface GroupProfileCardProps {
  profile: GroupProfile | null
  loading: boolean
  position: { x: number; y: number }
  onClose: () => void
  onQuitGroup?: (groupCode: string, isOwner: boolean) => void
}

export const GroupProfileCard: React.FC<GroupProfileCardProps> = ({ profile, loading, position, onClose, onQuitGroup }) => {
  const cardRef = useRef<HTMLDivElement>(null)
  const [adjustedPosition, setAdjustedPosition] = useState({ left: position.x, top: position.y })
  const [showConfirm, setShowConfirm] = useState(false)
  
  const selfUin = getSelfUin()
  const isOwner = profile?.ownerUin === selfUin
  
  useEffect(() => {
    if (!cardRef.current) return
    
    const cardWidth = 320
    const cardHeight = cardRef.current.offsetHeight || 300
    let left = position.x
    let top = position.y
    
    if (left + cardWidth > window.innerWidth - 20) {
      left = window.innerWidth - cardWidth - 20
    }
    if (left < 20) left = 20
    if (top + cardHeight > window.innerHeight - 20) {
      top = window.innerHeight - cardHeight - 20
    }
    if (top < 20) top = 20
    
    setAdjustedPosition({ left, top })
  }, [position, profile, loading])
  
  if (!profile && !loading) return null
  
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return ''
    return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }
  
  const handleQuitClick = () => {
    setShowConfirm(true)
  }
  
  const handleConfirmQuit = () => {
    if (profile && onQuitGroup) {
      onQuitGroup(profile.groupCode, isOwner)
    }
    setShowConfirm(false)
    onClose()
  }
  
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={cardRef}
        className="fixed z-50 r-card overflow-hidden bg-popup glass-pop origin-top-left"
        style={{ left: adjustedPosition.left, top: adjustedPosition.top, width: 320, maxHeight: 'calc(100vh - 40px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin text-pink-500" />
          </div>
        ) : profile && (
          <>
            <div className="bg-gradient-to-r from-blue-400 to-cyan-300 p-4 relative">
              {/* 右上角退群/解散按钮 */}
              {onQuitGroup && (
                <button
                  onClick={handleQuitClick}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                  title={isOwner ? '解散该群' : '退出该群'}
                >
                  <LogOut size={16} />
                </button>
              )}
              <div className="flex items-start gap-4">
                <img 
                  src={profile.avatar} 
                  alt={profile.groupName}
                  className="w-16 h-16 rounded-lg border-3 border-white/80 object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0 text-white pt-1 pr-6">
                  <div className="font-bold text-lg truncate mb-1">{profile.groupName}</div>
                  {profile.remarkName && profile.remarkName !== profile.groupName && (
                    <div className="text-white/80 text-sm truncate mb-1">备注: {profile.remarkName}</div>
                  )}
                  <div className="text-white/90 text-sm">{profile.groupCode}</div>
                </div>
              </div>
            </div>
            
            <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 40px - 140px)' }}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="text-theme-hint flex items-center gap-1"><Users size={14} />成员</span>
                <span className="text-theme">
                  {profile.memberCount}{profile.maxMemberCount ? ` / ${profile.maxMemberCount}` : ''}
                </span>
                
                {profile.ownerName && (
                  <>
                    <span className="text-theme-hint flex items-center gap-1"><Crown size={14} />群主</span>
                    <span className="text-theme truncate">{profile.ownerName}</span>
                  </>
                )}
                
                {profile.createTime && (
                  <>
                    <span className="text-theme-hint flex items-center gap-1"><Calendar size={14} />创建</span>
                    <span className="text-theme">{formatTime(profile.createTime)}</span>
                  </>
                )}
              </div>
              
              {profile.description && (
                <>
                  <div className="border-t border-theme-divider my-3" />
                  <div className="text-xs text-theme-hint mb-2">群简介</div>
                  <div 
                    className="text-theme-secondary text-sm bg-theme-item/50 rounded-lg px-3 py-2 break-words whitespace-pre-wrap"
                    style={{ maxHeight: '120px', overflowY: 'auto' }}
                  >
                    {profile.description}
                  </div>
                </>
              )}
              
              {profile.announcement && (
                <>
                  <div className="border-t border-theme-divider my-3" />
                  <div className="text-xs text-theme-hint mb-2 flex items-center gap-1">
                    <Shield size={12} />群公告
                  </div>
                  <div 
                    className="text-theme-secondary text-sm bg-theme-item/50 rounded-lg px-3 py-2 break-words whitespace-pre-wrap"
                    style={{ maxHeight: '120px', overflowY: 'auto' }}
                  >
                    {profile.announcement}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
      
      {/* 确认对话框 */}
      {showConfirm && profile && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setShowConfirm(false)} />
          <div className="fixed z-[70] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass glass-thick r-panel glass-pop p-6 min-w-[320px]">
            <h3 className="text-lg font-medium text-theme mb-4">
              {isOwner ? '确认解散群聊' : '确认退出群聊'}
            </h3>
            <p className="text-theme-secondary mb-6">
              {isOwner 
                ? <>确定要解散群 <span className="font-medium text-theme">{profile.groupName}</span> 吗？此操作不可撤销，所有群成员将被移出。</>
                : <>确定要退出群 <span className="font-medium text-theme">{profile.groupName}</span> 吗？</>
              }
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowConfirm(false)} 
                className="px-4 py-2 text-sm text-theme-secondary hover:bg-theme-item rounded-lg transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleConfirmQuit}
                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                {isOwner ? '确认解散' : '确认退出'}
              </button>
            </div>
          </div>
        </>
      )}
    </>,
    document.body
  )
}

export default GroupProfileCard
