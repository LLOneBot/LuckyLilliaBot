import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Save } from 'lucide-react'
import type {
  BotInfo, DurationInputProps, PageView, PathInputProps, PluginConfigState, PluginEntryStatus, SchemaFormProps,
  SchemaSettingsProps, SelectInputProps, SlotMap, SlotProps, StatusNoticeProps,
} from '@luckylillia/plugin-sdk/webui'
import { HostSelector } from '../components/common/HostSelector'
import { PathPicker } from '../components/common/PathPicker'
import { DurationPicker } from '../components/common/DurationPicker'
import { Select } from '../components/common/Select'
import { showToast } from '../components/common/Toast'
import { iconByName, pluginDescription, pluginTitle } from '../components/plugins/meta'
import PluginIcon from '../components/plugins/PluginIcon'
import { hydrate, SchemaNode } from '../components/plugins/schema/model'
import { SecretClearContext } from '../components/plugins/schema/inputs'
import { SchemaField } from '../components/plugins/schema/SchemaField'
import type { PluginStatus } from '../types/plugins'
import { ConfigConflictError, ConfigRejectedError, describePlugin, savePluginConfig } from '../utils/pluginApi'
import { useBots as useBotsStore } from '../stores/botsStore'
import { useLayout } from '../stores/layoutStore'
import { usePluginContext } from './context'
import { usePluginList } from './pluginList'
import { PageNotice, PageViewContext, SlotOutlet, useSlotMatches } from './views'

// The runtime side of `@luckylillia/plugin-sdk/webui`: what third-party modules get through the import map and
// builtin ones through the alias in vite.config.ts. Keep its exports in step with sdkExports.ts.

export { usePluginContext, useSlotMatches, PluginIcon }
export { Lightbox } from '../components/common/Lightbox'
export { PluginMetaRow } from '../components/plugins/PluginMetaRow'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function useEntry(): PluginStatus | undefined {
  const { name } = usePluginContext().plugin
  return usePluginList(state => state.plugins?.find(plugin => plugin.name === name))
}

export const usePluginStatus: () => PluginEntryStatus | undefined = useEntry

export function usePluginConfig<T = any>(): PluginConfigState<T> {
  const id = usePluginStatus()?.id
  const [value, setValue] = useState<T | null>(null)
  const [schema, setSchema] = useState<unknown>(null)
  const [rev, setRev] = useState<string>()
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const cleared = useRef(new Set<string>())

  const load = useCallback(async () => {
    if (!id) return
    try {
      const description = await describePlugin(id)
      setValue(description.effective as T)
      setSchema(description.schema)
      setRev(description.rev)
      setError('')
      cleared.current.clear()
    } catch (e) {
      setError(errorText(e))
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(async (next?: T, options: { message?: string } = {}) => {
    if (!id) return false
    setSaving(true)
    setErrors({})
    try {
      await savePluginConfig(id, next ?? value, { ifRev: rev, clear: [...cleared.current] })
      showToast(options.message ?? '配置已保存', 'success')
      await load()
      return true
    } catch (e) {
      if (e instanceof ConfigRejectedError) {
        setErrors(Object.fromEntries(e.issues.map(issue => [issue.path.join('.'), issue.message])))
        showToast(e.issues[0]?.message ?? e.message, 'error')
      } else if (e instanceof ConfigConflictError) {
        await load()
        showToast('配置在别处被改过，已重新载入最新值', 'error')
      } else {
        showToast(errorText(e) || '保存失败', 'error')
      }
      return false
    } finally {
      setSaving(false)
    }
  }, [id, rev, value, load])

  const clearSecret = useCallback((path: string) => {
    cleared.current.add(path)
  }, [])

  return { value, setValue, schema, error, errors, saving, save, clearSecret }
}

function pick(schema: SchemaNode, keys: string[]): SchemaNode {
  const dict = Object.fromEntries(keys.filter(key => schema.dict?.[key]).map(key => [key, schema.dict![key]]))
  return { type: 'object', meta: {}, dict }
}

export const SchemaForm: React.FC<SchemaFormProps> = ({ schema, value, onChange, errors = {}, fields, onClearSecret }) => {
  const root = useMemo(() => (schema ? hydrate(schema as Parameters<typeof hydrate>[0]) : null), [schema])
  const keys = fields?.join('\n')
  const node = useMemo(() => (root && keys !== undefined ? pick(root, keys.split('\n')) : root), [root, keys])
  if (!node) return null
  return (
    <SecretClearContext.Provider value={onClearSecret}>
      {errors[''] && <p className="text-sm text-red-500 mb-4">{errors['']}</p>}
      <SchemaField node={node} value={value} onChange={onChange} path={[]} errors={errors} depth={0} />
    </SecretClearContext.Provider>
  )
}

const Section: React.FC<{ title: string; description?: string; collapsed?: boolean; children: React.ReactNode }> = ({ title, description, collapsed, children }) => {
  const [open, setOpen] = useState(!collapsed)
  return (
    <div className="rounded-xl border border-theme-divider">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-theme-secondary">
        {open ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />}
        <span className="min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-left">
          <span>{title}</span>
          {description && <span className="text-xs font-normal text-theme-muted">{description}</span>}
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

export const SchemaSettings: React.FC<SchemaSettingsProps> = ({ fields, sections, links, children }) => {
  const plugin = useEntry()
  const config = usePluginConfig()
  const description = plugin && pluginDescription(plugin)
  const extra = typeof children === 'function' ? (children as (config: PluginConfigState) => React.ReactNode)(config) : children as React.ReactNode
  const ungrouped = useMemo(() => {
    if (!sections?.length) return fields
    const grouped = new Set(sections.flatMap(section => section.fields))
    const all = fields ?? Object.keys(config.schema ? hydrate(config.schema as Parameters<typeof hydrate>[0]).dict ?? {} : {})
    return all.filter(key => !grouped.has(key))
  }, [fields, sections, config.schema])
  const form = (keys?: string[]) => (
    <SchemaForm
      schema={config.schema}
      value={config.value}
      onChange={config.setValue}
      errors={config.errors}
      fields={keys}
      onClearSecret={config.clearSecret}
    />
  )

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-6">
        {plugin
          ? <PluginIcon plugin={plugin} className="w-12 h-12 rounded-xl" fill="gradient-primary-br text-white" size={24} />
          : <div className="w-12 h-12 rounded-xl gradient-primary-br flex-shrink-0" />}
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-theme">{plugin ? pluginTitle(plugin) : ''}</h3>
          {description && <p className="text-sm text-theme-secondary">{description}</p>}
        </div>
        <div className="flex-1" />
        {links?.map(link => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-lg transition-colors flex-shrink-0"
          >
            <ExternalLink size={16} />
            {link.label}
          </a>
        ))}
      </div>

      {config.error ? (
        <p className="text-sm text-red-500">加载配置失败：{config.error}</p>
      ) : config.value === null ? (
        <div className="flex justify-center py-10"><Loader2 size={32} className="animate-spin text-pink-500" /></div>
      ) : (
        <>
          {form(ungrouped)}
          {sections?.map(section => (
            <div key={section.title} className="mt-5">
              <Section title={section.title} description={section.description} collapsed={section.collapsed}>{form(section.fields)}</Section>
            </div>
          ))}
          {extra !== undefined && extra !== null && <div className="mt-6">{extra}</div>}
          <div className="mt-6 flex justify-end">
            <button onClick={() => config.save()} disabled={config.saving} className="btn-primary flex items-center gap-2">
              {config.saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              {config.saving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export const HostInput: React.FC<{ value: string; onChange(value: string): void }> = HostSelector

export const PathInput: React.FC<PathInputProps> = PathPicker

export const DurationInput: React.FC<DurationInputProps> = DurationPicker

export const SelectInput: <T = string>(props: SelectInputProps<T>) => React.ReactNode = Select

export function usePlugins(): PluginEntryStatus[] | null {
  return usePluginList(state => state.plugins)
}

export function useBots(): BotInfo[] | null {
  return useBotsStore(state => state.bots)
}

export function usePageView(): PageView {
  return useContext(PageViewContext)
}

export function useSidebar(): { collapsed: boolean; setCollapsed(collapsed: boolean): void } {
  const collapsed = useLayout(state => state.sidebarCollapsed)
  const setCollapsed = useLayout(state => state.setSidebarCollapsed)
  return { collapsed, setCollapsed }
}

export const StatusNotice: React.FC<StatusNoticeProps> = ({ children, action, page }) => {
  const ctx = usePluginContext()
  const href = page === undefined ? undefined : ctx.pageHref(page)
  const activeTab = useLayout(state => state.activeTab)
  const button = action && href && href.slice(1) !== activeTab
    ? { label: action, onClick: () => { window.location.hash = href } }
    : undefined
  return <PageNotice action={button}>{children as React.ReactNode}</PageNotice>
}

export function Slot({ name, props, match, children, wrap }: SlotProps<keyof SlotMap>) {
  return (
    <SlotOutlet
      name={name}
      props={props as Record<string, unknown> | undefined}
      match={match}
      wrap={wrap && ((element, c) => wrap(element, { id: c.id, plugin: c.owner, options: c.options }) as React.ReactNode)}
    >
      {children as React.ReactNode}
    </SlotOutlet>
  )
}

export const Icon: React.FC<{ name?: string; size?: number; className?: string }> = ({ name, size, className }) => {
  const Glyph = iconByName(name)
  return <Glyph size={size} className={className} />
}
