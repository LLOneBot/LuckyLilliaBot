import React from 'react'
import { Cpu, HardDrive, MessageCircle, MessageSquare, Send, Users, UsersRound } from 'lucide-react'
import { usePluginContext } from '@luckylillia/plugin-sdk/webui'
import { protocolLabel } from './loginOptions'
import { useNTStats } from './stats'

// Tile fills in the 400/500 range need the shadow for a white glyph to read
const GLYPH = 'text-white drop-shadow-[0_1px_1.4px_rgba(0,0,0,0.5)]'
const CHIP = 'shrink-0 whitespace-nowrap text-xs text-theme-muted bg-theme-item px-2 py-0.5 rounded-full'

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 MB'
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const Stat: React.FC<{ icon: React.ReactNode; label: string; value?: number; gradient: string }> = ({ icon, label, value, gradient }) => (
  <div className="flex items-center gap-3 p-3 rounded-xl bg-theme-item">
    <div className={`w-10 h-10 rounded-xl ${gradient} flex items-center justify-center shadow-md flex-shrink-0`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-xs text-theme-muted">{label}</p>
      <p className="text-lg font-bold text-theme truncate">{value?.toLocaleString() ?? '—'}</p>
    </div>
  </div>
)

const Meter: React.FC<{ icon: React.ReactNode; label: string; percent: number; detail: string }> = ({ icon, label, percent, detail }) => (
  <div>
    <div className="flex items-center gap-2 text-sm text-theme mb-1.5">
      {icon}
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-xs text-theme-muted">{detail}</span>
    </div>
    <div className="h-2 rounded-full bg-theme-item overflow-hidden">
      <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-rose-500 transition-all duration-700" style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
    </div>
  </div>
)

/** The scanned account and what it counts. The card around it is the WebUI's. */
export const AccountCard: React.FC = () => {
  const ctx = usePluginContext()
  const stats = useNTStats()
  if (!stats) return null
  const method = stats.mode === 'nativeqq' ? '官方 QQ 客户端桥接' : `纯协议 · ${protocolLabel(stats.protocol ?? 'macos')}`
  return (
    <div className="@container">
      <div className="flex items-center gap-3 mb-4">
        {stats.online ? (
          <img src={`https://thirdqq.qlogo.cn/g?b=qq&nk=${stats.uin}&s=140`} alt="头像" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-xl gradient-primary-br flex items-center justify-center shadow-md flex-shrink-0">
            <MessageCircle size={20} className={GLYPH} />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-theme truncate">{stats.online ? stats.nick || stats.uin : 'NTQQ 账号'}</h3>
          <p className="text-xs text-theme-muted truncate">{stats.online ? stats.uin : '还没有登录'}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
          <span className={CHIP}>{method}</span>
          {stats.version && <span className={CHIP}>QQ {stats.version}</span>}
        </div>
      </div>
      {stats.online ? (
        <div className="grid grid-cols-2 @xl:grid-cols-4 gap-3">
          <Stat icon={<Users size={20} className={GLYPH} />} label="好友数量" value={stats.friendCount} gradient="bg-gradient-to-br from-[#f43f5e] to-[#ec4899]" />
          <Stat icon={<UsersRound size={20} className={GLYPH} />} label="群组数量" value={stats.groupCount} gradient="bg-gradient-to-br from-[#14b8a6] to-[#06b6d4]" />
          <Stat icon={<MessageSquare size={20} className={GLYPH} />} label="收到消息" value={stats.messageReceived} gradient="bg-gradient-to-br from-green-500 to-emerald-500" />
          <Stat icon={<Send size={20} className={GLYPH} />} label="发送消息" value={stats.messageSent} gradient="bg-gradient-to-br from-orange-500 to-amber-500" />
        </div>
      ) : (
        <a href={ctx.pageHref('ntqq')} className="text-sm text-pink-500 hover:underline">去 NTQQ 协议页登录</a>
      )}
    </div>
  )
}

/** The QQ process, where the protocol can read it: through the bridge, not as a pure protocol client. */
export const QQResourcesCard: React.FC = () => {
  const qq = useNTStats()?.qq
  if (!qq) return null
  return (
    <div className="space-y-4">
      <Meter icon={<Cpu size={16} className="text-theme-muted" />} label="CPU" percent={qq.cpu} detail={`${qq.cpu.toFixed(1)}%`} />
      <Meter
        icon={<HardDrive size={16} className="text-theme-muted" />}
        label="内存"
        percent={qq.memoryPercent}
        detail={`${formatBytes(qq.memory)} / ${formatBytes(qq.totalMemory)}`}
      />
    </div>
  )
}
