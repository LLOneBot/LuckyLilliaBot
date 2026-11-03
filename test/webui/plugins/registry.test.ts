import { describe, expect, it } from 'vitest'
import {
  activeOwners, arrangePages, configEditorOf, Contribution, contributionKey, fieldRendererOf, isPageKey, NO_PREFS,
  pageContributionKey, PageContribution, pagePosition, rejection, sidebarPatch, slotContents, SlotContribution, slotMatches,
  useRegistry, visiblePages, WEBUI,
} from '@/plugin/internal/service/webui/FE/plugin-host/registry'
import { PluginStatus, UiPrefs } from '@/plugin/internal/service/webui/FE/types/plugins'

const Component = () => null
const page = (owner: string, key: string, title: string, order = 100, settings = false): PageContribution =>
  ({ kind: 'page', owner, key, title, order, settings, component: Component })
const declare = (name: string, cardinality: 'list' | 'single' | 'keyed' | 'chain', owner = 'webui'): Contribution =>
  ({ kind: 'declaration', owner, name, title: name, cardinality })
const slot = (owner: string, name: string, id: string, extra: Partial<Pick<SlotContribution, 'order' | 'priority' | 'match'>> = {}): SlotContribution =>
  ({ kind: 'slot', owner, slot: name, id, order: extra.order ?? 100, priority: extra.priority ?? 0, match: extra.match, options: {}, component: Component })
const prefs = (patch: Partial<UiPrefs>): UiPrefs => ({ ...NO_PREFS, ...patch })

const keysOf = (contributions: Contribution[], match: string) => contributions
  .filter((c): c is SlotContribution => c.kind === 'slot' && c.match === match)
  .map(contributionKey)

function status(name: string, state: PluginStatus['state']): PluginStatus {
  return {
    id: name, name, manifest: {}, disabled: state === 'disposed', state, missingDeps: [], reloadCount: 0,
    service: { required: [], optional: [], implements: [] },
  }
}

describe('plugin UI registry', () => {
  it('lists the pages of enabled plugins whatever their state, and slot contents of running ones only', () => {
    const contributions: Contribution[] = [
      page('b', 'b:stats', 'Stats'),
      page('a', 'a:home', 'Home'),
      page('builtin:webqq', 'webqq', 'WebQQ', 0),
      page('stopped', 'stopped:x', 'X'),
      page('builtin:satori', 'satori', 'Satori', 11, true),
      page('builtin:milky', 'milky', 'Milky', 12, true),
      declare('dashboard.cards', 'list'),
      slot('b', 'dashboard.cards', 'stats'),
      slot('a', 'dashboard.cards', 'clicks', { order: 50 }),
      slot('stopped', 'dashboard.cards', 'x', { order: 0 }),
      slot('a', 'nobody.declares', 'lost'),
    ]
    const plugins = [
      status('a', 'active'), status('b', 'active'), status('builtin:webqq', 'active'), status('stopped', 'pending'),
      status('builtin:satori', 'failed'), status('builtin:milky', 'disposed'),
    ]
    const active = activeOwners(plugins)
    // A waiting or failing plugin keeps its pages in the sidebar (they say why it does not run); a disabled one only
    // keeps them openable
    expect(visiblePages(contributions, plugins).map(p => p.key)).toEqual(['webqq', 'satori', 'a:home', 'b:stats', 'stopped:x'])
    expect(visiblePages(contributions, plugins, 'open').map(p => p.key))
      .toEqual(['webqq', 'satori', 'milky', 'a:home', 'b:stats', 'stopped:x'])
    // Before the list loads, every plugin counts as enabled
    expect(visiblePages(contributions, null).map(p => p.key)).toEqual(['webqq', 'satori', 'milky', 'a:home', 'b:stats', 'stopped:x'])
    expect(slotContents(contributions, active, 'dashboard.cards').map(s => s.owner)).toEqual(['a', 'b'])
    // Waits for someone to declare it
    expect(slotContents(contributions, active, 'nobody.declares')).toEqual([])
  })

  it('leaves out what the user hid and puts list contributions in the order they chose', () => {
    const home = page('a', 'a:home', 'Home')
    const contributions: Contribution[] = [
      home,
      declare('dashboard.cards', 'list'),
      slot('a', 'dashboard.cards', 'first', { order: 1 }),
      slot('b', 'dashboard.cards', 'second', { order: 2 }),
      slot('c', 'dashboard.cards', 'third', { order: 3 }),
    ]
    const [, , first, second, third] = contributions as SlotContribution[]
    const plugins = [status('a', 'active'), status('b', 'active'), status('c', 'active')]
    const active = activeOwners(plugins)
    const ids = (p: UiPrefs) => slotContents(contributions, active, 'dashboard.cards', p).map(s => s.id)
    expect(ids(prefs({ hidden: [contributionKey(second)] }))).toEqual(['first', 'third'])
    // A position the user set replaces the contribution's own; one without keeps its own, on the same scale
    expect(ids(prefs({ order: { [contributionKey(third)]: 0, [contributionKey(first)]: 10 } }))).toEqual(['third', 'second', 'first'])
    expect(ids(prefs({ order: { [contributionKey(first)]: 2.5 } }))).toEqual(['second', 'first', 'third'])
    // A hidden page leaves the sidebar but still opens
    const hidden = prefs({ hidden: [pageContributionKey(home)] })
    expect(visiblePages(contributions, plugins, 'sidebar', hidden)).toEqual([])
    expect(visiblePages(contributions, plugins, 'open', hidden)).toEqual([home])
  })

  it('shows one contribution of a single slot, the highest priority the user did not hide', () => {
    const contributions: Contribution[] = [
      declare('dashboard.header', 'single'),
      slot('a', 'dashboard.header', 'plain', { priority: 0 }),
      slot('b', 'dashboard.header', 'fancy', { priority: 10 }),
      slot('stopped', 'dashboard.header', 'top', { priority: 99 }),
    ]
    const [, plain, fancy] = contributions as SlotContribution[]
    const active = activeOwners([status('a', 'active'), status('b', 'active'), status('stopped', 'disposed')])
    const ids = (p: UiPrefs) => slotContents(contributions, active, 'dashboard.header', p).map(s => s.id)
    expect(ids(NO_PREFS)).toEqual(['fancy'])
    expect(ids(prefs({ hidden: [contributionKey(fancy)] }))).toEqual(['plain'])
    // Nothing left: the WebUI's own content shows
    expect(ids(prefs({ hidden: [contributionKey(fancy), contributionKey(plain)] }))).toEqual([])
  })

  it('draws a keyed slot key by key, the highest priority the user did not hide for each', () => {
    const contributions: Contribution[] = [
      declare('webqq.message.element', 'keyed'),
      slot('a', 'webqq.message.element', 'markdown', { match: '14' }),
      slot('b', 'webqq.message.element', 'fancy-markdown', { match: '14', priority: 5 }),
      slot('a', 'webqq.message.element', 'ark', { match: '10' }),
      slot('stopped', 'webqq.message.element', 'face', { match: '6' }),
      slot('a', 'webqq.message.element', 'lost'),
    ]
    const [, , fancy] = contributions as SlotContribution[]
    const active = activeOwners([status('a', 'active'), status('b', 'active'), status('stopped', 'disposed')])
    const ids = (match: string | undefined, p = NO_PREFS) => slotContents(contributions, active, 'webqq.message.element', p, match).map(s => s.id)
    expect(ids('14')).toEqual(['fancy-markdown'])
    expect(ids('14', prefs({ hidden: [contributionKey(fancy)] }))).toEqual(['markdown'])
    expect(ids('10')).toEqual(['ark'])
    // The slot draws the rest itself: a stopped plugin's key, one nobody draws, no key at all
    expect(ids('6')).toEqual([])
    expect(ids('1')).toEqual([])
    expect(ids(undefined)).toEqual([])
    expect(slotMatches(contributions, active, 'webqq.message.element').sort()).toEqual(['10', '14'])
    expect(slotMatches(contributions, active, 'webqq.message.element', prefs({ hidden: keysOf(contributions, '10') }))).toEqual(['14'])
  })

  it('wraps a chain in order, the first outermost, in the order the user chose', () => {
    const contributions: Contribution[] = [
      declare('webqq.message.bubble', 'chain'),
      slot('a', 'webqq.message.bubble', 'inner', { order: 20 }),
      slot('b', 'webqq.message.bubble', 'outer', { order: 10 }),
      slot('stopped', 'webqq.message.bubble', 'off', { order: 0 }),
    ]
    const [, inner] = contributions as SlotContribution[]
    const active = activeOwners([status('a', 'active'), status('b', 'active'), status('stopped', 'disposed')])
    const ids = (p = NO_PREFS) => slotContents(contributions, active, 'webqq.message.bubble', p).map(s => s.id)
    expect(ids()).toEqual(['outer', 'inner'])
    expect(ids(prefs({ order: { [contributionKey(inner)]: 0 } }))).toEqual(['inner', 'outer'])
    expect(slotMatches(contributions, active, 'webqq.message.bubble')).toEqual([])
  })

  it('always lists the core pages, which nothing can hide', () => {
    const locked: PageContribution = { ...page(WEBUI, 'plugins', '插件', 40), locked: true }
    const about = page(WEBUI, 'about', '关于', 1000)
    const contributions: Contribution[] = [locked, about]
    // Hidden by the user, and with the WebUI's own entry not in the list
    const hidden = prefs({ hidden: [pageContributionKey(locked), pageContributionKey(about)] })
    expect(visiblePages(contributions, [], 'sidebar', hidden).map(p => p.key)).toEqual(['plugins'])
    expect(visiblePages(contributions, [status(WEBUI, 'active')], 'sidebar', hidden).map(p => p.key)).toEqual(['plugins'])
    expect(visiblePages(contributions, [status(WEBUI, 'active')]).map(p => p.key)).toEqual(['plugins', 'about'])
  })

  it('refuses contributions without an id or component, a repeated id and a slot declared twice', () => {
    const contributions: Contribution[] = [declare('dashboard.cards', 'list'), slot('a', 'dashboard.cards', 'card')]
    expect(rejection(contributions, slot('a', 'dashboard.cards', ''))).toMatch(/needs an id/)
    expect(rejection(contributions, { ...slot('a', 'dashboard.cards', 'other'), component: undefined as never })).toMatch(/no component/)
    expect(rejection(contributions, slot('a', 'dashboard.cards', 'card'))).toMatch(/used twice/)
    // The id only has to be unique within the plugin and the slot
    expect(rejection(contributions, slot('b', 'dashboard.cards', 'card'))).toBeUndefined()
    expect(rejection(contributions, slot('a', 'plugins.toolbar', 'card'))).toBeUndefined()
    expect(rejection(contributions, declare('dashboard.cards', 'list', 'b'))).toMatch(/declared by webui already/)
    expect(rejection(contributions, declare('b.things', 'many' as never, 'b'))).toMatch(/cardinality is one of list, single, keyed, chain/)
    expect(rejection(contributions, declare('b.things', 'list', 'b'))).toBeUndefined()
    expect(rejection(contributions, slot('a', 'dashboard.cards', 'keyed', { match: 14 as never }))).toMatch(/match of keyed is a string/)
    // Page keys are told from slot keys by it
    expect(rejection(contributions, declare('page', 'list', 'b'))).toMatch(/name is taken/)
    expect(isPageKey(pageContributionKey(page('a', 'a:home', 'Home')))).toBe(true)
    expect(isPageKey(contributionKey(slot('a', 'dashboard.cards', 'page')))).toBe(false)
  })

  it('puts a page where the user arranged it, else where its plugin did, on one axis', () => {
    const dashboard = page('builtin:dashboard', 'dashboard', 'Dashboard', 0)
    const logs = page('builtin:logs', 'logs', '日志', 20)
    const plugins = page(WEBUI, 'plugins', '插件', 40)
    const contributions: Contribution[] = [dashboard, logs, plugins]
    const keys = (p: UiPrefs, purpose: 'sidebar' | 'arrange' = 'sidebar', list: PluginStatus[] | null = null) =>
      visiblePages(contributions, list, purpose, p).map(page => page.key)
    expect(keys(NO_PREFS)).toEqual(['dashboard', 'logs', 'plugins'])
    expect(keys(prefs({ order: { [pageContributionKey(plugins)]: -10 } }))).toEqual(['plugins', 'dashboard', 'logs'])
    expect(pagePosition(logs, prefs({ order: { [pageContributionKey(logs)]: 50 } }))).toBe(50)
    expect(pagePosition(logs, NO_PREFS)).toBe(20)
    // Arranging lists the hidden pages too, but a disabled plugin's still not
    const hidden = prefs({ hidden: [pageContributionKey(logs)] })
    expect(keys(hidden)).toEqual(['dashboard', 'plugins'])
    expect(keys(hidden, 'arrange')).toEqual(['dashboard', 'logs', 'plugins'])
    const list = [status('builtin:dashboard', 'active'), status('builtin:logs', 'disposed'), status(WEBUI, 'active')]
    expect(keys(hidden, 'arrange', list)).toEqual(['dashboard', 'plugins'])
  })

  it('writes as few page positions as it can to arrange the sidebar', () => {
    const [a, b, c, d] = [page('a', 'a', 'A', 0), page('b', 'b', 'B', 10), page('c', 'c', 'C', 20), page('d', 'd', 'D', 30)]
    const key = pageContributionKey
    expect(arrangePages([a, b, c, d], NO_PREFS)).toEqual({})
    // The one moved gets a position between its new neighbors, the rest keep theirs
    expect(arrangePages([a, c, b, d], NO_PREFS)).toEqual({ [key(b)]: 25 })
    // Past either end, 10 further
    expect(arrangePages([d, a, b, c], NO_PREFS)).toEqual({ [key(d)]: -10 })
    expect(arrangePages([b, c, d, a], NO_PREFS)).toEqual({ [key(a)]: 40 })
    // Back where its plugin puts it: the stored position goes
    expect(arrangePages([a, b, c, d], prefs({ order: { [key(d)]: -10 } }))).toEqual({ [key(d)]: null })
  })

  it('leaves pages at the same position alone, and puts one between them by moving it alone', () => {
    // Third-party pages, all at the default position: their plugins' names order them
    const [p, q, r] = [page('p', 'p:x', 'P'), page('q', 'q:x', 'Q'), page('r', 'r:x', 'R')]
    const key = pageContributionKey
    expect(arrangePages([p, q, r], NO_PREFS)).toEqual({})
    expect(arrangePages([p, r, q], NO_PREFS)).toEqual({ [key(q)]: 110 })
    expect(arrangePages([q, p, r], NO_PREFS)).toEqual({ [key(q)]: 90 })
    for (const order of [[p, r, q], [q, p, r], [r, q, p], [q, r, p], [r, p, q]]) {
      // What is written sorts back into the order given
      const written = Object.entries(arrangePages(order, NO_PREFS)).filter((entry): entry is [string, number] => entry[1] !== null)
      expect(visiblePages([p, q, r], null, 'sidebar', prefs({ order: Object.fromEntries(written) }))).toEqual(order)
    }
  })

  it('saves the sidebar dialog as one patch, a reset dropping every stored page position and hiding', () => {
    const [a, b] = [page('a', 'a', 'A', 0), page('b', 'b', 'B', 10)]
    const gone = pageContributionKey(page('off', 'off:x', 'Off'))
    const card = contributionKey(slot('a', 'dashboard.cards', 'x'))
    const key = pageContributionKey
    expect(sidebarPatch([a, b], new Set(), NO_PREFS, false)).toEqual({})
    expect(sidebarPatch([b, a], new Set([key(a)]), NO_PREFS, false)).toEqual({ order: { [key(a)]: 20 }, hide: [key(a)] })
    expect(sidebarPatch([a, b], new Set(), prefs({ hidden: [key(b)] }), false)).toEqual({ show: [key(b)] })
    // A reset reaches a disabled plugin's page as well, and leaves what is not a page alone
    const stored = prefs({ hidden: [key(a), gone, card], order: { [key(a)]: 50, [gone]: 5, [card]: 1 } })
    expect(sidebarPatch([a, b], new Set(), stored, true)).toEqual({ order: { [key(a)]: null, [gone]: null }, show: [key(a), gone] })
  })

  it('declares the WebUI slots up front and throws on a rejected registration', () => {
    const { add, contributions } = useRegistry.getState()
    const names = contributions.filter(c => c.kind === 'declaration').map(c => (c as { name: string }).name)
    expect(names).toEqual(expect.arrayContaining(['plugins.toolbar', 'plugins.views', 'plugins.card.actions']))
    // The Dashboard's are its own plugin's now, and plugins say their notices on their own pages
    expect(names).not.toContain('dashboard.cards')
    expect(names).not.toContain('shell.notices')
    // Plugins' settings are on their cards, not in the WebUI's settings dialog
    expect(names).not.toContain('settings.sections')
    expect(() => add(declare('plugins.toolbar', 'list', 'intruder'))).toThrow(/declared by builtin:webui already/)
  })

  it('takes the latest config editor of a plugin and the latest renderer of a role', () => {
    const first = () => null
    const second = () => null
    const contributions: Contribution[] = [
      { kind: 'config', owner: 'a', component: first },
      { kind: 'config', owner: 'a', component: second },
      { kind: 'field', owner: 'a', role: 'color', component: first },
      { kind: 'field', owner: 'b', role: 'color', component: second },
    ]
    expect(configEditorOf(contributions, 'a')?.component).toBe(second)
    expect(configEditorOf(contributions, 'b')).toBeUndefined()
    expect(fieldRendererOf(contributions, 'color')?.owner).toBe('b')
    expect(fieldRendererOf(contributions, 'qq-group')).toBeUndefined()
  })

  it('drops a switched-off builtin from the sidebar but keeps its page openable', () => {
    const contributions: Contribution[] = [
      page('builtin:satori', 'satori', 'Satori', 11, true),
      page('third-party', 'third-party:settings', 'Third', 100, true),
    ]
    const plugins = [status('builtin:satori', 'disposed'), status('third-party', 'disposed')]
    // off: gone from the sidebar, same as any plugin; the card's "前往设置" still opens it (purpose 'open')
    expect(visiblePages(contributions, plugins).map(p => p.key)).toEqual([])
    expect(visiblePages(contributions, plugins, 'open').map(p => p.key)).toEqual(['satori', 'third-party:settings'])
  })

  it('removes exactly the contribution a disposer was returned for', () => {
    const { add } = useRegistry.getState()
    const contribution = page('a', 'a:home', 'Home')
    const other = page('a', 'a:home', 'Home')
    const dispose = add(contribution)
    add(other)
    dispose()
    const { contributions } = useRegistry.getState()
    expect(contributions).toContain(other)
    expect(contributions).not.toContain(contribution)
  })
})
