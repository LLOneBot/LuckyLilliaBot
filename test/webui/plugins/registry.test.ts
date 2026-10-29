import { describe, expect, it } from 'vitest'
import {
  activeOwners, configEditorOf, Contribution, contributionKey, fieldRendererOf, NO_PREFS, pageContributionKey,
  PageContribution, rejection, slotContents, SlotContribution, slotMatches, useRegistry, visiblePages, WEBUI,
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
  it('shows pages and slot contents of running plugins only, in order', () => {
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
    // A failing plugin keeps its settings page in the sidebar; a disabled one only keeps it openable
    expect(visiblePages(contributions, plugins).map(p => p.key)).toEqual(['webqq', 'satori', 'a:home', 'b:stats'])
    expect(visiblePages(contributions, plugins, 'open').map(p => p.key)).toEqual(['webqq', 'satori', 'milky', 'a:home', 'b:stats'])
    // Before the list loads, settings pages count as enabled
    expect(visiblePages(contributions, null).map(p => p.key)).toEqual(['satori', 'milky'])
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
    // Before the plugin list loads, and hidden by the user
    expect(visiblePages(contributions, null).map(p => p.key)).toEqual(['plugins'])
    const hidden = prefs({ hidden: [pageContributionKey(locked), pageContributionKey(about)] })
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
    expect(rejection(contributions, slot('a', 'shell.notices', 'card'))).toBeUndefined()
    expect(rejection(contributions, declare('dashboard.cards', 'list', 'b'))).toMatch(/declared by webui already/)
    expect(rejection(contributions, declare('b.things', 'many' as never, 'b'))).toMatch(/cardinality is one of list, single, keyed, chain/)
    expect(rejection(contributions, declare('b.things', 'list', 'b'))).toBeUndefined()
    expect(rejection(contributions, slot('a', 'dashboard.cards', 'keyed', { match: 14 as never }))).toMatch(/match of keyed is a string/)
  })

  it('declares the WebUI slots up front and throws on a rejected registration', () => {
    const { add, contributions } = useRegistry.getState()
    const names = contributions.filter(c => c.kind === 'declaration').map(c => (c as { name: string }).name)
    expect(names).toEqual(expect.arrayContaining(['shell.notices', 'settings.sections', 'plugins.toolbar', 'plugins.card.actions']))
    // The Dashboard's are its own plugin's now
    expect(names).not.toContain('dashboard.cards')
    expect(() => add(declare('shell.notices', 'list', 'intruder'))).toThrow(/declared by builtin:webui already/)
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
