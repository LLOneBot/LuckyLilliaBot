import type { ComponentType } from 'react'
import { create } from 'zustand'
import type { ConfigEditorProps, FieldProps, SlotCardinality } from '@luckylillia/plugin-sdk/webui'
import type { PluginStatus, UiPrefs } from '../types/plugins'

interface Owned {
  /** Package name of the plugin that registered it, `builtin:<name>` for builtins. */
  owner: string
}

/** The WebUI's own entry: the shell's slots and the core pages are its. */
export const WEBUI = 'builtin:webui'

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
  /** Drawn above the page, in the room the shell leaves for it. */
  header?: ComponentType
  /** A core page: always there, nothing can hide it. Only the WebUI's own pages are. */
  locked?: boolean
}

export interface SlotContribution extends Owned {
  kind: 'slot'
  slot: string
  id: string
  label?: string
  order: number
  priority: number
  /** The key it draws in a `keyed` slot. */
  match?: string
  /** What the contribution says about itself for the slot's frame, e.g. a card title. */
  options: Record<string, unknown>
  component: ComponentType<any>
}

export interface SlotDeclaration extends Owned {
  kind: 'declaration'
  name: string
  title: string
  description?: string
  cardinality: SlotCardinality
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

export type Contribution = PageContribution | SlotContribution | SlotDeclaration | ConfigContribution | FieldContribution

interface RegistryState {
  contributions: Contribution[]
  /** Returns the function removing it again; throws for a slot contribution or declaration that cannot be. */
  add(contribution: Contribution): () => void
}

/** The keys the user's choices (UiPrefs) name contributions and pages by. */
export const contributionKey = (c: SlotContribution) => `${c.owner}|${c.slot}|${c.id}`
export const pageContributionKey = (page: PageContribution) => `${page.owner}|page|${page.key}`

/** What the plugin page calls a contribution. */
export const contributionLabel = (c: SlotContribution) =>
  c.label || (typeof c.options.title === 'string' && c.options.title) || c.id

const CARDINALITIES: SlotCardinality[] = ['list', 'single', 'keyed', 'chain']

/** Why a contribution or declaration cannot be added, or nothing. */
export function rejection(contributions: Contribution[], contribution: Contribution): string | undefined {
  if (contribution.kind === 'slot') {
    if (typeof contribution.id !== 'string' || !contribution.id) return `slot ${contribution.slot}: a contribution needs an id`
    if (!contribution.component) return `slot ${contribution.slot}: contribution ${contribution.id} has no component`
    if (contribution.match !== undefined && typeof contribution.match !== 'string') {
      return `slot ${contribution.slot}: match of ${contribution.id} is a string`
    }
    const taken = contributions.some(other => other.kind === 'slot' && other.owner === contribution.owner
      && other.slot === contribution.slot && other.id === contribution.id)
    if (taken) return `slot ${contribution.slot}: id ${contribution.id} is used twice`
  }
  if (contribution.kind === 'declaration') {
    if (typeof contribution.name !== 'string' || !contribution.name) return 'a slot needs a name'
    if (!CARDINALITIES.includes(contribution.cardinality)) return `slot ${contribution.name}: cardinality is one of ${CARDINALITIES.join(', ')}`
    const owner = contributions.find((other): other is SlotDeclaration => other.kind === 'declaration' && other.name === contribution.name)
    if (owner) return `slot ${contribution.name} is declared by ${owner.owner} already`
  }
}

export const useRegistry = create<RegistryState>((set, get) => ({
  contributions: [],
  add(contribution) {
    const reason = rejection(get().contributions, contribution)
    if (reason) throw new Error(reason)
    set(state => ({ contributions: [...state.contributions, contribution] }))
    return () => set(state => ({ contributions: state.contributions.filter(other => other !== contribution) }))
  },
}))

// The shell's and the plugin page's, here so that they exist before any plugin registers into them. The plugin page
// only takes additions: it is how the user keeps plugins in check
const SHELL_SLOTS: Omit<SlotDeclaration, 'kind' | 'owner'>[] = [
  { name: 'shell.notices', title: '顶部提示', description: '主界面顶部的提示栏里的一行', cardinality: 'list' },
  { name: 'settings.sections', title: '设置项', description: '设置弹框（侧边栏的齿轮）里的一节', cardinality: 'list' },
  { name: 'plugins.toolbar', title: '插件页按钮', description: '插件页顶部「重新扫描」旁边的按钮', cardinality: 'list' },
  { name: 'plugins.card.actions', title: '插件卡片按钮', description: '插件页每张卡片上的按钮，排在卡片自己的前面', cardinality: 'list' },
]
for (const slot of SHELL_SLOTS) useRegistry.getState().add({ kind: 'declaration', owner: WEBUI, ...slot })

export const NO_PREFS: UiPrefs = { approved: [], hidden: [], order: {} }

/** Package names with at least one running entry: their pages and slots are shown. */
export function activeOwners(plugins: PluginStatus[] | null): Set<string> {
  return new Set((plugins ?? []).filter(plugin => plugin.state === 'active').map(plugin => plugin.name))
}

const byOrder = (a: { order: number; owner: string }, b: { order: number; owner: string }) =>
  a.order - b.order || a.owner.localeCompare(b.owner)

/**
 * Pages in sidebar order. Core pages are always there. The others are listed while their plugin is enabled, whatever
 * state it is in: waiting for what it depends on, failing, starting; the page itself says what keeps the plugin from
 * running (PluginPage). Every page can be opened, a disabled plugin's included, because the plugin card links to its
 * settings to configure it before enabling it. A page the user hid leaves the sidebar only.
 */
export function visiblePages(
  contributions: Contribution[],
  plugins: PluginStatus[] | null,
  purpose: 'sidebar' | 'open' = 'sidebar',
  prefs: UiPrefs = NO_PREFS,
): PageContribution[] {
  // Until the list loads, plugins are taken as enabled: they almost always are, and pages would flicker otherwise
  const enabled = plugins && new Set(plugins.filter(plugin => !plugin.disabled).map(plugin => plugin.name))
  return contributions
    .filter((c): c is PageContribution => c.kind === 'page'
      && (c.locked || purpose === 'open' || !enabled || enabled.has(c.owner)))
    .filter(page => purpose === 'open' || page.locked || !prefs.hidden.includes(pageContributionKey(page)))
    .sort((a, b) => byOrder(a, b) || a.title.localeCompare(b.title))
}

export function declarationOf(contributions: Contribution[], name: string): SlotDeclaration | undefined {
  return contributions.find((c): c is SlotDeclaration => c.kind === 'declaration' && c.name === name)
}

const effectiveOrder = (c: SlotContribution, prefs: UiPrefs) => prefs.order[contributionKey(c)] ?? c.order
const byPriority = (a: SlotContribution, b: SlotContribution) =>
  b.priority - a.priority || a.owner.localeCompare(b.owner) || a.id.localeCompare(b.id)

/**
 * Every contribution to a slot, in the order it shows them: a `list` or `chain` by order, a `single` slot's winner
 * first, a `keyed` slot's by key, each key's winner first.
 */
export function slotContributions(contributions: Contribution[], name: string, prefs: UiPrefs = NO_PREFS): SlotContribution[] {
  const cardinality = declarationOf(contributions, name)?.cardinality
  const own = contributions.filter((c): c is SlotContribution => c.kind === 'slot' && c.slot === name)
  if (cardinality === 'single') return own.sort(byPriority)
  if (cardinality === 'keyed') return own.sort((a, b) => (a.match ?? '').localeCompare(b.match ?? '') || byPriority(a, b))
  return own.sort((a, b) => effectiveOrder(a, prefs) - effectiveOrder(b, prefs) || a.owner.localeCompare(b.owner) || a.id.localeCompare(b.id))
}

/** Of a slot's contributions, those whose plugin runs and that the user did not hide, in order. */
function shownContributions(contributions: Contribution[], active: Set<string>, name: string, prefs: UiPrefs) {
  return slotContributions(contributions, name, prefs)
    .filter(c => active.has(c.owner) && !prefs.hidden.includes(contributionKey(c)))
}

/**
 * What a slot shows: every shown contribution of a `list` or `chain`, the first of a `single`, the first with
 * `match` of a `keyed` one. Nothing for a slot nobody declares.
 */
export function slotContents(
  contributions: Contribution[], active: Set<string>, name: string, prefs: UiPrefs = NO_PREFS, match?: string,
): SlotContribution[] {
  const cardinality = declarationOf(contributions, name)?.cardinality
  if (!cardinality) return []
  const shown = shownContributions(contributions, active, name, prefs)
  if (cardinality === 'single') return shown.slice(0, 1)
  if (cardinality === 'keyed') return shown.filter(c => match !== undefined && c.match === match).slice(0, 1)
  return shown
}

/** The keys a `keyed` slot has a shown contribution for. */
export function slotMatches(contributions: Contribution[], active: Set<string>, name: string, prefs: UiPrefs = NO_PREFS): string[] {
  if (declarationOf(contributions, name)?.cardinality !== 'keyed') return []
  return [...new Set(shownContributions(contributions, active, name, prefs).flatMap(c => (c.match === undefined ? [] : [c.match])))]
}

/** The last registration wins, so a reloaded plugin replaces its own editor. */
export function configEditorOf(contributions: Contribution[], owner: string): ConfigContribution | undefined {
  return contributions.filter((c): c is ConfigContribution => c.kind === 'config' && c.owner === owner).at(-1)
}

export function fieldRendererOf(contributions: Contribution[], role: string): FieldContribution | undefined {
  return contributions.filter((c): c is FieldContribution => c.kind === 'field' && c.role === role).at(-1)
}
