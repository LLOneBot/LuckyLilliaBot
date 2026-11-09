import React, { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react'
import { usePluginList } from '../../plugin-host/pluginList'
import { contributionKey, contributionLabel, useRegistry } from '../../plugin-host/registry'
import { configurableSlots, layoutContributions, slotLayoutPatch } from '../../plugin-host/slotLayout'
import type { PluginStatus, UiPrefs, UiPrefsPatch } from '../../types/plugins'
import { iconByName, pluginTitle } from './meta'

interface Draft {
  order: string[]
  hidden: Set<string>
  reset: boolean
}

// Keep a user's draft as contributors appear and disappear while the dialog is open.
function follow(order: string[], current: string[]) {
  const result = order.filter(key => current.includes(key))
  current.forEach((key, index) => {
    if (!result.includes(key)) result.splice(index ? result.indexOf(current[index - 1]) + 1 : 0, 0, key)
  })
  return result
}

const withoutSlot = (prefs: UiPrefs, name: string): UiPrefs => ({
  ...prefs,
  hidden: prefs.hidden.filter(key => key.split('|')[1] !== name),
  order: Object.fromEntries(Object.entries(prefs.order).filter(([key]) => key.split('|')[1] !== name)),
})

/** The plugin dialog owns the save; editing card layout never restarts a plugin. */
export function useSlotLayoutSettings(owner: string, plugins: PluginStatus[]) {
  const contributions = useRegistry(state => state.contributions)
  const prefs = usePluginList(state => state.prefs)
  const slots = useMemo(() => configurableSlots(contributions, owner), [contributions, owner])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const sections = slots.map(slot => {
    const current = layoutContributions(contributions, plugins, slot.name, prefs)
    const defaults = layoutContributions(contributions, plugins, slot.name, withoutSlot(prefs, slot.name))
    const byKey = new Map(current.map(row => [contributionKey(row), row]))
    const draft = drafts[slot.name]
    const shown: Draft = draft
      ? { ...draft, order: follow(draft.order, current.map(contributionKey)) }
      : { order: current.map(contributionKey), hidden: new Set(prefs.hidden), reset: false }
    const rows = shown.order.map(key => byKey.get(key)!).filter(Boolean)
    const patch = slotLayoutPatch(slot.name, rows, shown.hidden, prefs, shown.reset)
    const atDefault = shown.order.join('\n') === defaults.map(contributionKey).join('\n')
      && !rows.some(row => shown.hidden.has(contributionKey(row)))
      && (shown.reset || (!prefs.hidden.some(key => key.split('|')[1] === slot.name)
        && !Object.keys(prefs.order).some(key => key.split('|')[1] === slot.name)))
    return { slot, rows, shown, defaults, patch, atDefault }
  })
  const patch: UiPrefsPatch = {}
  for (const section of sections) {
    if (section.patch.hide?.length) patch.hide = [...(patch.hide ?? []), ...section.patch.hide]
    if (section.patch.show?.length) patch.show = [...(patch.show ?? []), ...section.patch.show]
    if (section.patch.order) patch.order = { ...patch.order, ...section.patch.order }
  }
  const move = (name: string, from: number, to: number) => {
    const section = sections.find(section => section.slot.name === name)
    if (!section || to < 0 || to >= section.rows.length || from === to) return
    const order = [...section.shown.order]
    const [key] = order.splice(from, 1)
    order.splice(to, 0, key)
    setDrafts(previous => ({ ...previous, [name]: { ...section.shown, order } }))
  }
  const toggle = (name: string, key: string, visible: boolean) => {
    const section = sections.find(section => section.slot.name === name)!
    const hidden = new Set(section.shown.hidden)
    if (visible) hidden.delete(key)
    else hidden.add(key)
    setDrafts(previous => ({ ...previous, [name]: { ...section.shown, hidden } }))
  }
  const reset = (name: string) => {
    const section = sections.find(section => section.slot.name === name)!
    setDrafts(previous => ({ ...previous, [name]: { order: section.defaults.map(contributionKey), hidden: new Set(), reset: true } }))
  }
  return { sections, patch, changed: Object.keys(patch).length > 0, move, toggle, reset }
}

const arrow = 'p-1.5 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none'

const SlotLayoutSettings: React.FC<{
  layout: ReturnType<typeof useSlotLayoutSettings>
  plugins: PluginStatus[]
  saving: boolean
}> = ({ layout, plugins, saving }) => {
  const [dragging, setDragging] = useState<{ slot: string; key: string } | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const endDrag = () => { setDragging(null); setTarget(null) }
  return <>
    {layout.sections.map(({ slot, rows, shown, atDefault }) => (
      <section key={slot.name} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-theme">{slot.title}</h4>
          <button type="button" onClick={() => layout.reset(slot.name)} disabled={saving || atDefault}
            className="inline-flex items-center gap-1.5 text-xs text-theme-secondary hover:text-theme disabled:opacity-40 disabled:pointer-events-none">
            <RotateCcw size={14} />恢复默认
          </button>
        </div>
        <p className="text-xs text-theme-muted">拖动左侧把手或使用箭头调整顺序，关闭开关可隐藏卡片。保存后生效。</p>
        <div role="list" aria-label={slot.title} className="fill-quiet r-card p-1.5">
          {rows.map((row, index) => {
            const key = contributionKey(row)
            const label = contributionLabel(row)
            const hidden = shown.hidden.has(key)
            const plugin = plugins.find(plugin => plugin.name === row.owner)
            const provider = plugin ? pluginTitle(plugin) : row.owner
            const Icon = iconByName(typeof row.options.icon === 'string' ? row.options.icon : plugin?.manifest.icon)
            return (
              <div key={key} role="listitem" data-slot-card={key}
                onDragOver={event => {
                  if (saving || dragging?.slot !== slot.name) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setTarget(key)
                }}
                onDrop={event => {
                  if (saving || dragging?.slot !== slot.name) return
                  event.preventDefault()
                  const from = rows.findIndex(item => contributionKey(item) === dragging.key)
                  if (from >= 0) layout.move(slot.name, from, index)
                  endDrag()
                }}
                className={'flex items-center gap-2 px-2 py-2.5 r-control transition-colors ' + (target === key ? 'bg-pink-500/10 ring-1 ring-pink-400/50' : '')}>
                <span draggable={!saving} title="拖动调整顺序" aria-hidden="true"
                  onDragStart={event => {
                    event.dataTransfer.setData('text/plain', key)
                    event.dataTransfer.effectAllowed = 'move'
                    setDragging({ slot: slot.name, key })
                  }}
                  onDragEnd={endDrag}
                  className="shrink-0 p-1 text-theme-hint cursor-grab active:cursor-grabbing">
                  <GripVertical size={16} />
                </span>
                <Icon size={18} className={'shrink-0 text-theme-secondary ' + (hidden ? 'opacity-50' : '')} />
                <div className={'flex-1 min-w-0 ' + (hidden ? 'opacity-50' : '')}>
                  <p className="text-sm font-medium text-theme truncate" title={label}>{label}</p>
                  <p className="text-xs text-theme-hint truncate">{provider}{plugin?.state !== 'active' ? ' · 未运行' : ''}</p>
                </div>
                <div className="flex items-center shrink-0">
                  <button type="button" title="上移" aria-label={`把「${label}」上移`} disabled={saving || index === 0}
                    onClick={() => layout.move(slot.name, index, index - 1)} className={arrow}><ArrowUp size={16} /></button>
                  <button type="button" title="下移" aria-label={`把「${label}」下移`} disabled={saving || index === rows.length - 1}
                    onClick={() => layout.move(slot.name, index, index + 1)} className={arrow}><ArrowDown size={16} /></button>
                </div>
                <input type="checkbox" className="switch-toggle shrink-0" checked={!hidden} disabled={saving}
                  aria-label={`显示「${label}」`} onChange={event => layout.toggle(slot.name, key, event.target.checked)} />
              </div>
            )
          })}
          {!rows.length && <p className="py-6 text-center text-sm text-theme-muted">暂无可设置的卡片</p>}
        </div>
        <p className="text-xs text-theme-muted">卡片会随提供它的插件启停；部分卡片仅在账号登录或相关数据可用时显示。</p>
      </section>
    ))}
  </>
}

export default SlotLayoutSettings
