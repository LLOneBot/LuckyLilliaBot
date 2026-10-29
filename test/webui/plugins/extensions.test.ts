import { describe, expect, it } from 'vitest'
import { moved, orderable, orphans, slotGroups, webuiPackages } from '@/plugin/internal/service/webui/FE/components/plugins/extensions'
import { Contribution, contributionKey, NO_PREFS, SlotContribution, WEBUI } from '@/plugin/internal/service/webui/FE/plugin-host/registry'
import { PluginStatus } from '@/plugin/internal/service/webui/FE/types/plugins'

const Component = () => null
const slot = (owner: string, name: string, id: string, priority = 0): SlotContribution =>
  ({ kind: 'slot', owner, slot: name, id, order: 100, priority, options: {}, component: Component })

function status(name: string, state: PluginStatus['state'], extra: Partial<PluginStatus> = {}): PluginStatus {
  return {
    id: `${name}-${state}`, name, manifest: {}, disabled: state === 'disposed', state, missingDeps: [], reloadCount: 0,
    service: { required: [], optional: [], implements: [] }, ...extra,
  }
}

describe('the plugin page view of WebUI extensions', () => {
  const header = slot('a', 'dashboard.header', 'header')
  const fancy = slot('b', 'dashboard.header', 'fancy', 5)
  const card = slot('a', 'dashboard.cards', 'card')
  const stopped = slot('off', 'dashboard.cards', 'card')
  const action = slot('a', 'chat.actions', 'copy')
  const contributions: Contribution[] = [
    { kind: 'declaration', owner: WEBUI, name: 'dashboard.header', title: 'Header', cardinality: 'single' },
    { kind: 'declaration', owner: WEBUI, name: 'dashboard.cards', title: 'Cards', cardinality: 'list' },
    { kind: 'declaration', owner: 'off', name: 'chat.actions', title: 'Actions', cardinality: 'list' },
    header, fancy, card, stopped, action,
    slot('a', 'missing.slot', 'lost'),
  ]
  const plugins = [status('a', 'active'), status('b', 'active'), status('off', 'disposed')]

  it('says for every contribution whether it shows, and why not', () => {
    const prefs = { ...NO_PREFS, hidden: [contributionKey(card)], order: { [contributionKey(stopped)]: 0 } }
    const failures = { [contributionKey(fancy)]: { owner: 'b', where: 'Header「fancy」', message: 'boom' } }
    const groups = slotGroups(contributions, plugins, prefs, failures)
    expect(groups.map(group => [group.declaration.name, group.live, group.reordered])).toEqual([
      ['dashboard.header', true, false],
      ['dashboard.cards', true, true],
      // Declared by a plugin that is off: the slot is not on screen
      ['chat.actions', false, false],
    ])
    expect(groups[0].rows.map(row => [row.contribution.id, row.state, row.failure?.message])).toEqual([
      ['fancy', 'shown', 'boom'],
      ['header', 'shadowed', undefined],
    ])
    expect(groups[1].rows.map(row => [row.contribution.owner, row.state])).toEqual([['off', 'inactive'], ['a', 'hidden']])
  })

  it('tells the winner of each key in a keyed slot from those it shadows and those without a key', () => {
    const keyed: Contribution[] = [
      { kind: 'declaration', owner: 'builtin:webqq', name: 'webqq.message.element', title: 'Elements', cardinality: 'keyed' },
      { ...slot('a', 'webqq.message.element', 'markdown'), match: '14' },
      { ...slot('b', 'webqq.message.element', 'better-markdown', 5), match: '14' },
      { ...slot('b', 'webqq.message.element', 'ark'), match: '10' },
      slot('a', 'webqq.message.element', 'no-key'),
    ]
    const [group] = slotGroups(keyed, [...plugins, status('builtin:webqq', 'active')], NO_PREFS, {})
    expect(group.rows.map(row => [row.contribution.id, row.state])).toEqual([
      ['no-key', 'unmatched'],
      ['ark', 'shown'],
      ['better-markdown', 'shown'],
      ['markdown', 'shadowed'],
    ])
    expect(orderable(group.declaration)).toBe(false)
  })

  it('lists contributions to slots nobody declares', () => {
    expect(orphans(contributions).map(c => c.id)).toEqual(['lost'])
  })

  it('moves a list row by renumbering the whole slot', () => {
    const rows = slotGroups(contributions, plugins, NO_PREFS, {})[1].rows
    expect(rows.map(row => row.contribution)).toEqual([card, stopped])
    expect(moved(rows, 1, -1)).toEqual({ [contributionKey(stopped)]: 0, [contributionKey(card)]: 10 })
    expect(moved(rows, 0, -1)).toEqual({})
    expect(moved(rows, 1, 1)).toEqual({})
  })

  it('lists each package bringing a WebUI module once, those to approve first', () => {
    const packages = webuiPackages([
      status('ok', 'active', { webui: '/plugin-webui/ok/0/index.js', webuiApproved: true }),
      status('new', 'disposed', { webui: '/plugin-webui/new/0/index.js', webuiApproved: false }),
      status('new', 'active', { webui: '/plugin-webui/new/0/index.js', webuiApproved: false }),
      status('plain', 'active'),
      status('builtin:webqq', 'active', { builtin: true }),
    ])
    expect(packages.map(plugin => plugin.name)).toEqual(['new', 'ok'])
  })
})
