import { describe, expect, it } from 'vitest'
import {
  filterPlugins, groupByCategory, needsAttention, pageNumbers, paginate, pluginCategory, sortPlugins,
} from '@/plugin/internal/service/webui/FE/components/plugins/listing'
import { PluginStatus } from '@/plugin/internal/service/webui/FE/types/plugins'

function entry(name: string, overrides: Partial<PluginStatus> = {}, category?: string): PluginStatus {
  return {
    id: name,
    name,
    manifest: category ? { category } : {},
    disabled: false,
    state: 'active',
    missingDeps: [],
    reloadCount: 0,
    service: { required: [], optional: [], implements: [] },
    ...overrides,
  }
}

const names = (plugins: PluginStatus[]) => plugins.map(plugin => plugin.name)

describe('plugin listing', () => {
  it('lists the protocol category first, builtins in the bot order, the rest by name', () => {
    const plugins = [
      entry('builtin:webqq', { builtin: true }, 'tool'),
      entry('zeta-reply', {}, 'chat'),
      entry('builtin:qq-official', { builtin: true }, 'protocol'),
      entry('alpha-reply', {}, 'chat'),
      entry('builtin:onebot11', { builtin: true }, 'adapter'),
      entry('telegram', {}, 'protocol'),
      entry('builtin:nt-protocol', { builtin: true }, 'protocol'),
      entry('uncategorized'),
      entry('db-driver', {}, 'service'),
    ]
    expect(names(sortPlugins(plugins))).toEqual([
      'builtin:qq-official', 'builtin:nt-protocol', 'telegram',
      'builtin:onebot11',
      'alpha-reply', 'zeta-reply',
      'builtin:webqq',
      'db-driver',
      'uncategorized',
    ])
  })

  it('lists an unknown category under other', () => {
    expect(pluginCategory(entry('a', {}, 'games'))).toBe('other')
    expect(pluginCategory(entry('b'))).toBe('other')
    expect(pluginCategory(entry('c', {}, 'adapter'))).toBe('adapter')
  })

  it('filters by state and by words in the title, the name or the description', () => {
    const plugins = [
      entry('echo', { manifest: { description: { zh: '复读前缀后面的内容' } } }),
      entry('off', { disabled: true, state: 'disposed' }),
      entry('broken', { state: 'failed', error: 'x' }),
      entry('waiting', { state: 'pending', missingDeps: ['account'] }),
      entry('builtin:qq-official', { builtin: true, title: 'QQ 官方机器人', notice: '还没有填写 AppID 和 AppSecret' }),
    ]
    expect(names(filterPlugins(plugins, { status: 'disabled', search: '' }))).toEqual(['off'])
    expect(names(filterPlugins(plugins, { status: 'attention', search: '' }))).toEqual(['broken', 'waiting', 'builtin:qq-official'])
    expect(names(filterPlugins(plugins, { status: 'all', search: '复读' }))).toEqual(['echo'])
    expect(names(filterPlugins(plugins, { status: 'all', search: '官方' }))).toEqual(['builtin:qq-official'])
    expect(needsAttention(entry('gone', { disabled: true, state: 'missing' }))).toBe(true)
  })

  it('pages, keeping the page in range, and groups runs of a category', () => {
    const plugins = Array.from({ length: 13 }, (_, index) => entry(`p${index}`, {}, index < 2 ? 'protocol' : 'chat'))
    expect(paginate(plugins, 2, 12)).toMatchObject({ page: 2, pages: 2, items: [plugins[12]] })
    expect(paginate(plugins, 9, 12).page).toBe(2)
    expect(paginate([], 3, 12)).toEqual({ items: [], page: 1, pages: 1 })
    expect(groupByCategory(plugins.slice(0, 4)).map(group => [group.category, group.plugins.length])).toEqual([['protocol', 2], ['chat', 2]])
  })

  it('shows every page number up to seven, else the ends and the neighbours', () => {
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3])
    expect(pageNumbers(5, 10)).toEqual([1, null, 4, 5, 6, null, 10])
    expect(pageNumbers(1, 10)).toEqual([1, 2, null, 10])
    expect(pageNumbers(10, 10)).toEqual([1, null, 9, 10])
  })
})
