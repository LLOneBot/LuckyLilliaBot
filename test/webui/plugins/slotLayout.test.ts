import { describe, expect, it } from 'vitest'
import {
  activeOwners, contributionKey, NO_PREFS, slotContents, slotContributions,
  type Contribution, type SlotContribution, type SlotDeclaration,
} from '@/plugin/internal/service/webui/FE/plugin-host/registry'
import { configurableSlots, layoutContributions, slotLayoutPatch } from '@/plugin/internal/service/webui/FE/plugin-host/slotLayout'
import type { PluginStatus, UiPrefs, UiPrefsPatch } from '@/plugin/internal/service/webui/FE/types/plugins'

const NAME = 'dashboard.cards'
const OWNER = 'builtin:dashboard'
const component = () => null
const declaration = (patch: Partial<SlotDeclaration> = {}): SlotDeclaration =>
  ({ kind: 'declaration', owner: OWNER, name: NAME, title: 'Cards', cardinality: 'list', configurable: true, ...patch })
const card = (owner: string, id: string, order = 100, name = NAME): SlotContribution =>
  ({ kind: 'slot', owner, slot: name, id, order, priority: 0, options: {}, component })
const prefs = (patch: Partial<UiPrefs> = {}): UiPrefs => ({ ...NO_PREFS, ...patch })
const plugin = (name: string, state: PluginStatus['state'] = 'active'): PluginStatus => ({
  id: name, name, state, disabled: state === 'disposed', manifest: {}, missingDeps: [], reloadCount: 0,
  service: { required: [], optional: [], implements: [] },
})

function apply(stored: UiPrefs, patch: UiPrefsPatch): UiPrefs {
  const order = { ...stored.order }
  for (const [key, value] of Object.entries(patch.order ?? {})) {
    if (value === null) delete order[key]
    else order[key] = value
  }
  return {
    ...stored, order,
    hidden: [...new Set([...stored.hidden, ...patch.hide ?? []])].filter(key => !patch.show?.includes(key)),
  }
}

describe('configurable slot layouts', () => {
  it('only offers list slots explicitly opted in by the plugin opening its configuration', () => {
    const own = declaration()
    const contributions: Contribution[] = [
      own, declaration({ name: 'unconfigured', configurable: undefined }),
      declaration({ name: 'disabled', configurable: false }),
      declaration({ name: 'single', cardinality: 'single' }),
      declaration({ name: 'keyed', cardinality: 'keyed' }),
      declaration({ name: 'chain', cardinality: 'chain' }),
      declaration({ owner: 'other', name: 'other.cards' }), card(OWNER, 'own'),
    ]
    expect(configurableSlots(contributions, OWNER)).toEqual([own])
    expect(configurableSlots(contributions, 'unknown')).toEqual([])
  })

  it('includes hidden cards, enabled providers and its disabled owner, in the same order used for rendering', () => {
    const own = card(OWNER, 'uptime', 1)
    const hidden = card('online', 'hidden', 10)
    const waiting = card('pending', 'waiting', 20)
    const failed = card('failed', 'failed', 30)
    const disabled = card('off', 'disabled', 0)
    const unknown = card('removed', 'unknown', 0)
    const foreign = card('online', 'elsewhere', 0, 'other.cards')
    const contributions = [declaration(), own, hidden, waiting, failed, disabled, unknown, foreign]
    const plugins = [plugin(OWNER, 'disposed'), plugin('online'), plugin('pending', 'pending'), plugin('failed', 'failed'), plugin('off', 'disposed')]
    const stored = prefs({ hidden: [contributionKey(hidden)], order: { [contributionKey(failed)]: -1 } })
    expect(layoutContributions(contributions, plugins, NAME, stored)).toEqual([failed, own, hidden, waiting])
    const allRunning = plugins.map(entry => ({ ...entry, state: 'active' as const, disabled: false }))
    expect(layoutContributions(contributions, allRunning, NAME))
      .toEqual(slotContents(contributions, activeOwners(allRunning), NAME))
    expect(layoutContributions(contributions, null, NAME)).toEqual([])
    expect(layoutContributions(contributions, plugins, 'missing')).toEqual([])
    expect(layoutContributions([declaration({ cardinality: 'single' }), own], plugins, NAME)).toEqual([])
  })

  it('keeps untouched default and tied positions, moving only what is needed on the existing order axis', () => {
    const [a, b, c, d] = [card('a', 'a', 0), card('b', 'b', 10), card('c', 'c', 20), card('d', 'd', 30)]
    expect(slotLayoutPatch(NAME, [a, b, c, d], new Set(), NO_PREFS)).toEqual({})
    const changed = slotLayoutPatch(NAME, [a, c, b, d], new Set(), NO_PREFS)
    expect(changed).toEqual({ order: { [contributionKey(b)]: 25 } })
    const saved = apply(NO_PREFS, changed)
    const later = card('later', 'card', 15)
    expect(slotContributions([declaration(), a, b, c, d, later], NAME, saved)).toEqual([a, later, c, b, d])
    expect(slotLayoutPatch(NAME, [a, b, c, d], new Set(), prefs({ order: { [contributionKey(d)]: -10 } })))
      .toEqual({ order: { [contributionKey(d)]: null } })
    const tied = [card('same', 'a'), card('same', 'b'), card('same', 'c')]
    expect(slotLayoutPatch(NAME, tied, new Set(), NO_PREFS)).toEqual({})
    for (const rows of [[tied[0], tied[2], tied[1]], [tied[2], tied[0], tied[1]], [...tied].reverse()]) {
      const reordered = apply(NO_PREFS, slotLayoutPatch(NAME, rows, new Set(), NO_PREFS))
      expect(slotContributions([declaration(), ...tied], NAME, reordered)).toEqual(rows)
    }
  })

  it('changes only the rows being edited, preserving other slots, pages and absent cards', () => {
    const a = card('a', 'a', 1)
    const b = card('b', 'b', 2)
    const absent = contributionKey(card('off', 'absent'))
    const foreign = card('other', 'foreign', 5, 'other.cards')
    const page = 'other|page|settings'
    const stored = prefs({
      hidden: [contributionKey(a), absent, contributionKey(foreign), page],
      order: { [absent]: 88, [contributionKey(foreign)]: 6, [page]: 7 },
    })
    const original = structuredClone(stored)
    const patch = slotLayoutPatch(NAME, [a, b, foreign], new Set([contributionKey(b), page]), stored)
    expect(patch).toEqual({ hide: [contributionKey(b)], show: [contributionKey(a)] })
    const saved = apply(stored, patch)
    expect(saved.order).toEqual(stored.order)
    expect(saved.hidden).toEqual([absent, contributionKey(foreign), page, contributionKey(b)])
    expect(stored).toEqual(original)
  })

  it('resets the whole named slot, including absent cards, without touching a similarly named slot or pages', () => {
    const a = card('a', 'a', 1)
    const b = card('b', 'b', 2)
    const absent = contributionKey(card('off', 'absent'))
    const foreign = contributionKey(card('other', 'foreign', 5, 'dashboard.cards.extra'))
    const page = 'other|page|settings'
    const stored = prefs({
      hidden: [contributionKey(a), absent, foreign, page],
      order: { [contributionKey(a)]: 50, [absent]: 88, [foreign]: 6, [page]: 7 },
    })
    // Stale hidden keys for absent cards cannot survive a reset.
    const patch = slotLayoutPatch(NAME, [a, b], new Set([absent]), stored, true)
    expect(patch).toEqual({ order: { [contributionKey(a)]: null, [absent]: null }, show: [contributionKey(a), absent] })
    expect(apply(stored, patch)).toEqual(prefs({ hidden: [foreign, page], order: { [foreign]: 6, [page]: 7 } }))
    // Reset then make a new choice: hidden/order changes use defaults as their base.
    const edited = slotLayoutPatch(NAME, [b, a], new Set([contributionKey(b)]), stored, true)
    const saved = apply(stored, edited)
    expect(slotContributions([declaration(), a, b], NAME, saved)).toEqual([b, a])
    expect(saved.hidden).toEqual([foreign, page, contributionKey(b)])
    expect(saved.order[absent]).toBeUndefined()
  })

  it('can clear old choices even when no card currently exists', () => {
    const key = 'removed|dashboard.cards|old'
    const stored = prefs({ hidden: [key], order: { [key]: 5 } })
    expect(slotLayoutPatch(NAME, [], new Set(), stored)).toEqual({})
    expect(slotLayoutPatch(NAME, [], new Set(), stored, true)).toEqual({ order: { [key]: null }, show: [key] })
  })
})
