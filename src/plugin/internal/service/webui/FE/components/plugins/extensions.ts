import type { RenderFailure } from '../../plugin-host/failures'
import {
  activeOwners, Contribution, contributionKey, declarationOf, PageContribution, pageContributionKey, slotContents,
  slotContributions, SlotContribution, SlotDeclaration, slotMatches, WEBUI,
} from '../../plugin-host/registry'
import { PluginStatus, UiPrefs } from '../../types/plugins'

/** `unmatched`: in a `keyed` slot without the `match` saying which key it draws, so it never shows. */
export type RowState = 'shown' | 'hidden' | 'inactive' | 'shadowed' | 'unmatched'

export interface SlotRow {
  key: string
  contribution: SlotContribution
  state: RowState
  failure?: RenderFailure
}

export interface SlotGroup {
  declaration: SlotDeclaration
  /** The plugin declaring it runs, so the slot is on screen at all; the WebUI's own always are. */
  live: boolean
  /** In the order the slot shows them; a `single` slot's winner first. */
  rows: SlotRow[]
  /** The user moved some of them. */
  reordered: boolean
}

/** Every declared slot with every contribution to it, in the order the plugin page lists them. */
export function slotGroups(
  contributions: Contribution[], plugins: PluginStatus[] | null, prefs: UiPrefs, failures: Record<string, RenderFailure>,
): SlotGroup[] {
  const active = activeOwners(plugins)
  return contributions
    .filter((c): c is SlotDeclaration => c.kind === 'declaration')
    .map((declaration) => {
      const { name, cardinality } = declaration
      // A keyed slot shows a winner per key
      const shown = new Set(cardinality === 'keyed'
        ? slotMatches(contributions, active, name, prefs).flatMap(match => slotContents(contributions, active, name, prefs, match))
        : slotContents(contributions, active, name, prefs))
      const rows = slotContributions(contributions, name, prefs).map((contribution): SlotRow => {
        const key = contributionKey(contribution)
        let state: RowState = 'shown'
        if (prefs.hidden.includes(key)) state = 'hidden'
        else if (cardinality === 'keyed' && contribution.match === undefined) state = 'unmatched'
        else if (!active.has(contribution.owner)) state = 'inactive'
        else if (!shown.has(contribution)) state = 'shadowed'
        return { key, contribution, state, failure: failures[key] }
      })
      return {
        declaration,
        live: declaration.owner === WEBUI || active.has(declaration.owner),
        rows,
        reordered: rows.some(row => row.key in prefs.order),
      }
    })
}

/** Contributions to slots nobody declares: the plugin declaring one is missing, off or did not load. */
export function orphans(contributions: Contribution[]): SlotContribution[] {
  return contributions.filter((c): c is SlotContribution => c.kind === 'slot' && !declarationOf(contributions, c.slot))
}

/** Whether the user orders a slot's contributions: those of a `list` or `chain`, the others go by priority. */
export const orderable = (declaration: SlotDeclaration) => declaration.cardinality === 'list' || declaration.cardinality === 'chain'

/** Positions for every row of a list slot once one moved by `delta`; empty when it cannot move that way. */
export function moved(rows: SlotRow[], index: number, delta: -1 | 1): Record<string, number> {
  const target = index + delta
  if (target < 0 || target >= rows.length) return {}
  const keys = rows.map(row => row.key)
  ;[keys[index], keys[target]] = [keys[target], keys[index]]
  return Object.fromEntries(keys.map((key, position) => [key, position * 10]))
}

export interface PageRow {
  key: string
  page: PageContribution
  hidden: boolean
  failure?: RenderFailure
}

export function pageRows(contributions: Contribution[], prefs: UiPrefs, failures: Record<string, RenderFailure>): PageRow[] {
  return contributions
    .filter((c): c is PageContribution => c.kind === 'page')
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map((page) => {
      const key = pageContributionKey(page)
      return { key, page, hidden: prefs.hidden.includes(key), failure: failures[key] }
    })
}

/** Packages bringing a WebUI module of their own, one per package, those still to approve first. */
export function webuiPackages(plugins: PluginStatus[] | null): PluginStatus[] {
  const seen = new Set<string>()
  return (plugins ?? [])
    .filter(plugin => !plugin.builtin && plugin.webui && !seen.has(plugin.name) && seen.add(plugin.name))
    .sort((a, b) => Number(!!a.webuiApproved) - Number(!!b.webuiApproved) || a.name.localeCompare(b.name))
}
