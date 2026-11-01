import React, { useEffect, useState } from 'react'
import { useBots } from '../../stores/botsStore'
import { EntryScope, IdFilter } from '../../types/plugins'
import { PLATFORM_LABEL } from './meta'

interface ScopeEditorProps {
  value: EntryScope | undefined
  onChange: (scope: EntryScope | undefined) => void
}

type FilterMode = 'all' | IdFilter['mode']

const MODES: { value: FilterMode; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'allow', label: '只在这些' },
  { value: 'deny', label: '除了这些' },
]

/** Drops what lets everything through, as the bot does; undefined when nothing is left. For saving the draft. */
export function cleanScope(scope: EntryScope | undefined): EntryScope | undefined {
  if (!scope) return
  const result: EntryScope = {}
  if (scope.platforms?.length) result.platforms = scope.platforms
  if (scope.bots?.length) result.bots = scope.bots
  if (scope.guilds && (scope.guilds.mode === 'allow' || scope.guilds.ids.length)) result.guilds = scope.guilds
  if (scope.users && (scope.users.mode === 'allow' || scope.users.ids.length)) result.users = scope.users
  if (scope.direct === false) result.direct = false
  return Object.keys(result).length ? result : undefined
}

const toggled = (list: string[] | undefined, item: string, on: boolean) => {
  const rest = (list ?? []).filter(other => other !== item)
  return on ? [...rest, item] : rest
}

const FilterInput: React.FC<{ label: string; hint: string; value: IdFilter | undefined; onChange(value: IdFilter | undefined): void }> = ({ label, hint, value, onChange }) => {
  const mode: FilterMode = value?.mode ?? 'all'
  // Kept as typed, blanks and all, while the ids follow it
  const [text, setText] = useState(value?.ids.join('\n') ?? '')
  useEffect(() => {
    if (!value) setText('')
  }, [value])
  const ids = (raw: string) => raw.split(/[\s,，]+/).map(id => id.trim()).filter(Boolean)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-theme w-12 flex-shrink-0">{label}</span>
        <div className="flex gap-1">
          {MODES.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value === 'all' ? undefined : { mode: option.value, ids: ids(text) })}
              className={`px-3 py-1 rounded-full text-xs transition-colors ${mode === option.value ? 'gradient-primary text-white' : 'bg-theme-item text-theme-secondary hover:text-theme'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {mode !== 'all' && (
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            onChange({ mode: mode as IdFilter['mode'], ids: ids(e.target.value) })
          }}
          rows={3}
          placeholder={hint}
          className="input-field font-mono text-sm"
        />
      )}
    </div>
  )
}

/**
 * Where a plugin takes messages and events from, as a draft: an empty "all but these" stays while its ids are typed.
 * Save it through cleanScope().
 */
const ScopeEditor: React.FC<ScopeEditorProps> = ({ value, onChange }) => {
  const bots = useBots(state => state.bots) ?? []
  const scope = value ?? {}
  const set = (patch: Partial<EntryScope>) => onChange({ ...scope, ...patch })
  const platforms = [...new Set(['luckylillia', 'qq', ...bots.map(bot => bot.platform), ...scope.platforms ?? []])]
  const accounts = [...new Set([...bots.map(bot => bot.sid), ...scope.bots ?? []])]
  const chip = (on: boolean) => `px-3 py-1 rounded-full text-xs transition-colors ${on ? 'gradient-primary text-white' : 'bg-theme-item text-theme-secondary hover:text-theme'}`

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <span className="text-sm text-theme w-12 flex-shrink-0 pt-1">平台</span>
        <div className="flex gap-1 flex-wrap flex-1">
          {platforms.map(platform => (
            <button key={platform} type="button" className={chip(!!scope.platforms?.includes(platform))}
              onClick={() => set({ platforms: toggled(scope.platforms, platform, !scope.platforms?.includes(platform)) })}>
              {PLATFORM_LABEL[platform] ?? platform}
            </button>
          ))}
          <span className="text-xs text-theme-hint self-center ml-1">都不选就是全部平台</span>
        </div>
      </div>
      {accounts.length > 1 && (
        <div className="flex items-start gap-3 flex-wrap">
          <span className="text-sm text-theme w-12 flex-shrink-0 pt-1">账号</span>
          <div className="flex gap-1 flex-wrap flex-1">
            {accounts.map(sid => {
              const bot = bots.find(other => other.sid === sid)
              return (
                <button key={sid} type="button" className={chip(!!scope.bots?.includes(sid))}
                  onClick={() => set({ bots: toggled(scope.bots, sid, !scope.bots?.includes(sid)) })}>
                  {bot?.name ? `${bot.name}（${bot.selfId}）` : sid}
                </button>
              )
            })}
            <span className="text-xs text-theme-hint self-center ml-1">都不选就是所有账号</span>
          </div>
        </div>
      )}
      <FilterInput label="群" hint="群号（官方机器人是群的 openid），一行一个或用逗号分开；只对一个平台算时写成 平台:群号" value={scope.guilds} onChange={guilds => set({ guilds })} />
      <FilterInput label="用户" hint="QQ 号（官方机器人是用户的 openid），一行一个或用逗号分开" value={scope.users} onChange={users => set({ users })} />
      <label className="flex items-center gap-3 cursor-pointer">
        <span className="text-sm text-theme w-12 flex-shrink-0">私聊</span>
        <input type="checkbox" className="switch-toggle" checked={scope.direct !== false} onChange={e => set({ direct: e.target.checked ? undefined : false })} />
        <span className="text-xs text-theme-hint">关掉后私聊消息不交给它</span>
      </label>
    </div>
  )
}

export default ScopeEditor
