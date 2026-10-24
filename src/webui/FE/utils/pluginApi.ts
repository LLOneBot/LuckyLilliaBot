import { apiFetch, ApiError } from './api'
import { getCookie } from './cookie'
import { ConfigIssue, DependencyReport, PluginDescription, PluginStatus, ReloadResult } from '../types/plugins'

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

export const scanPlugins = () =>
  request<{ added: string[]; changed: string[]; removed: string[] }>('/scan', { method: 'POST' })

export const setPluginEnabled = (id: string, enabled: boolean) =>
  request<PluginStatus>(`/${id}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' })

export const reloadPlugin = (id: string) => request<ReloadResult>(`/${id}/reload`, { method: 'POST' })

export const addPluginInstance = (name: string) =>
  request<PluginStatus>('', { method: 'POST', body: JSON.stringify({ name }) })

export const removePlugin = (id: string) => request<null>(`/${id}`, { method: 'DELETE' })

export const describePlugin = (id: string) => request<PluginDescription>(`/${id}/schema`)

export const getPluginDependencies = (id: string) => request<DependencyReport>(`/${id}/dependencies`)

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

export type PluginStreamEvent = { type: 'status'; data: PluginStatus } | { type: 'list' }

/** Subscribes to state changes; returns the unsubscribe function. */
export function openPluginStream(onEvent: (event: PluginStreamEvent) => void): () => void {
  const token = getCookie('webui_token') || ''
  const source = new EventSource(`${BASE}/stream?token=${encodeURIComponent(token)}`)
  source.addEventListener('changed', (event) => {
    try {
      onEvent(JSON.parse((event as MessageEvent).data))
    } catch {
      // malformed frame, the next one carries the full status again
    }
  })
  return () => source.close()
}
