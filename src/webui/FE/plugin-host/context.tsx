import React, { createContext, ReactNode, Suspense, useContext } from 'react'
import { Loader2 } from 'lucide-react'
import type { ComponentType } from 'react'
import type { ApiOptions, WebUIContext } from '@luckylillia/plugin-sdk/webui'
import { showToast } from '../components/common'
import { apiFetch, getToken } from '../utils/api'
import { usePluginList } from './pluginList'
import { useRegistry } from './registry'

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

/** Everything registered through it is passed to `track`, so that unloading the plugin removes it. */
export function createWebUIContext(owner: string, builtin: boolean, track: (dispose: () => void) => void): WebUIContext {
  const register = (contribution: Parameters<ReturnType<typeof useRegistry.getState>['add']>[0]) => {
    const dispose = useRegistry.getState().add(contribution)
    track(dispose)
    return dispose
  }
  const ctx: WebUIContext = {
    plugin: { name: owner },
    page: options => register({
      kind: 'page',
      owner,
      key: builtin ? options.id : `${owner}:${options.id}`,
      title: options.title,
      icon: options.icon,
      order: options.order ?? 100,
      settings: !!options.settings,
      component: options.component as ComponentType,
    }),
    slot: (slot, component, options = {}) => register({
      kind: 'slot', owner, slot, order: options.order ?? 100, component: component as ComponentType,
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
    events(path, listeners) {
      const separator = path.includes('?') ? '&' : '?'
      const source = new EventSource(`${path}${separator}token=${encodeURIComponent(getToken() ?? '')}`)
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
      return () => source.close()
    },
    toast: (message, type = 'success') => showToast(message, type),
  }
  contexts.set(owner, ctx)
  return ctx
}

interface BoundaryProps {
  owner: string
  children: ReactNode
}

/** Gives plugin components their context and keeps one that throws from taking the WebUI down with it. */
export class PluginBoundary extends React.Component<BoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[plugin ${this.props.owner}]`, error)
  }

  render() {
    const { owner, children } = this.props
    if (this.state.error) {
      const plugin = usePluginList.getState().plugins?.find(entry => entry.name === owner)
      return (
        <div className="card p-4 text-sm space-y-2">
          <p className="text-red-500">插件「{plugin?.title ?? owner}」的界面出错了：{this.state.error.message}</p>
          <button type="button" onClick={() => this.setState({ error: null })} className="btn-glass text-xs px-3 py-1.5">重试</button>
        </div>
      )
    }
    return (
      <PluginContext.Provider value={contexts.get(owner) ?? null}>
        <Suspense fallback={<div className="flex justify-center py-8"><Loader2 size={28} className="animate-spin text-pink-500" /></div>}>
          {children}
        </Suspense>
      </PluginContext.Provider>
    )
  }
}
