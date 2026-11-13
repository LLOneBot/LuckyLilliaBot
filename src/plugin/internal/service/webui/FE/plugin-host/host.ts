import { useEffect } from 'react'
import { create } from 'zustand'
import type { WebUIPlugin } from '@luckylillia/plugin-sdk/webui'
import { PluginStatus } from '../types/plugins'
import { BUILTIN_CLIENTS } from './builtins'
import { createWebUIContext } from './context'
import { clearFailuresOf } from './failures'
import { followPluginList, usePluginList } from './pluginList'
import { PageContribution, useRegistry } from './registry'

/** Why a plugin's WebUI module did not load, by package name. */
export const useClientErrors = create<{ errors: Record<string, string> }>(() => ({ errors: {} }))

function setError(owner: string, error?: string) {
  useClientErrors.setState(({ errors }) => {
    const next = { ...errors }
    if (error) next[owner] = error
    else delete next[owner]
    return { errors: next }
  })
}

function run(owner: string, apply: WebUIPlugin, builtin: boolean): () => void {
  clearFailuresOf(owner)
  const disposers: (() => void)[] = []
  const ctx = createWebUIContext(owner, builtin, dispose => disposers.push(dispose))
  const dispose = () => {
    for (const undo of disposers.splice(0).reverse()) undo()
  }
  try {
    const cleanup = apply(ctx)
    if (typeof cleanup === 'function') disposers.push(cleanup)
    setError(owner)
  } catch (e) {
    // All or nothing, as on the bot: what it registered before it threw goes again
    dispose()
    setError(owner, e instanceof Error ? e.message : String(e))
  }
  return dispose
}

const loaded = new Map<string, { url: string; dispose: () => void }>()
const loading = new Map<string, Promise<void>>()
const bundled = new Map<string, { apply: WebUIPlugin; dispose: () => void }>()
let builtinClients = BUILTIN_CLIENTS

function restoreBuiltin(owner: string) {
  const apply = builtinClients[owner]
  if (apply && !bundled.has(owner) && !loaded.has(owner)) bundled.set(owner, { apply, dispose: run(owner, apply, true) })
}

/** Third-party modules load from their package; builtins ship with the WebUI. */
export function hasExternalClient(plugin: PluginStatus): boolean {
  return !!plugin.webui
}

/** Imports a plugin's WebUI module unless that version is loaded already. Never rejects: see useClientErrors. */
export function ensureClient(owner: string, url: string): Promise<void> {
  if (loaded.get(owner)?.url === url) return Promise.resolve()
  const key = `${owner}\n${url}`
  let task = loading.get(key)
  if (!task) {
    task = (async () => {
      try {
        const module = await import(/* @vite-ignore */ url)
        const apply = module.default ?? module.apply
        if (typeof apply !== 'function') throw new Error('模块没有默认导出一个函数')
        // The previous version stays until the new one imported fine
        loaded.get(owner)?.dispose()
        bundled.get(owner)?.dispose()
        bundled.delete(owner)
        loaded.set(owner, { url, dispose: run(owner, apply, !!builtinClients[owner]) })
        if (useClientErrors.getState().errors[owner] && builtinClients[owner]) {
          const error = useClientErrors.getState().errors[owner]
          loaded.get(owner)?.dispose()
          loaded.delete(owner)
          restoreBuiltin(owner)
          setError(owner, error)
        }
      } catch (e) {
        setError(owner, e instanceof Error ? e.message : String(e))
      } finally {
        loading.delete(key)
      }
    })()
    loading.set(key, task)
  }
  return task
}

/** Loads the modules of enabled plugins, swaps reloaded ones and drops modules removed from the plugin list. */
export function syncClients(plugins: PluginStatus[]) {
  const urls = new Map<string, string>()
  const wanted = new Set<string>()
  for (const plugin of plugins) {
    if (!hasExternalClient(plugin)) continue
    urls.set(plugin.name, plugin.webui!)
    // Builtin settings pages and standby routes exist while disabled, and must use the activated package UI.
    if (plugin.builtin || !plugin.disabled) wanted.add(plugin.name)
  }
  for (const [owner, client] of loaded) {
    const url = urls.get(owner)
    if (!url) {
      client.dispose()
      loaded.delete(owner)
      restoreBuiltin(owner)
    } else if (url !== client.url) {
      ensureClient(owner, url)
    }
  }
  for (const owner of wanted) ensureClient(owner, urls.get(owner)!)
}

let builtinsStarted = false

/** Reconcile the bundled modules after Vite updates its glob, preserving activated npm clients. */
export function refreshBuiltinClients(clients: Record<string, WebUIPlugin>) {
  builtinClients = clients
  if (!builtinsStarted) return
  for (const [owner, previous] of bundled) {
    if (clients[owner] === previous.apply) continue
    previous.dispose()
    bundled.delete(owner)
    clearFailuresOf(owner)
    setError(owner)
  }
  for (const owner of Object.keys(clients)) restoreBuiltin(owner)
}

/**
 * Registers what builtin plugins add to the WebUI, before the first render: their pages are then known when
 * App reads the tab from the address. Registering calls nothing on the bot.
 */
export function startBuiltinClients() {
  builtinsStarted = true
  refreshBuiltinClients(builtinClients)
}

if (import.meta.hot) {
  // React refresh updates components, but ctx.page/slot registrations also need their module's apply() again.
  import.meta.hot.accept('./builtins', module => {
    if (module) refreshBuiltinClients(module.BUILTIN_CLIENTS)
  })
}

/** Tab ids of builtin plugins' pages. */
export function builtinPageKeys(): Set<string> {
  return new Set(useRegistry.getState().contributions
    .filter(c => c.kind === 'page' && c.owner.startsWith('builtin:'))
    .map(c => (c as PageContribution).key))
}

/** Runs the plugin UI host while the WebUI is logged in. */
export function usePluginHost(enabled: boolean) {
  const plugins = usePluginList(state => state.plugins)
  useEffect(() => (enabled ? followPluginList() : undefined), [enabled])
  useEffect(() => {
    if (enabled && plugins) syncClients(plugins)
  }, [enabled, plugins])
}
