import React, { useState } from 'react'
import { createPortal } from 'react-dom'

// 禁言时长选择对话框组件
export const MuteDialog: React.FC<{
  name: string
  onMute: (seconds: number) => void
  onClose: () => void
}> = ({ name, onMute, onClose }) => {
  const [seconds, setSeconds] = useState(0)
  const [minutes, setMinutes] = useState(0)
  const [hours, setHours] = useState(0)
  const [days, setDays] = useState(0)
  
  const handleConfirm = () => {
    const totalSeconds = seconds + minutes * 60 + hours * 3600 + days * 86400
    if (totalSeconds > 0) {
      onMute(totalSeconds)
    }
  }
  
  const totalSeconds = seconds + minutes * 60 + hours * 3600 + days * 86400
  
  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass glass-thick r-panel glass-pop p-6 min-w-[340px]">
        <h3 className="text-lg font-medium text-theme mb-4">禁言 {name}</h3>
        <div className="mb-4">
          <p className="text-sm text-theme-secondary mb-3">设置禁言时长：</p>
          <div className="grid grid-cols-4 gap-2">
            <div className="flex flex-col items-center">
              <input
                type="number"
                min={0}
                max={59}
                value={seconds}
                onChange={(e) => setSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-full px-2 py-2 text-center bg-theme-input border border-theme-input rounded-lg text-theme focus:outline-none focus:ring-2 focus:ring-pink-500/20"
              />
              <span className="text-xs text-theme-secondary mt-1">秒</span>
            </div>
            <div className="flex flex-col items-center">
              <input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => setMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-full px-2 py-2 text-center bg-theme-input border border-theme-input rounded-lg text-theme focus:outline-none focus:ring-2 focus:ring-pink-500/20"
              />
              <span className="text-xs text-theme-secondary mt-1">分钟</span>
            </div>
            <div className="flex flex-col items-center">
              <input
                type="number"
                min={0}
                max={23}
                value={hours}
                onChange={(e) => setHours(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-full px-2 py-2 text-center bg-theme-input border border-theme-input rounded-lg text-theme focus:outline-none focus:ring-2 focus:ring-pink-500/20"
              />
              <span className="text-xs text-theme-secondary mt-1">小时</span>
            </div>
            <div className="flex flex-col items-center">
              <input
                type="number"
                min={0}
                max={29}
                value={days}
                onChange={(e) => setDays(Math.min(29, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-full px-2 py-2 text-center bg-theme-input border border-theme-input rounded-lg text-theme focus:outline-none focus:ring-2 focus:ring-pink-500/20"
              />
              <span className="text-xs text-theme-secondary mt-1">天</span>
            </div>
          </div>
          <p className="text-xs text-theme-secondary mt-2 text-center">
            最长29天23小时59分59秒
          </p>
        </div>
        <div className="flex justify-between">
          <button 
            onClick={() => onMute(0)} 
            className="px-4 py-2 text-sm text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
          >
            解除禁言
          </button>
          <div className="flex gap-2">
            <button 
              onClick={onClose} 
              className="px-4 py-2 text-sm text-theme-secondary hover:bg-theme-item rounded-lg transition-colors"
            >
              取消
            </button>
            <button 
              onClick={handleConfirm}
              disabled={totalSeconds === 0}
              className="px-4 py-2 text-sm bg-orange-500 text-white hover:bg-orange-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              确认禁言
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

// 踢出群确认对话框
export const KickConfirmDialog: React.FC<{
  name: string
  groupName: string
  onConfirm: () => void
  onClose: () => void
}> = ({ name, groupName, onConfirm, onClose }) => {
  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass glass-thick r-panel glass-pop p-6 min-w-[320px]">
        <h3 className="text-lg font-medium text-theme mb-4">确认踢出</h3>
        <p className="text-theme-secondary mb-6">
          确定要将 <span className="font-medium text-theme">{name}</span> 移出群 <span className="font-medium text-theme">{groupName}</span> 吗？
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-theme-secondary hover:bg-theme-item rounded-lg transition-colors">
            取消
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-red-500 text-white hover:bg-red-600 rounded-lg transition-colors">
            确认踢出
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}

// 设置头衔对话框
export const TitleDialog: React.FC<{
  name: string
  onConfirm: (title: string) => void
  onClose: () => void
}> = ({ name, onConfirm, onClose }) => {
  const [title, setTitle] = useState('')
  
  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass glass-thick r-panel glass-pop p-6 min-w-[320px]">
        <h3 className="text-lg font-medium text-theme mb-4">设置头衔</h3>
        <p className="text-sm text-theme-secondary mb-3">为 {name} 设置专属头衔：</p>
        <input
          type="text"
          maxLength={12}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="留空清除头衔"
          className="w-full px-3 py-2 bg-theme-input border border-theme-input rounded-lg text-theme focus:outline-none focus:ring-2 focus:ring-pink-500/20 placeholder:text-theme-hint"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onConfirm(title.trim())
            }
          }}
        />
        <p className="text-xs text-theme-secondary mt-2">中文最多6字，英文最多12字，按回车确认</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-theme-secondary hover:bg-theme-item rounded-lg transition-colors">
            取消
          </button>
          <button 
            onClick={() => onConfirm(title.trim())}
            className="px-4 py-2 text-sm bg-pink-500 text-white hover:bg-pink-600 rounded-lg transition-colors"
          >
            确认
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
