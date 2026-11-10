import React, { useEffect, useRef, useSyncExternalStore } from 'react'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import {
  SchemaSettings, SelectInput, usePluginContext, usePlugins, type PluginConfigState, type PluginEntryStatus, type WebUIContext, type WebUIPlugin,
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
  defaultAuthority: 'everyone' | 'admin' | 'owner'
  owner?: string
  conflicts: { name: string; with?: string }[]
}

interface CommandsConfig {
  prefixes: string[]
  bare: boolean
  owners: string[]
  permissions?: { owner: string; command: string; authority: CommandInfo['authority'] }[]
  aliases?: { owner: string; command: string; aliases: string[] }[]
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

const AliasEditor: React.FC<{ command: CommandInfo; config: PluginConfigState<CommandsConfig> }> = ({ command, config }) => {
  const container = useRef<HTMLFieldSetElement>(null)
  const settings = config.value?.aliases ?? []
  const owner = command.owner ?? ''
  const settingIndex = settings.findIndex(setting => setting.owner === owner && setting.command === command.name)
  const aliases = settings[settingIndex]?.aliases ?? []
  const errorPath = 'aliases.' + settingIndex
  const errors = [...new Set(Object.entries(config.errors)
    .filter(([path]) => path === errorPath || path.startsWith(errorPath + '.'))
    .map(([, message]) => message))]

  const change = (aliases: string[]) => {
    if (!config.value) return
    const next = [...settings]
    if (settingIndex >= 0) {
      if (aliases.length) next[settingIndex] = { owner, command: command.name, aliases }
      else next.splice(settingIndex, 1)
    } else if (aliases.length) {
      next.push({ owner, command: command.name, aliases })
    }
    config.setValue({ ...config.value, aliases: next })
  }

  return (
    <fieldset ref={container} disabled={config.saving} className="min-w-52 space-y-2 disabled:opacity-60">
      {aliases.map((alias, index) => (
        <div key={index} className="flex items-center gap-1">
          <input
            value={alias}
            onChange={event => change(aliases.map((value, i) => i === index ? event.target.value : value))}
            aria-label={command.name + ' 的别名 ' + (index + 1)}
            aria-invalid={!!config.errors[errorPath + '.aliases.' + index]}
            placeholder="填写别名，不含前缀"
            className="input-field min-w-0 w-full text-sm"
          />
          <button
            type="button"
            onClick={() => change(aliases.filter((_, i) => i !== index))}
            aria-label={'删除 ' + command.name + ' 的别名 ' + (index + 1)}
            title="删除别名"
            className="p-1.5 shrink-0 text-theme-muted hover:text-red-500 rounded-lg hover:bg-theme-item transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          change([...aliases, ''])
          requestAnimationFrame(() => container.current?.querySelectorAll('input')[aliases.length]?.focus())
        }}
        aria-label={'为 ' + command.name + ' 添加别名'}
        className="btn-glass inline-flex items-center gap-1 px-2 py-1 text-xs text-theme-secondary"
      >
        <Plus size={14} />添加别名
      </button>
      {errors.map(error => <p key={error} className="text-xs text-red-500" role="alert">{error}</p>)}
    </fieldset>
  )
}

const AuthorityEditor: React.FC<{ command: CommandInfo; config: PluginConfigState<CommandsConfig> }> = ({ command, config }) => {
  const settings = config.value?.permissions ?? []
  const owner = command.owner ?? ''
  const matches = (setting: NonNullable<CommandsConfig['permissions']>[number]) =>
    setting.owner === owner && setting.command.toLowerCase() === command.name.toLowerCase()
  const selected = settings.find(matches)?.authority ?? ''
  const fallback = command.defaultAuthority ?? command.authority
  const change = (authority: CommandInfo['authority'] | '') => {
    if (!config.value) return
    const permissions = settings.filter(setting => !matches(setting))
    if (authority) permissions.push({ owner, command: command.name, authority })
    config.setValue({ ...config.value, permissions })
  }
  return (
    <div className="min-w-40 space-y-1">
      <SelectInput<CommandInfo['authority'] | ''>
        value={selected}
        options={[
          { value: '', label: '默认（' + AUTHORITY[fallback] + '）' },
          { value: 'everyone', label: AUTHORITY.everyone },
          { value: 'admin', label: AUTHORITY.admin },
          { value: 'owner', label: AUTHORITY.owner },
        ]}
        onChange={change}
        disabled={config.saving || !config.value}
        className="w-full text-sm"
      />
      {(selected || fallback) !== command.authority && (
        <p className="text-xs text-theme-muted">未保存，当前：{AUTHORITY[command.authority]}</p>
      )}
    </div>
  )
}

const CommandTable: React.FC<{ config: PluginConfigState<CommandsConfig> }> = ({ config }) => {
  const commands = useCommands()
  const titleOf = usePluginTitle()
  const wasSaving = useRef(false)
  useEffect(() => {
    if (wasSaving.current && !config.saving) refresh()
    wasSaving.current = config.saving
  }, [config.saving])
  if (!commands) return <div className="text-sm text-theme-muted">正在读取指令…</div>
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-theme">现在有的指令（{commands.length}）</div>
      <p className="text-xs text-theme-muted">在“谁能用”中设置每条指令的权限，保存后立即生效；原名和所有别名共用该权限。选择“默认”可恢复插件的默认权限。</p>
      {config.errors.permissions && <p className="text-sm text-red-500" role="alert">{config.errors.permissions}</p>}
      <p className="text-xs text-theme-muted">每条指令可添加多个别名，填写别名本身，不含指令前缀。保存后立即生效，原指令名和插件提供的别名仍可使用。</p>
      {config.errors.aliases && <p className="text-sm text-red-500" role="alert">{config.errors.aliases}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="text-left text-theme-muted">
              <th className="py-1.5 pr-3 font-normal">指令</th>
              <th className="py-1.5 pr-3 font-normal">说明</th>
              <th className="py-1.5 pr-3 font-normal">插件</th>
              <th className="py-1.5 pr-3 font-normal">自定义别名</th>
              <th className="py-1.5 font-normal">谁能用</th>
            </tr>
          </thead>
          <tbody>
            {commands.map(command => (
              <tr key={`${command.owner ?? ''}\n${command.name}`} className="border-t border-black/5 dark:border-white/10 align-top">
                <td className="py-1.5 pr-3">
                  <div className="font-mono text-theme">{command.syntax}</div>
                  {command.aliases.length > 0 && <div className="text-xs text-theme-muted">已生效别名：{command.aliases.join('、')}</div>}
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
                <td className="py-1.5 pr-3"><AliasEditor command={command} config={config} /></td>
                <td className="py-1.5 text-theme-secondary"><AuthorityEditor command={command} config={config} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const CommandsSettings = () => (
  <SchemaSettings fields={['prefixes', 'bare', 'owners']}>
    {(config: PluginConfigState<CommandsConfig>) => <CommandTable config={config} />}
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
