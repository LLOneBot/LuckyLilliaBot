import {
  Bell, Book, BookOpen, Bot, Brain, Calendar, Clock, Cloud, Code, Cpu, Database, Dice5, FileText, Gamepad2, Gift,
  Globe, Hand, Heart, Image, Languages, LucideIcon, Mail, MessageSquare, Milk, Music, Network, Puzzle, Radio, Repeat,
  Search, Send, Settings, ShieldBan, Smartphone, Smile, Sparkles, Star, Terminal, Timer, Trophy, Users, Wrench, Zap,
} from 'lucide-react'
import { PluginState, PluginStatus } from '../../types/plugins'

// A fixed set instead of lucide's DynamicIcon, which would emit one chunk per icon (~1600 files) into the build
const ICONS: Record<string, LucideIcon> = {
  bell: Bell, book: Book, 'book-open': BookOpen, bot: Bot, brain: Brain, calendar: Calendar, clock: Clock,
  cloud: Cloud, code: Code, cpu: Cpu, database: Database, 'dice-5': Dice5, 'file-text': FileText,
  'gamepad-2': Gamepad2, gift: Gift, globe: Globe, hand: Hand, heart: Heart, image: Image, languages: Languages,
  mail: Mail, 'message-square': MessageSquare, milk: Milk, music: Music, network: Network, puzzle: Puzzle,
  radio: Radio, repeat: Repeat, search: Search, send: Send, settings: Settings, 'shield-ban': ShieldBan,
  smartphone: Smartphone, smile: Smile, sparkles: Sparkles, star: Star, terminal: Terminal, timer: Timer, trophy: Trophy, users: Users,
  wrench: Wrench, zap: Zap,
}

export function iconByName(name: string | undefined): LucideIcon {
  return ICONS[name ?? ''] ?? Puzzle
}

export function pluginIcon(plugin: PluginStatus): LucideIcon {
  return iconByName(plugin.manifest.icon)
}

export function pluginTitle(plugin: PluginStatus): string {
  return plugin.title ?? plugin.name.replace(/^(@[^/]+\/)?luckylillia-plugin-/, '')
}

/**
 * Why a pending plugin waits. Services that only exist after login all come down to the login itself, or to the
 * NT protocol when that is switched off.
 */
export function pendingReason(plugin: PluginStatus, ntProtocolOff = false): string | undefined {
  if (plugin.state !== 'pending' || !plugin.missingDeps.length) return
  if (plugin.missingDeps.includes('account')) return ntProtocolOff ? '需要先启用 NTQQ 协议' : '等待 QQ 登录'
  return `等待服务：${plugin.missingDeps.join('、')}`
}

export function pluginDescription(plugin: PluginStatus): string | undefined {
  const text = plugin.manifest.description
  if (typeof text === 'string') return text
  return text?.zh ?? text?.['zh-CN'] ?? text?.en ?? plugin.description
}

/** A running builtin that still waits for its settings (PluginStatus.notice). */
export const NEEDS_SETTINGS = { label: '待配置', className: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300' }

export const STATE_LABEL: Record<PluginState, { label: string; className: string }> = {
  active: { label: '运行中', className: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400' },
  pending: { label: '等待依赖', className: 'bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300' },
  loading: { label: '加载中', className: 'bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300' },
  failed: { label: '出错', className: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' },
  incompatible: { label: '版本不兼容', className: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300' },
  missing: { label: '文件缺失', className: 'bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-neutral-400' },
  disposed: { label: '未启用', className: 'bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-neutral-400' },
}

/** Reload leaks the previous module graph; past this many reloads a restart is worth suggesting. */
export const RELOAD_WARNING = 20

/** Bot services plugins commonly inject, named for people rather than code. */
export const SERVICE_LABEL: Record<string, string> = {
  account: 'QQ 登录',
  bots: '收发消息',
  database: '数据库',
  timer: '定时器',
  webuiServer: 'WebUI',
}

export interface Conflict {
  service: string
  with: PluginStatus[]
}

/** Per enabled entry, the services it shares with other enabled entries; cordis lets only the first provider run. */
export function findConflicts(plugins: PluginStatus[]): Map<string, Conflict[]> {
  const providers = new Map<string, PluginStatus[]>()
  for (const plugin of plugins) {
    if (plugin.disabled) continue
    for (const service of plugin.service?.implements ?? []) {
      providers.set(service, [...providers.get(service) ?? [], plugin])
    }
  }
  const conflicts = new Map<string, Conflict[]>()
  for (const [service, list] of providers) {
    if (list.length < 2) continue
    for (const plugin of list) {
      conflicts.set(plugin.id, [...conflicts.get(plugin.id) ?? [], { service, with: list.filter(other => other !== plugin) }])
    }
  }
  return conflicts
}
