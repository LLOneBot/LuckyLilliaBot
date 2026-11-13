import { apiFetch, ApiError, getToken } from './api'
import {
  ConfigIssue, DependencyReport, EntryScope, PluginDescription, PluginDetails, PluginStatus, ReloadResult, UiPrefs,
  UiPrefsPatch,
} from '../types/plugins'

const BASE = '/api/plugins'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch<T>(`${BASE}${path}`, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
  })
  if (!response.success) throw new Error(response.message || '请求失败')
  return response.data
}

export const listPlugins = () => request<PluginStatus[]>('')
export const getPluginDirectories = () => request<{ roots: string[] }>('/directories')

export const scanPlugins = () =>
  request<{ added: string[]; changed: string[]; removed: string[] }>('/scan', { method: 'POST' })

/** The package has to be trusted first: ask, then call again with `trust`. */
export class TrustRequiredError extends Error {}

async function trusting<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  } catch (e) {
    if (e instanceof ApiError && e.status === 428) throw new TrustRequiredError(e.message)
    throw e
  }
}

/** Rejects with TrustRequiredError for a third-party package not trusted yet, unless `trust` says it now is. */
export const setPluginEnabled = (id: string, enabled: boolean, trust = false) => trusting(() =>
  request<PluginStatus>(`/${id}/${enabled ? 'enable' : 'disable'}`, enabled && trust ? { method: 'POST', body: JSON.stringify({ trust }) } : { method: 'POST' }))

export const reloadPlugin = (id: string) => request<ReloadResult>(`/${id}/reload`, { method: 'POST' })

export const addPluginInstance = (name: string, trust = false) => trusting(() =>
  request<PluginStatus>('', { method: 'POST', body: JSON.stringify({ name, trust }) }))

/** Applies at once, without restarting the plugin. */
export const setPluginScope = (id: string, scope: EntryScope | undefined) =>
  request<PluginStatus>(`/${id}/scope`, { method: 'PUT', body: JSON.stringify({ scope: scope ?? null }) })

export const clearListenerError = (id: string) => request<PluginStatus>(`/${id}/listener-error`, { method: 'DELETE' })

export const removePlugin = (id: string) => request<null>(`/${id}`, { method: 'DELETE' })

export const describePlugin = (id: string) => request<PluginDescription>(`/${id}/schema`)

export const getPluginDependencies = (id: string) => request<DependencyReport>(`/${id}/dependencies`)

export const getPluginDetails = (id: string) => request<PluginDetails>(`/${id}/details`)

export const getUiPrefs = () => request<UiPrefs>('/ui')

export const patchUiPrefs = (patch: UiPrefsPatch) => request<UiPrefs>('/ui', { method: 'PATCH', body: JSON.stringify(patch) })

/**
 * Sends the complete value; the server works out what differs and stores only that.
 * Rejects with ConfigRejectedError when the schema refuses it, or ConfigConflictError when the config
 * changed since it was loaded.
 */
export async function savePluginConfig(
  id: string,
  config: unknown,
  options: { ifRev?: string; clear?: string[] } = {},
): Promise<PluginStatus> {
  try {
    return await request<PluginStatus>(`/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify({ config, ifRev: options.ifRev, clear: options.clear }),
    })
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) throw new ConfigConflictError(e.message)
    const issues = e instanceof ApiError && e.status === 400 && (e.data as { issues?: ConfigIssue[] } | undefined)?.issues
    if (issues) throw new ConfigRejectedError(e.message, issues)
    throw e
  }
}

export class ConfigRejectedError extends Error {
  constructor(message: string, readonly issues: ConfigIssue[]) {
    super(message)
  }
}

/** Someone else changed the config since this form loaded it. */
export class ConfigConflictError extends Error {}

export type PluginStreamEvent = { type: 'status'; data: PluginStatus } | { type: 'list' } | { type: 'ui'; data: UiPrefs }

/**
 * Subscribes to state changes; returns the unsubscribe function. The browser reconnects a dropped stream by itself,
 * e.g. across a restart of the bot. Every connection needs a fresh snapshot: the initial HTTP read may also
 * predate the stream's subscription, and changes during that gap are not replayed.
 */
export function openPluginStream(onEvent: (event: PluginStreamEvent) => void, onConnected?: () => void): () => void {
  const token = getToken() || ''
  const source = new EventSource(`${BASE}/stream?token=${encodeURIComponent(token)}`)
  source.addEventListener('connected', () => {
    onConnected?.()
  })
  source.addEventListener('changed', (event) => {
    try {
      onEvent(JSON.parse((event as MessageEvent).data))
    } catch {
      // malformed frame, the next one carries the full status again
    }
  })
  return () => source.close()
}
