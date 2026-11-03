import React, { useSyncExternalStore } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  SchemaSettings, usePluginContext, usePlugins, type PluginEntryStatus, type WebUIContext, type WebUIPlugin,
} from '@luckylillia/plugin-sdk/webui'

export const name = 'builtin:commands'

// The SDK's CommandInfo, as /api/commands sends it
interface CommandInfo {
  name: string
  aliases: string[]
  description: string
  syntax: string
  hidden: boolean
  authority: 'everyone' | 'admin' | 'owner'
  owner?: string
  conflicts: { name: string; with?: string }[]
}

const AUTHORITY: Record<CommandInfo['authority'], string> = { everyone: '所有人', admin: '群管理员', owner: '主人' }

// One poll for the page and every card, as long as one of them is on screen
const store = {
  ctx: undefined as WebUIContext | undefined,
  data: null as CommandInfo[] | null,
  listeners: new Set<() => void>(),
  stop: undefined as (() => void) | undefined,
}

function refresh() {
  store.ctx?.api<CommandInfo[]>('/api/commands').then((data) => {
    store.data = data
    for (const listener of store.listeners) listener()
  }, () => {})
}

function subscribe(listener: () => void) {
  store.listeners.add(listener)
  if (store.listeners.size === 1) {
    refresh()
    const timer = setInterval(refresh, 10_000)
    store.stop = () => clearInterval(timer)
  }
  return () => {
    store.listeners.delete(listener)
    if (!store.listeners.size) store.stop?.()
  }
}

const useCommands = () => useSyncExternalStore(subscribe, () => store.data)

function usePluginTitle() {
  const plugins = usePlugins()
  return (id?: string) => {
    if (!id) return 'Bot 自带'
    const plugin = plugins?.find(plugin => plugin.id === id)
    // As the plugin page names a package
    return plugin?.title ?? plugin?.name.replace(/^(@[^/]+\/)?luckylillia-plugin-/, '') ?? id
  }
}

const CommandTable: React.FC = () => {
  const commands = useCommands()
  const titleOf = usePluginTitle()
  if (!commands) return <div className="text-sm text-theme-muted">正在读取指令…</div>
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-theme">现在有的指令（{commands.length}）</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-theme-muted">
              <th className="py-1.5 pr-3 font-normal">指令</th>
              <th className="py-1.5 pr-3 font-normal">说明</th>
              <th className="py-1.5 pr-3 font-normal">插件</th>
              <th className="py-1.5 font-normal">谁能用</th>
            </tr>
          </thead>
          <tbody>
            {commands.map(command => (
              <tr key={`${command.owner ?? ''}\n${command.name}`} className="border-t border-black/5 dark:border-white/10 align-top">
                <td className="py-1.5 pr-3">
                  <div className="font-mono text-theme">{command.syntax}</div>
                  {command.aliases.length > 0 && <div className="text-xs text-theme-muted">别名：{command.aliases.join('、')}</div>}
                  {command.hidden && <div className="text-xs text-theme-hint">不在指令菜单里</div>}
                  {command.conflicts.map(conflict => (
                    <div key={`${conflict.name}\n${conflict.with ?? ''}`} className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle size={12} className="flex-shrink-0" />
                      「{conflict.name}」和「{titleOf(conflict.with)}」的重名，两个插件都收到的消息由先注册的处理
                    </div>
                  ))}
                </td>
                <td className="py-1.5 pr-3 text-theme-secondary">{command.description}</td>
                <td className="py-1.5 pr-3 text-theme-secondary">{titleOf(command.owner)}</td>
                <td className="py-1.5 text-theme-secondary">{AUTHORITY[command.authority]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const CommandsSettings = () => (
  <SchemaSettings>
    <CommandTable />
  </SchemaSettings>
)

const ConflictBadge: React.FC<{ plugin: PluginEntryStatus }> = ({ plugin }) => {
  const ctx = usePluginContext()
  const commands = useCommands()
  const clashing = commands?.filter(command => command.owner === plugin.id && command.conflicts.length) ?? []
  if (!clashing.length) return null
  return (
    <a
      href={ctx.pageHref('commands')}
      title={`和别的插件重名的指令：${clashing.map(command => command.name).join('、')}`}
      className="btn-glass flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
    >
      <AlertTriangle size={14} />
      指令重名
    </a>
  )
}

const apply: WebUIPlugin = (ctx) => {
  store.ctx = ctx
  ctx.page({ id: 'commands', title: '指令', icon: 'terminal', component: CommandsSettings, order: 35, settings: true })
  ctx.slot('plugins.card.actions', { id: 'command-conflicts', label: '指令重名提示', component: ConflictBadge })
}

export default apply
