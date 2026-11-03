import React, { useEffect, useState } from 'react'
import { Bot, Clock, Cpu, HardDrive, Loader2, Server, Zap } from 'lucide-react'
import { useDashboardStats } from './stats'

// Tile fills stay in the 400/500 candy register, where white glyphs top out around 2.3:1.
// The shadow buys back the missing contrast without darkening the tiles.
export const GLYPH = 'text-white drop-shadow-[0_1px_1.4px_rgba(0,0,0,0.5)]'

// Decoupled from the ring: ring hues run down to 2.28:1 under a white glyph, rose holds 3.67:1.
const CHIP_GRADIENT = 'linear-gradient(135deg, #f43f5e, #ec4899)'

const CHIP = 'shrink-0 whitespace-nowrap text-xs text-theme-muted bg-theme-item px-2 py-0.5 rounded-full'

// Rings encode the metric, not the card, so every resource card draws CPU and memory the same way.
const CPU_RING: [string, string] = ['#ec4899', '#f43f5e']
const MEM_RING: [string, string] = ['#f43f5e', '#fb7185']

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 MB'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(0) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

const formatUptime = (startupTime: number): string => {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - startupTime
  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  const minutes = Math.floor((diff % 3600) / 60)
  const seconds = diff % 60
  if (days > 0) return `${days}天 ${hours}时 ${minutes}分`
  if (hours > 0) return `${hours}时 ${minutes}分 ${seconds}秒`
  if (minutes > 0) return `${minutes}分 ${seconds}秒`
  return `${seconds}秒`
}

const formatTime = (timestamp: number): string => {
  if (!timestamp) return '暂无'
  return new Date(timestamp * 1000).toLocaleString('zh-CN')
}

const Loading: React.FC = () => (
  <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-pink-500" /></div>
)

const PieChart: React.FC<{
  value: number
  size?: number
  strokeWidth?: number
  gradientId: string
  gradientColors: [string, string]
  label: string
  displayValue: string
  icon: React.ReactNode
}> = ({ value, size = 100, strokeWidth = 8, gradientId, gradientColors, label, displayValue, icon }) => {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const percent = Math.min(Math.max(value, 0), 100)
  const offset = circumference - (percent / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradientColors[0]} />
              <stop offset="100%" stopColor={gradientColors[1]} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(128,128,128,0.15)" strokeWidth={strokeWidth} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-md"
            style={{ background: CHIP_GRADIENT }}
          >
            {icon}
          </div>
          <span className="text-sm font-bold text-theme mt-1">{percent.toFixed(1)}%</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-theme mt-2">{label}</p>
      <p className="text-xs text-theme-muted">{displayValue}</p>
    </div>
  )
}

const ResourceCard: React.FC<{
  title: string
  version?: string
  icon: React.ReactNode
  gradient: string
  cpu: number
  memory: number
  totalMemory: number
  memoryPercent: number
  cpuGradientId: string
  memGradientId: string
}> = ({ title, version, icon, gradient, cpu, memory, totalMemory, memoryPercent, cpuGradientId, memGradientId }) => (
  <>
    <div className="flex items-center gap-2 mb-4">
      <div className={`w-8 h-8 rounded-lg ${gradient} flex items-center justify-center shadow-md`}>
        {icon}
      </div>
      <h4 className="text-sm font-semibold text-theme">{title}</h4>
      {version && (
        <div className="ml-auto flex items-center gap-1.5">
          <span className={CHIP}>{version}</span>
        </div>
      )}
    </div>
    <div className="flex justify-around">
      <PieChart
        value={cpu}
        gradientId={cpuGradientId}
        gradientColors={CPU_RING}
        label="CPU"
        displayValue={`${cpu.toFixed(1)}%`}
        icon={<Cpu size={16} className={GLYPH} />}
      />
      <PieChart
        value={memoryPercent}
        gradientId={memGradientId}
        gradientColors={MEM_RING}
        label="内存"
        displayValue={`${formatBytes(memory)} / ${formatBytes(totalMemory)}`}
        icon={<HardDrive size={16} className={GLYPH} />}
      />
    </div>
  </>
)

export const UptimeCard: React.FC = () => {
  const { stats, failed } = useDashboardStats()
  const [uptime, setUptime] = useState('')

  useEffect(() => {
    if (!stats?.startupTime) return
    const updateUptime = () => setUptime(formatUptime(stats.startupTime))
    updateUptime()
    const timer = setInterval(updateUptime, 1000)
    return () => clearInterval(timer)
  }, [stats?.startupTime])

  if (!stats) return failed ? <p className="text-sm text-theme-muted text-center py-10">无法加载统计数据</p> : <Loading />
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl gradient-primary-br flex items-center justify-center shadow-md">
          <Clock size={20} className={GLYPH} />
        </div>
        <h3 className="text-base font-semibold text-theme">运行时间</h3>
        <div className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-500 dark:text-green-400 text-xs font-medium">
          <Zap size={12} />
          运行中
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center space-y-2">
        <div className="p-3 r-control bg-theme-item">
          <p className="text-xs text-theme-muted">已运行</p>
          <p className="text-xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
            {uptime}
          </p>
        </div>
        <div className="px-3 py-2">
          <p className="text-xs text-theme-muted">启动时间</p>
          <p className="text-sm font-medium text-theme">{formatTime(stats.startupTime)}</p>
        </div>
      </div>
    </div>
  )
}

export const BotResourcesCard: React.FC = () => {
  const { stats, failed } = useDashboardStats()
  if (!stats) return failed ? null : <Loading />
  return (
    <ResourceCard
      title="LLBot 资源"
      version={stats.version}
      icon={<Bot size={16} className={GLYPH} />}
      gradient="bg-gradient-to-br from-[#ec4899] to-[#f43f5e]"
      cpu={stats.bot.cpu}
      memory={stats.bot.memory}
      totalMemory={stats.bot.totalMemory}
      memoryPercent={stats.bot.memoryPercent}
      cpuGradientId="botCpuGradient"
      memGradientId="botMemGradient"
    />
  )
}

export const SystemResourcesCard: React.FC = () => {
  const { stats, failed } = useDashboardStats()
  if (!stats) return failed ? null : <Loading />
  if (!stats.system) return null
  return (
    <ResourceCard
      title="系统资源"
      version={stats.system.label}
      icon={<Server size={16} className={GLYPH} />}
      gradient="bg-gradient-to-br from-[#0ea5e9] to-[#3b82f6]"
      cpu={stats.system.cpu}
      memory={stats.system.memory}
      totalMemory={stats.system.totalMemory}
      memoryPercent={stats.system.memoryPercent}
      cpuGradientId="sysCpuGradient"
      memGradientId="sysMemGradient"
    />
  )
}
