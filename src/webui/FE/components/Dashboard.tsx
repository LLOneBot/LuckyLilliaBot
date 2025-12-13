import React, { useEffect, useState, useRef } from 'react'
import { apiFetch } from '../utils/api'
import { Users, UsersRound, MessageSquare, Send, Clock, Cpu, HardDrive, Zap, Bot, MessageCircle } from 'lucide-react'

interface DashboardStats {
  friendCount: number
  groupCount: number
  messageReceived: number
  messageSent: number
  startupTime: number
  lastMessageTime: number
  bot: {
    memory: number
    totalMemory: number
    memoryPercent: number
    cpu: number
  }
  qq: {
    memory: number
    totalMemory: number
    memoryPercent: number
    cpu: number
  }
}

// Mock 数据开关
const USE_MOCK_DATA = false

const generateMockStats = (): DashboardStats => ({
  friendCount: 128,
  groupCount: 45,
  messageReceived: 12580,
  messageSent: 3842,
  startupTime: Math.floor(Date.now() / 1000) - 3600 * 5 - 1234,
  lastMessageTime: Math.floor(Date.now() / 1000) - 30,
  bot: {
    memory: (80 + Math.random() * 40) * 1024 * 1024,
    totalMemory: 16 * 1024 * 1024 * 1024,
    memoryPercent: 2 + Math.random() * 3,
    cpu: 3 + Math.random() * 10,
  },
  qq: {
    memory: (200 + Math.random() * 100) * 1024 * 1024,
    totalMemory: 16 * 1024 * 1024 * 1024,
    memoryPercent: 5 + Math.random() * 8,
    cpu: 5 + Math.random() * 15,
  },
})

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

// 统计项组件
const StatItem: React.FC<{
  icon: React.ReactNode
  label: string
  value: string | number
  gradient: string
}> = ({ icon, label, value, gradient }) => (
  <div className="flex items-center gap-3 p-3 rounded-xl bg-white/30 hover:bg-white/50 transition-all duration-200 hover:scale-[1.02]">
    <div className={`w-10 h-10 rounded-xl ${gradient} flex items-center justify-center shadow-md`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-800 truncate">{value}</p>
    </div>
  </div>
)

// 饼状图组件
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
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={strokeWidth} />
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
            style={{ background: `linear-gradient(135deg, ${gradientColors[0]}, ${gradientColors[1]})` }}
          >
            {icon}
          </div>
          <span className="text-sm font-bold text-gray-800 mt-1">{percent.toFixed(1)}%</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-gray-700 mt-2">{label}</p>
      <p className="text-xs text-gray-500">{displayValue}</p>
    </div>
  )
}

// 资源卡片组件
const ResourceCard: React.FC<{
  title: string
  icon: React.ReactNode
  gradient: string
  cpu: number
  memory: number
  totalMemory: number
  memoryPercent: number
  cpuGradientId: string
  memGradientId: string
  cpuColors: [string, string]
  memColors: [string, string]
}> = ({ title, icon, gradient, cpu, memory, totalMemory, memoryPercent, cpuGradientId, memGradientId, cpuColors, memColors }) => {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-8 h-8 rounded-lg ${gradient} flex items-center justify-center shadow-md`}>
          {icon}
        </div>
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
      </div>
      <div className="flex justify-around">
        <PieChart
          value={cpu}
          gradientId={cpuGradientId}
          gradientColors={cpuColors}
          label="CPU"
          displayValue={`${cpu.toFixed(1)}%`}
          icon={<Cpu size={16} className="text-white" />}
        />
        <PieChart
          value={memoryPercent}
          gradientId={memGradientId}
          gradientColors={memColors}
          label="内存"
          displayValue={`${formatBytes(memory)} / ${formatBytes(totalMemory)}`}
          icon={<HardDrive size={16} className="text-white" />}
        />
      </div>
    </div>
  )
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [uptime, setUptime] = useState('')
  const intervalRef = useRef<number>()

  const fetchStats = async () => {
    try {
      const data = USE_MOCK_DATA
        ? generateMockStats()
        : (await apiFetch<DashboardStats>('/api/dashboard/stats')).data
      if (data) setStats(data)
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    intervalRef.current = window.setInterval(fetchStats, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  useEffect(() => {
    if (!stats?.startupTime) return
    const updateUptime = () => setUptime(formatUptime(stats.startupTime))
    updateUptime()
    const timer = setInterval(updateUptime, 1000)
    return () => clearInterval(timer)
  }, [stats?.startupTime])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-500">无法加载统计数据</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 核心统计 - 三列布局 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 运行时间 */}
        <div className="card p-4 flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
              <Clock size={20} className="text-white" />
            </div>
            <h3 className="text-base font-semibold text-gray-800">运行时间</h3>
            <div className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-600 text-xs font-medium">
              <Zap size={12} />
              运行中
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center space-y-2">
            <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50">
              <p className="text-xs text-gray-500">已运行</p>
              <p className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                {uptime}
              </p>
            </div>
            <div className="px-3 py-2">
              <p className="text-xs text-gray-500">启动时间</p>
              <p className="text-sm font-medium text-gray-700">{formatTime(stats.startupTime)}</p>
            </div>
          </div>
        </div>

        {/* 好友 & 群组 */}
        <div className="card p-4 space-y-3">
          <StatItem
            icon={<Users size={20} className="text-white" />}
            label="好友数量"
            value={stats.friendCount.toLocaleString()}
            gradient="bg-gradient-to-br from-blue-500 to-cyan-500"
          />
          <StatItem
            icon={<UsersRound size={20} className="text-white" />}
            label="群组数量"
            value={stats.groupCount.toLocaleString()}
            gradient="bg-gradient-to-br from-purple-500 to-pink-500"
          />
        </div>

        {/* 收发消息 */}
        <div className="card p-4 space-y-3">
          <StatItem
            icon={<MessageSquare size={20} className="text-white" />}
            label="收到消息"
            value={stats.messageReceived.toLocaleString()}
            gradient="bg-gradient-to-br from-green-500 to-emerald-500"
          />
          <StatItem
            icon={<Send size={20} className="text-white" />}
            label="发送消息"
            value={stats.messageSent.toLocaleString()}
            gradient="bg-gradient-to-br from-orange-500 to-amber-500"
          />
        </div>
      </div>

      {/* 资源使用 - QQ 和 Bot 并排 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ResourceCard
          title="QQ 资源"
          icon={<MessageCircle size={16} className="text-white" />}
          gradient="bg-gradient-to-br from-blue-500 to-cyan-500"
          cpu={stats.qq.cpu}
          memory={stats.qq.memory}
          totalMemory={stats.qq.totalMemory}
          memoryPercent={stats.qq.memoryPercent}
          cpuGradientId="qqCpuGradient"
          memGradientId="qqMemGradient"
          cpuColors={['#3b82f6', '#06b6d4']}
          memColors={['#0ea5e9', '#22d3ee']}
        />
        <ResourceCard
          title="Bot 资源"
          icon={<Bot size={16} className="text-white" />}
          gradient="bg-gradient-to-br from-violet-500 to-purple-600"
          cpu={stats.bot.cpu}
          memory={stats.bot.memory}
          totalMemory={stats.bot.totalMemory}
          memoryPercent={stats.bot.memoryPercent}
          cpuGradientId="botCpuGradient"
          memGradientId="botMemGradient"
          cpuColors={['#8b5cf6', '#a855f7']}
          memColors={['#6366f1', '#8b5cf6']}
        />
      </div>
    </div>
  )
}

export default Dashboard
