import {
  Bell, Book, BookOpen, Bot, Brain, Calendar, Clock, Cloud, Code, Cpu, Database, Dice5, FileText, Gamepad2, Gift,
  Globe, Hand, Heart, Image, Info, Languages, LayoutDashboard, LucideIcon, Mail, MessageSquare, Milk, Music, Network,
  Puzzle, Radio, Repeat, ScrollText, Search, Send, Settings, ShieldBan, Sliders, Smartphone, Smile, Sparkles, Star, Store,
  Terminal, Timer, Trophy, Users, Wrench, Zap,
} from 'lucide-react'
import { EntryScope, PluginState, PluginStatus } from '../../types/plugins'

// A fixed set instead of lucide's DynamicIcon, which would emit one chunk per icon (~1600 files) into the build
const ICONS: Record<string, LucideIcon> = {
  bell: Bell, book: Book, 'book-open': BookOpen, bot: Bot, brain: Brain, calendar: Calendar, clock: Clock,
  cloud: Cloud, code: Code, cpu: Cpu, database: Database, 'dice-5': Dice5, 'file-text': FileText,
  'gamepad-2': Gamepad2, gift: Gift, globe: Globe, hand: Hand, heart: Heart, image: Image, info: Info,
  languages: Languages, 'layout-dashboard': LayoutDashboard, mail: Mail, 'message-square': MessageSquare, milk: Milk,
  music: Music, network: Network, puzzle: Puzzle, radio: Radio, repeat: Repeat, 'scroll-text': ScrollText,
  search: Search, send: Send, settings: Settings, 'shield-ban': ShieldBan, sliders: Sliders, smartphone: Smartphone, smile: Smile,
  sparkles: Sparkles, star: Star, store: Store, terminal: Terminal, timer: Timer, trophy: Trophy, users: Users,
  wrench: Wrench, zap: Zap,
}

export function iconByName(name: string | undefined): LucideIcon {
  return ICONS[name ?? ''] ?? Puzzle
}

export function pluginIcon(plugin: PluginStatus): LucideIcon {
  return iconByName(plugin.manifest.icon)
}

/** Plain text, or the Chinese of a map keyed by locale (`llbot.description` / `llbot.title`) */
function localized(text: string | Record<string, string> | undefined): string | undefined {
  if (typeof text === 'string') return text.trim() || undefined
  return text?.zh ?? text?.['zh-CN'] ?? text?.en
}

export function pluginTitle(plugin: PluginStatus): string {
  return plugin.title ?? localized(plugin.manifest.title) ?? plugin.name.replace(/^(@[^/]+\/)?luckylillia-plugin-/, '')
}

/** The plugin providing a service by its manifest, an enabled one first. */
export function providerOf(service: string, plugins: PluginStatus[]): PluginStatus | undefined {
  const candidates = plugins.filter(plugin => plugin.service.implements.includes(service))
  return candidates.find(plugin => !plugin.disabled) ?? candidates[0]
}

/** What a service stands for: the label its provider gives it (llbot.service.labels), else a bot service's name. */
export function serviceLabel(service: string, plugins: PluginStatus[]): string | undefined {
  return plugins.find(plugin => plugin.service.labels?.[service])?.service.labels![service] ?? SERVICE_LABEL[service]
}

/**
 * Whom a pending plugin waits for: the entry providing a missing service by its manifest, one switched off first,
 * else one that labels the service. Undefined while it only waits for what the bot brings up by itself, e.g. the
 * services that follow the NTQQ login a moment later.
 */
export function waitingFor(plugin: PluginStatus, plugins: PluginStatus[]): { provider: PluginStatus; label?: string } | undefined {
  if (plugin.state !== 'pending') return
  const providers = plugin.missingDeps
    .map(service => ({ service, provider: providerOf(service, plugins) }))
    .filter((item): item is { service: string; provider: PluginStatus } => !!item.provider && item.provider.id !== plugin.id)
  const reason = providers.find(item => item.provider.disabled)
    ?? providers.find(item => item.provider.service.labels?.[item.service])
    ?? providers[0]
  return reason && { provider: reason.provider, label: reason.provider.service.labels?.[reason.service] }
}

/** A space before Latin text, none before Chinese: `要等${spaced(label)}后` */
export const spaced = (text: string) => (/^[\x21-\x7e]/.test(text) ? ` ${text}` : text)

/**
 * Why a pending plugin waits: the provider of a missing service when that is switched off, else what the missing
 * services stand for. Ones a provider labels come first and alone: the rest usually follow from them, e.g. what
 * only exists after the NTQQ login.
 */
export function pendingReason(plugin: PluginStatus, plugins: PluginStatus[]): string | undefined {
  if (plugin.state !== 'pending' || !plugin.missingDeps.length) return
  const off = plugin.missingDeps.map(name => providerOf(name, plugins)).find(provider => provider?.disabled)
  if (off) return `需要先启用「${pluginTitle(off)}」`
  const labeled = plugin.missingDeps.map(name => plugins.find(item => item.service.labels?.[name])?.service.labels![name])
    .filter((label): label is string => !!label)
  if (labeled.length) return `等待：${[...new Set(labeled)].join('、')}`
  return `等待服务：${plugin.missingDeps.map(name => SERVICE_LABEL[name] ?? name).join('、')}`
}

export function pluginDescription(plugin: PluginStatus): string | undefined {
  return localized(plugin.manifest.description) ?? plugin.description
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

/** The bot's own services plugins commonly inject, named for people rather than code; plugins name theirs. */
export const SERVICE_LABEL: Record<string, string> = {
  bots: '收发消息',
  commands: '指令',
  database: '数据库',
  account: 'NTQQ 账号',
  timer: '定时器',
  http: '网络请求',
  webuiServer: 'WebUI',
}

/** The platforms of the bots, named for people */
export const PLATFORM_LABEL: Record<string, string> = { luckylillia: 'QQ 号', qq: 'QQ 官方机器人', qqguild: 'QQ 频道' }

/** What a scope leaves out, in a few words; undefined when it lets everything through. */
export function scopeSummary(scope: EntryScope | undefined): string | undefined {
  if (!scope) return
  const parts: string[] = []
  if (scope.platforms?.length) parts.push(`只在${scope.platforms.map(platform => PLATFORM_LABEL[platform] ?? platform).join('、')}`)
  if (scope.bots?.length) parts.push(`只用 ${scope.bots.length} 个账号`)
  if (scope.guilds) parts.push(`${scope.guilds.mode === 'allow' ? '只在' : '不在'} ${scope.guilds.ids.length} 个群`)
  if (scope.users) parts.push(`${scope.users.mode === 'allow' ? '只理' : '不理'} ${scope.users.ids.length} 个人`)
  if (scope.direct === false) parts.push('不在私聊')
  return parts.length ? parts.join('，') : undefined
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
