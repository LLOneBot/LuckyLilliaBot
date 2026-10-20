import type { ComponentType } from 'react'
import { create } from 'zustand'
import type { ConfigEditorProps, FieldProps } from '@luckylillia/plugin-sdk/webui'
import type { PluginStatus } from '../types/plugins'

interface Owned {
  /** Package name of the plugin that registered it. */
  owner: string
}

export interface PageContribution extends Owned {
  kind: 'page'
  /** Tab id: the page id for builtins, `<package>:<id>` for everything else. */
  key: string
  title: string
  icon?: string
  order: number
  /** Shown whatever state the plugin is in. */
  settings: boolean
  component: ComponentType
}

export interface SlotContribution extends Owned {
  kind: 'slot'
  slot: string
  order: number
  component: ComponentType
}

export interface ConfigContribution extends Owned {
  kind: 'config'
  component: ComponentType<ConfigEditorProps>
}

export interface FieldContribution extends Owned {
  kind: 'field'
  role: string
  component: ComponentType<FieldProps>
}

export type Contribution = PageContribution | SlotContribution | ConfigContribution | FieldContribution

interface RegistryState {
  contributions: Contribution[]
  /** Returns the function removing it again. */
  add(contribution: Contribution): () => void
}

export const useRegistry = create<RegistryState>(set => ({
  contributions: [],
  add(contribution) {
    set(state => ({ contributions: [...state.contributions, contribution] }))
    return () => set(state => ({ contributions: state.contributions.filter(other => other !== contribution) }))
  },
}))

/** Package names with at least one running entry: their pages and slots are shown. */
export function activeOwners(plugins: PluginStatus[] | null): Set<string> {
  return new Set((plugins ?? []).filter(plugin => plugin.state === 'active').map(plugin => plugin.name))
}

const byOrder = (a: { order: number; owner: string }, b: { order: number; owner: string }) =>
  a.order - b.order || a.owner.localeCompare(b.owner)

/** Settings pages, and the other pages of plugins that run, in sidebar order. */
export function visiblePages(contributions: Contribution[], active: Set<string>): PageContribution[] {
  return contributions
    .filter((c): c is PageContribution => c.kind === 'page' && (c.settings || active.has(c.owner)))
    .sort((a, b) => byOrder(a, b) || a.title.localeCompare(b.title))
}

export function slotContents(contributions: Contribution[], active: Set<string>, slot: string): SlotContribution[] {
  return contributions
    .filter((c): c is SlotContribution => c.kind === 'slot' && c.slot === slot && active.has(c.owner))
    .sort(byOrder)
}

/** The last registration wins, so a reloaded plugin replaces its own editor. */
export function configEditorOf(contributions: Contribution[], owner: string): ConfigContribution | undefined {
  return contributions.filter((c): c is ConfigContribution => c.kind === 'config' && c.owner === owner).at(-1)
}

export function fieldRendererOf(contributions: Contribution[], role: string): FieldContribution | undefined {
  return contributions.filter((c): c is FieldContribution => c.kind === 'field' && c.role === role).at(-1)
}
