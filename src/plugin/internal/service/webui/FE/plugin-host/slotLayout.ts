import type { PluginStatus, UiPrefs, UiPrefsPatch } from '../types/plugins'
import {
  arrangeSlotContributions, contributionKey, declarationOf, NO_PREFS, slotContributions,
  type Contribution, type SlotContribution, type SlotDeclaration,
} from './registry'

/** Only the declaring plugin can opt a list into its own configuration dialog. */
export function configurableSlots(contributions: Contribution[], owner: string): SlotDeclaration[] {
  return contributions.filter((item): item is SlotDeclaration => item.kind === 'declaration'
    && item.owner === owner && item.cardinality === 'list' && item.configurable === true)
}

/** Hidden rows remain editable; enabled providers and the slot owner's own rows keep their declared positions. */
export function layoutContributions(
  contributions: Contribution[], plugins: PluginStatus[] | null, name: string, prefs: UiPrefs = NO_PREFS,
): SlotContribution[] {
  const declaration = declarationOf(contributions, name)
  if (!declaration || declaration.cardinality !== 'list' || !plugins) return []
  const enabled = new Set(plugins.filter(plugin => !plugin.disabled).map(plugin => plugin.name))
  return slotContributions(contributions, name, prefs)
    .filter(item => item.owner === declaration.owner || enabled.has(item.owner))
}

const belongsToSlot = (key: string, name: string) => key.split('|')[1] === name

/**
 * An incremental patch for this list alone. A reset also clears saved choices for absent/disabled cards; normal
 * saves touch only the current rows. A later edit after reset is applied on top of the slot's defaults.
 */
export function slotLayoutPatch(
  name: string, rows: SlotContribution[], hidden: Set<string>, prefs: UiPrefs, reset = false,
): UiPrefsPatch {
  const ownRows = rows.filter(row => row.slot === name)
  const isOwn = (key: string) => belongsToSlot(key, name)
  const base: UiPrefs = reset ? {
    ...prefs,
    hidden: prefs.hidden.filter(key => !isOwn(key)),
    order: Object.fromEntries(Object.entries(prefs.order).filter(([key]) => !isOwn(key))),
  } : prefs
  const order = arrangeSlotContributions(ownRows, base)
  if (reset) {
    for (const key of Object.keys(prefs.order)) if (isOwn(key) && !(key in order)) order[key] = null
  }
  const keys = ownRows.map(contributionKey)
  const current = new Set(keys)
  const hide = keys.filter(key => hidden.has(key) && !base.hidden.includes(key))
  const show = reset
    ? prefs.hidden.filter(key => isOwn(key) && (!current.has(key) || !hidden.has(key)))
    : keys.filter(key => !hidden.has(key) && base.hidden.includes(key))
  const patch: UiPrefsPatch = {}
  if (Object.keys(order).length) patch.order = order
  if (hide.length) patch.hide = hide
  if (show.length) patch.show = show
  return patch
}
