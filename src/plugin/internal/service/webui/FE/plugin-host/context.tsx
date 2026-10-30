import React, { createContext, ReactNode, Suspense, useContext } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { ComponentType } from 'react'
import type { ApiOptions, WebUIContext } from '@luckylillia/plugin-sdk/webui'
import { showToast } from '../components/common'
import { pluginTitle } from '../components/plugins/meta'
import { apiFetch, authorizedFetch, getToken } from '../utils/api'
import { clearFailure, reportFailure } from './failures'
import { usePluginList } from './pluginList'
import { Contribution, useRegistry } from './registry'

const PluginContext = createContext<WebUIContext | null>(null)

/** `usePluginContext` of `@luckylillia/plugin-sdk/webui`. */
export function usePluginContext(): WebUIContext {
  const ctx = useContext(PluginContext)
  if (!ctx) throw new Error('usePluginContext() only works inside a component a plugin registered')
  return ctx
}

const contexts = new Map<string, WebUIContext>()

export function contextOf(owner: string): WebUIContext | undefined {
  return contexts.get(owner)
}

function encodeBody(body: unknown): BodyInit | undefined {
  if (body === undefined || typeof body === 'string' || body instanceof FormData) return body
  return JSON.stringify(body)
}

/** Tab id of a plugin page: the page id for builtins, `<package>:<id>` for everything else. */
export function pageKey(owner: string, builtin: boolean, id: string): string {
  return builtin ? id : `${owner}:${id}`
}

export function withToken(path: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(getToken() ?? '')}`
}

/** Everything registered through it is passed to `track`, so that unloading the plugin removes it. */
export function createWebUIContext(owner: string, builtin: boolean, track: (dispose: () => void) => void): WebUIContext {
  const register = (contribution: Contribution) => {
    const dispose = useRegistry.getState().add(contribution)
    track(dispose)
    return dispose
  }
  // Streams a component left open end with the plugin
  const streams = new Set<EventSource>()
  track(() => {
    for (const source of streams) source.close()
    streams.clear()
    if (contexts.get(owner) === ctx) contexts.delete(owner)
  })
  const ctx: WebUIContext = {
    plugin: { name: owner },
    page: options => register({
      kind: 'page',
      owner,
      key: pageKey(owner, builtin, options.id),
      title: options.title,
      icon: options.icon,
      order: options.order ?? 100,
      settings: !!options.settings,
      component: options.component as ComponentType,
      header: options.header as ComponentType | undefined,
    }),
    slot(name, contribution) {
      // The signature before slots took contributions was slot(name, component)
      if (!contribution || typeof contribution !== 'object' || '$$typeof' in contribution) {
        throw new Error(`slot ${name}: ctx.slot(name, { id, component }) takes a contribution object`)
      }
      const { id, label, component, order, priority, match, ...options } = contribution
      return register({
        kind: 'slot',
        owner,
        slot: name,
        id,
        label,
        match,
        order: order ?? 100,
        priority: priority ?? 0,
        options: options as Record<string, unknown>,
        component: component as ComponentType<any>,
      })
    },
    declareSlot: (name, declaration) => register({
      kind: 'declaration',
      owner,
      name,
      title: declaration.title,
      description: declaration.description,
      cardinality: declaration.cardinality,
    }),
    config: component => register({ kind: 'config', owner, component: component as ComponentType<any> }),
    field: (role, component) => register({ kind: 'field', owner, role, component: component as ComponentType<any> }),
    async api(path: string, options: ApiOptions = {}) {
      const body = encodeBody(options.body)
      const response = await apiFetch(path, {
        method: options.method ?? (body === undefined ? 'GET' : 'POST'),
        body,
        headers: typeof body === 'string' && options.body !== body ? { 'Content-Type': 'application/json' } : undefined,
      })
      if (!response.success) throw new Error(response.message || '请求失败')
      return response.data
    },
    fetch: (path, init) => authorizedFetch(path, init),
    authUrl: withToken,
    pageHref: (id, options = {}) => `#${pageKey(owner, builtin, id)}${options.fullscreen ? '?fullscreen' : ''}`,
    events(path, listeners) {
      const source = new EventSource(withToken(path))
      streams.add(source)
      for (const [event, listener] of Object.entries(listeners)) {
        source.addEventListener(event, (message) => {
          const { data } = message as MessageEvent
          try {
            listener(JSON.parse(data))
          } catch {
            listener(data)
          }
        })
      }
      return () => {
        source.close()
        streams.delete(source)
      }
    },
    toast: (message, type = 'success') => showToast(message, type),
  }
  contexts.set(owner, ctx)
  return ctx
}

interface BoundaryProps {
  owner: string
  /**
   * Reported to the plugin page when the component throws, and kept there until "重试" or the plugin's module runs
   * again: a slot rendered once per item (a chain link on every message) would otherwise flip it back and forth.
   */
  failure?: { key: string; where: string }
  /** In a frame of the WebUI's: says it in a line rather than a card of its own. */
  inline?: boolean
  /** Shown instead while the component loads or after it threw: for a chain link, what the rest drew. */
  passThrough?: ReactNode
  children: ReactNode
}

const asError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)))

/** Gives plugin components their context and keeps one that throws from taking the WebUI down with it. */
export class PluginBoundary extends React.Component<BoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: unknown) {
    return { error: asError(error) }
  }

  componentDidCatch(error: unknown) {
    const { owner, failure } = this.props
    console.error(`[plugin ${owner}]`, error)
    if (failure) reportFailure(failure.key, { owner, where: failure.where, message: asError(error).message })
  }

  private retry = () => {
    if (this.props.failure) clearFailure(this.props.failure.key)
    this.setState({ error: null })
  }

  render() {
    const { owner, inline, passThrough, children } = this.props
    if (this.state.error && passThrough !== undefined) return passThrough
    if (this.state.error) {
      const plugin = usePluginList.getState().plugins?.find(entry => entry.name === owner)
      const text = `插件「${plugin ? pluginTitle(plugin) : owner}」的界面出错了：${this.state.error.message}`
      if (inline) {
        return (
          <span className="inline-flex items-center gap-2 max-w-full text-xs text-red-500" title={text}>
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="truncate">{text}</span>
            <button type="button" onClick={this.retry} className="underline flex-shrink-0">重试</button>
          </span>
        )
      }
      return (
        <div className="card p-4 text-sm space-y-2">
          <p className="text-red-500">{text}</p>
          <button type="button" onClick={this.retry} className="btn-glass text-xs px-3 py-1.5">重试</button>
        </div>
      )
    }
    const loading = passThrough !== undefined ? passThrough
      : inline ? <Loader2 size={16} className="animate-spin text-pink-500" />
      : <div className="flex justify-center py-8"><Loader2 size={28} className="animate-spin text-pink-500" /></div>
    return (
      <PluginContext.Provider value={contexts.get(owner) ?? null}>
        <Suspense fallback={loading}>{children}</Suspense>
      </PluginContext.Provider>
    )
  }
}
