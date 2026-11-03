import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Loader2, Lock, PanelLeft, RotateCcw, Save, X } from 'lucide-react'
import { Portal, showToast } from '../common'
import { usePluginList } from '../../plugin-host/pluginList'
import { isPageKey, pageContributionKey, sidebarPatch, useRegistry, visiblePages, WEBUI } from '../../plugin-host/registry'
import { UiPrefs } from '../../types/plugins'
import { patchUiPrefs } from '../../utils/pluginApi'
import { iconByName, pluginTitle } from '../plugins/meta'

interface Draft {
  /** Page keys in the order the user put them */
  order: string[]
  hidden: Set<string>
  /** 恢复默认 was pressed: saving drops every stored page position and hiding */
  reset: boolean
}

/** What the rows show while one is dragged */
interface Drag {
  from: number
  /** Where it goes if dropped now */
  to: number
  /** How far the dragged row is from its place, px */
  offset: number
  /** How far the rows it passes move to make room */
  step: number
}

interface DragSession {
  pointerId: number
  key: string
  from: number
  /** Measured from the top of the list, which moves when the dialog scrolls */
  startY: number
  tops: number[]
  heights: number[]
  /** Past the threshold: a press that never gets there is a click */
  started: boolean
  clientY: number
  scroll?: { timer: number; speed: number; tick: number; carry: number }
}

const DRAG_THRESHOLD = 4
/** This close to the top or bottom of the dialog's scrolling body, a drag scrolls it, faster the closer */
const SCROLL_EDGE = 48
const SCROLL_SPEED = 900

/** The order kept in step with pages appearing or going while the dialog is open: a new one goes after its neighbor */
function follow(order: string[], current: string[]): string[] {
  const result = order.filter(key => current.includes(key))
  current.forEach((key, i) => {
    if (!result.includes(key)) result.splice(i > 0 ? result.indexOf(current[i - 1]) + 1 : 0, 0, key)
  })
  return result
}

const withoutPageKeys = (prefs: UiPrefs): UiPrefs => ({
  ...prefs,
  hidden: prefs.hidden.filter(key => !isPageKey(key)),
  order: Object.fromEntries(Object.entries(prefs.order).filter(([key]) => !isPageKey(key))),
})

const arrow = 'p-1.5 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none'

/**
 * Which pages the sidebar lists and in what order: the pages of enabled plugins and the core ones, hidden ones
 * included. Edited as a draft and saved at once into plugins.json `ui` (sidebarPatch), so for every browser.
 */
const SidebarDialog: React.FC<{ onClose(): void }> = ({ onClose }) => {
  const contributions = useRegistry(state => state.contributions)
  const plugins = usePluginList(state => state.plugins)
  const prefs = usePluginList(state => state.prefs)
  const pages = useMemo(() => visiblePages(contributions, plugins, 'arrange', prefs), [contributions, plugins, prefs])
  const defaults = useMemo(() => visiblePages(contributions, plugins, 'arrange', withoutPageKeys(prefs)), [contributions, plugins, prefs])
  const byKey = useMemo(() => new Map(pages.map(page => [pageContributionKey(page), page])), [pages])
  const titles = useMemo(() => new Map((plugins ?? []).map(plugin => [plugin.name, pluginTitle(plugin)])), [plugins])
  // Untouched, it follows what is stored; changed by another tab meanwhile, it shows that
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [drag, setDragState] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const session = useRef<DragSession | null>(null)
  const focusAfterMove = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const current = pages.map(pageContributionKey)
  const shown: Draft = draft
    ? { ...draft, order: follow(draft.order, current) }
    : { order: current, hidden: new Set(prefs.hidden.filter(isPageKey)), reset: false }
  const rows = shown.order.map(key => byKey.get(key)!).filter(Boolean)
  const patch = sidebarPatch(rows, shown.hidden, prefs, shown.reset)
  const changed = Object.keys(patch).length > 0
  const atDefault = shown.order.join('\n') === defaults.map(pageContributionKey).join('\n')
    && !rows.some(page => shown.hidden.has(pageContributionKey(page)))
    && (shown.reset || (!Object.keys(prefs.order).some(isPageKey) && !prefs.hidden.some(isPageKey)))

  const move = (index: number, delta: -1 | 1) => {
    const order = [...shown.order]
    ;[order[index], order[index + delta]] = [order[index + delta], order[index]]
    focusAfterMove.current = `${order[index + delta]}:${delta}`
    setDraft({ ...shown, order })
  }
  const toggle = (key: string, visible: boolean) => {
    const hidden = new Set(shown.hidden)
    if (visible) hidden.delete(key)
    else hidden.add(key)
    setDraft({ ...shown, hidden })
  }
  const reset = () => setDraft({ order: defaults.map(pageContributionKey), hidden: new Set(), reset: true })

  const save = async () => {
    if (!changed) return onClose()
    setSaving(true)
    try {
      usePluginList.setState({ prefs: await patchUiPrefs(patch) })
      showToast('侧边栏已保存', 'success')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Dragging. Everything it reads goes through refs, so the scroll timer can call into an older render's copy.
  // The order changes on release only; until then the row follows the pointer and the others move aside.
  const setDrag = (next: Drag | null) => {
    dragRef.current = next
    setDragState(next)
  }
  const stopScrolling = () => {
    const s = session.current
    if (!s?.scroll) return
    window.clearInterval(s.scroll.timer)
    s.scroll = undefined
  }
  const scrollNearEdge = (clientY: number) => {
    const s = session.current
    const box = scrollRef.current
    if (!s || !box) return
    const rect = box.getBoundingClientRect()
    const depth = clientY < rect.top + SCROLL_EDGE ? clientY - rect.top - SCROLL_EDGE
      : clientY > rect.bottom - SCROLL_EDGE ? clientY - rect.bottom + SCROLL_EDGE : 0
    if (!depth) return stopScrolling()
    const speed = SCROLL_SPEED * Math.max(-1, Math.min(1, depth / SCROLL_EDGE))
    if (s.scroll) {
      s.scroll.speed = speed
      return
    }
    // By the clock rather than by frames: with animations turned off, a machine may hand out very few frames
    const scroll = { speed, tick: performance.now(), carry: 0, timer: 0 }
    scroll.timer = window.setInterval(() => {
      const now = performance.now()
      const delta = scroll.speed * (now - scroll.tick) / 1000 + scroll.carry
      scroll.tick = now
      scroll.carry = delta - Math.trunc(delta)
      box.scrollTop += Math.trunc(delta)
      if (session.current) track(session.current.clientY)
    }, 16)
    s.scroll = scroll
  }
  const track = (clientY: number) => {
    const s = session.current
    const list = listRef.current
    if (!s || !list) return
    s.clientY = clientY
    const moved = clientY - list.getBoundingClientRect().top - s.startY
    if (!s.started) {
      if (Math.abs(moved) < DRAG_THRESHOLD) return
      s.started = true
    }
    const last = s.tops.length - 1
    const top = s.tops[s.from]
    const height = s.heights[s.from]
    // Drawn within the list; where it lands goes by the pointer, as kept within the list its middle could at most
    // meet the end row's and never pass it
    const offset = Math.min(Math.max(moved, s.tops[0] - top), s.tops[last] + s.heights[last] - top - height)
    const middle = top + height / 2 + moved
    let to = s.from
    s.tops.forEach((rowTop, i) => {
      if (i < s.from && middle < rowTop + s.heights[i] / 2) to--
      if (i > s.from && middle > rowTop + s.heights[i] / 2) to++
    })
    const gap = last > 0 ? s.tops[1] - s.tops[0] - s.heights[0] : 0
    setDrag({ from: s.from, to, offset, step: height + gap })
    scrollNearEdge(clientY)
  }
  const startDrag = (e: React.PointerEvent<HTMLDivElement>, index: number, key: string) => {
    if (saving || session.current || e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, input')) return
    // A finger drags by the handle only: anywhere else on the row it scrolls the list
    if (e.pointerType !== 'mouse' && !target.closest('[data-grip]')) return
    const list = listRef.current
    if (!list) return
    const listTop = list.getBoundingClientRect().top
    const rects = [...list.querySelectorAll<HTMLElement>('[data-row]')].map(row => row.getBoundingClientRect())
    session.current = {
      pointerId: e.pointerId, key, from: index, startY: e.clientY - listTop, clientY: e.clientY, started: false,
      tops: rects.map(rect => rect.top - listTop), heights: rects.map(rect => rect.height),
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    // Or the press selects the titles it passes over
    e.preventDefault()
  }
  const endDrag = (pointerId: number | null, drop: boolean) => {
    const s = session.current
    if (!s || (pointerId !== null && s.pointerId !== pointerId)) return
    stopScrolling()
    session.current = null
    const last = dragRef.current
    setDrag(null)
    // By key: a page may have come or gone since the press
    if (!drop || !last || last.to === last.from || !shown.order.includes(s.key)) return
    const order = shown.order.filter(key => key !== s.key)
    order.splice(Math.min(last.to, order.length), 0, s.key)
    setDraft({ ...shown, order })
  }

  useEffect(() => stopScrolling, [])

  // React moves the DOM node of a row going down, and the button in it loses the focus: give it back, or to the
  // other arrow once this one is disabled at an end
  useLayoutEffect(() => {
    const wanted = focusAfterMove.current
    focusAfterMove.current = null
    if (!wanted) return
    const [key, delta] = [wanted.slice(0, wanted.lastIndexOf(':')), wanted.slice(wanted.lastIndexOf(':') + 1)]
    const find = (d: string) => listRef.current?.querySelector<HTMLButtonElement>(`button[data-move="${CSS.escape(`${key}:${d}`)}"]`)
    const button = find(delta)
    ;(button && !button.disabled ? button : find(delta === '1' ? '-1' : '1'))?.focus()
  })

  useEffect(() => {
    // Capturing on window first: the settings dialog under it must not take the key too
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      // Puts a dragged row back rather than closing
      if (session.current?.started) return endDrag(null, false)
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const shiftOf = (index: number) => {
    if (!drag) return 0
    if (index === drag.from) return drag.offset
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.step
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return drag.step
    return 0
  }

  return (
    <Portal>
      {/* A click outside does not close it, or a stray one would drop the order being made */}
      <div className="fixed inset-0 scrim flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
        <div className="glass glass-thick r-window glass-pop w-full max-w-md max-h-[85vh] flex flex-col" role="dialog" aria-modal="true" aria-labelledby="sidebar-dialog-title">
          <div className="flex items-center gap-3 p-6 hairline-b">
            <div className="w-10 h-10 rounded-xl gradient-primary-br text-white flex items-center justify-center flex-shrink-0">
              <PanelLeft size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 id="sidebar-dialog-title" className="text-lg font-semibold text-theme">侧边栏</h3>
              <p className="text-xs text-theme-hint">拖动或用箭头调整页面的顺序，把不常用的藏起来</p>
            </div>
            <button type="button" title="关闭" onClick={onClose} className="p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors">
              <X size={20} />
            </button>
          </div>

          <div ref={scrollRef} className="overflow-y-auto overscroll-contain flex-1 p-4 sm:p-6">
            <div ref={listRef} className="fill-quiet r-card p-1.5">
              {rows.map((page, index) => {
                const key = pageContributionKey(page)
                const hidden = !page.locked && shown.hidden.has(key)
                const Icon = iconByName(page.icon)
                const owner = page.owner === WEBUI ? undefined : titles.get(page.owner)
                const shift = shiftOf(index)
                const lifted = drag?.from === index
                return (
                  <div
                    key={key}
                    data-row
                    onPointerDown={e => startDrag(e, index, key)}
                    onPointerMove={e => session.current?.pointerId === e.pointerId && track(e.clientY)}
                    onPointerUp={e => endDrag(e.pointerId, true)}
                    onPointerCancel={e => endDrag(e.pointerId, false)}
                    onLostPointerCapture={e => endDrag(e.pointerId, false)}
                    className={`relative flex items-center gap-2 sm:gap-3 px-2.5 py-2 r-control select-none ${lifted ? 'z-10 shadow-lg cursor-grabbing' : 'cursor-grab'}`}
                    style={{
                      transform: shift ? `translateY(${shift}px)` : undefined,
                      // The rows making room glide; the dragged one sticks to the pointer, and on release all snap
                      // to their new places at once
                      transition: drag && !lifted ? 'transform 150ms ease' : undefined,
                      background: lifted ? 'rgb(var(--glass-tint) / var(--glass-alpha-thick))' : undefined,
                    }}
                  >
                    {/* The arrows do the same from the keyboard */}
                    <span data-grip aria-hidden="true" className="-ml-1 flex-shrink-0 text-theme-hint" style={{ touchAction: 'none' }}>
                      <GripVertical size={16} />
                    </span>
                    <Icon size={18} className={`flex-shrink-0 text-theme-secondary ${hidden ? 'opacity-50' : ''}`} />
                    <span className={`flex-1 min-w-0 truncate text-sm font-medium text-theme ${hidden ? 'opacity-50' : ''}`}>
                      {page.title}
                      {owner && owner !== page.title && <span className="text-xs font-normal text-theme-hint ml-2">{owner}</span>}
                    </span>
                    <div className="flex items-center flex-shrink-0">
                      <button type="button" data-move={`${key}:-1`} title="上移" aria-label={`把「${page.title}」上移`} disabled={saving || index === 0} onClick={() => move(index, -1)} className={arrow}>
                        <ArrowUp size={16} />
                      </button>
                      <button type="button" data-move={`${key}:1`} title="下移" aria-label={`把「${page.title}」下移`} disabled={saving || index === rows.length - 1} onClick={() => move(index, 1)} className={arrow}>
                        <ArrowDown size={16} />
                      </button>
                    </div>
                    {/* One width for the switch and the capsule, so the arrows line up row to row */}
                    <div className="w-20 flex justify-end flex-shrink-0">
                      {page.locked ? (
                        <span className="flex items-center gap-1 px-2.5 py-1 fill-quiet r-capsule text-xs text-theme-muted whitespace-nowrap" title="插件页是管理插件的入口，不能隐藏">
                          <Lock size={12} />
                          始终显示
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={!hidden}
                          disabled={saving}
                          onChange={e => toggle(key, e.target.checked)}
                          className="switch-toggle"
                          aria-label={`在侧边栏显示「${page.title}」`}
                          title={hidden ? '在侧边栏显示' : '从侧边栏隐藏'}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-theme-muted mt-3">
              排在最上面、没隐藏的页面，是直接打开 WebUI 地址时先显示的页面。隐藏的页面只是不在侧边栏里列出；停用的插件的页面不在这里，启用后回到原来的位置
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap p-4 sm:p-6 hairline-t">
            <button
              type="button"
              onClick={reset}
              disabled={saving || atDefault}
              title="全部显示，按插件自己的顺序排"
              className="flex items-center gap-2 px-4 py-2.5 text-theme-secondary hover:bg-theme-item rounded-xl font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <RotateCcw size={18} />
              恢复默认
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-5 py-2.5 text-theme-secondary hover:bg-theme-item rounded-xl font-medium transition-colors">取消</button>
              <button type="button" onClick={save} disabled={saving || !changed} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}

export default SidebarDialog
