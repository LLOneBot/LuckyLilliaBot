import { create } from 'zustand'

export interface RenderFailure {
  owner: string
  /** What failed, as the plugin page says it: a page, a slot contribution, the config editor. */
  where: string
  message: string
}

/** Plugin components that threw while rendering, by contribution key; the plugin page lists them. */
export const useRenderFailures = create<{ failures: Record<string, RenderFailure> }>(() => ({ failures: {} }))

export function reportFailure(key: string, failure: RenderFailure) {
  useRenderFailures.setState(({ failures }) => ({ failures: { ...failures, [key]: failure } }))
}

export function clearFailure(key: string) {
  useRenderFailures.setState(({ failures }) => {
    if (!(key in failures)) return { failures }
    const next = { ...failures }
    delete next[key]
    return { failures: next }
  })
}

/** A plugin's module ran again: what its previous version broke says nothing about this one. */
export function clearFailuresOf(owner: string) {
  useRenderFailures.setState(({ failures }) => ({
    failures: Object.fromEntries(Object.entries(failures).filter(([, failure]) => failure.owner !== owner)),
  }))
}
