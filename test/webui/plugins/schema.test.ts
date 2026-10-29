import Schema from 'schemastery'
import { describe, expect, it } from 'vitest'
import { classifyUnion, hydrate, localize, mergeIntersect, SchemaNode } from '@/plugin/internal/service/webui/FE/components/plugins/schema/model'
import { initialValue, stripDefaults, withDefaults } from '@/plugin/internal/service/webui/FE/components/plugins/schema/values'

const wire = (schema: Schema) => hydrate(JSON.parse(JSON.stringify(schema)))

describe('hydrate', () => {
  it('links children by uid', () => {
    const node = wire(Schema.object({
      list: Schema.array(Schema.natural()),
      map: Schema.dict(Schema.boolean()),
      mode: Schema.union(['a', 'b']).default('a'),
    }))
    expect(node.type).toBe('object')
    expect(node.dict!.list.inner).toMatchObject({ type: 'number', meta: { min: 0, step: 1 } })
    expect(node.dict!.map.inner!.type).toBe('boolean')
    expect(node.dict!.mode.list!.map(member => member.value)).toEqual(['a', 'b'])
  })

  it('terminates on self-referencing lazy schemas', () => {
    interface Tree { name: string; children: Tree[] }
    const Tree: Schema<Tree> = Schema.lazy(() => Schema.object({ name: Schema.string(), children: Schema.array(Tree) }))
    const node = wire(Tree)
    expect(node.dict!.children.inner).toBe(node)
  })
})

describe('classifyUnion', () => {
  const kind = (schema: Schema) => classifyUnion(wire(schema)).kind

  it('tells the union shapes apart', () => {
    expect(kind(Schema.union([Schema.const('full').description('完全'), 'contains']))).toBe('select')
    expect(kind(Schema.union([Schema.const(false), Schema.object({ url: Schema.string() })]))).toBe('toggle')
    expect(kind(Schema.union([Schema.string(), Schema.const(null)]))).toBe('optional')
    expect(kind(Schema.date())).toBe('single')
    expect(kind(Schema.union([Schema.string(), Schema.number()]))).toBe('json')
  })

  it('finds the discriminator of a tagged union', () => {
    const view = classifyUnion(wire(Schema.union([
      Schema.object({ type: Schema.const('ws'), port: Schema.natural() }).description('WebSocket'),
      Schema.object({ type: Schema.const('http'), url: Schema.string() }),
    ])))
    expect(view).toMatchObject({ kind: 'tagged', key: 'type' })
    if (view.kind !== 'tagged') throw new Error('not tagged')
    expect(view.branches.map(branch => [branch.value, branch.label])).toEqual([['ws', 'WebSocket'], ['http', 'http']])
  })

  it('uses const descriptions as select labels', () => {
    const view = classifyUnion(wire(Schema.union([Schema.const('full').description('完全匹配'), Schema.const('regex')])))
    expect(view).toEqual({ kind: 'select', options: [{ value: 'full', label: '完全匹配' }, { value: 'regex', label: 'regex' }] })
  })
})

describe('mergeIntersect', () => {
  it('flattens an intersection of objects', () => {
    const merged = mergeIntersect(wire(Schema.intersect([
      Schema.object({ a: Schema.string() }),
      Schema.object({ b: Schema.number() }),
    ])))
    expect(Object.keys(merged!.dict!)).toEqual(['a', 'b'])
  })

  it('refuses anything else', () => {
    expect(mergeIntersect(wire(Schema.intersect([Schema.object({ a: Schema.string() }), Schema.string()])))).toBeUndefined()
  })
})

describe('localize', () => {
  it('reads plain and i18n descriptions', () => {
    expect(localize('plain')).toBe('plain')
    expect(localize(wire(Schema.string().description('d').i18n({ 'zh-CN': '中文' })).meta.description)).toBe('中文')
    expect(localize({ '': 'fallback' })).toBe('fallback')
    expect(localize(undefined)).toBeUndefined()
  })
})

describe('default handling', () => {
  const Config = Schema.object({
    prefix: Schema.string().default('echo '),
    cooldown: Schema.natural().role('ms').default(3000),
    nested: Schema.object({ enabled: Schema.boolean().default(true), list: Schema.array(String).default([]) }),
  })
  const defaults = new Config()
  const node = wire(Config)

  it('shows the defaults for whatever the user left unset', () => {
    expect(withDefaults(node, { prefix: '!' }, defaults)).toEqual({
      prefix: '!',
      cooldown: 3000,
      nested: { enabled: true, list: [] },
    })
    expect(withDefaults(node, null, defaults)).toEqual(defaults)
  })

  it('stores only what differs from the defaults', () => {
    expect(stripDefaults(node, withDefaults(node, { prefix: '!' }, defaults), defaults)).toEqual({ prefix: '!' })
    expect(stripDefaults(node, { ...defaults, nested: { enabled: false, list: [] } }, defaults)).toEqual({ nested: { enabled: false } })
    expect(stripDefaults(node, defaults, defaults)).toBeUndefined()
    expect(stripDefaults(node, { ...defaults, nested: { enabled: true, list: ['x'] } }, defaults)).toEqual({ nested: { list: ['x'] } })
  })

  it('starts new items from their schema', () => {
    const node: SchemaNode = wire(Schema.array(Schema.object({
      pattern: Schema.string().required(),
      mode: Schema.union(['contains', 'full']).default('contains'),
      weight: Schema.percent().default(1),
    })))
    expect(initialValue(node.inner!)).toEqual({ pattern: '', mode: 'contains', weight: 1 })
    expect(initialValue(wire(Schema.union([
      Schema.object({ type: Schema.const('ws'), port: Schema.natural().default(3001) }),
      Schema.object({ type: Schema.const('http') }),
    ])))).toEqual({ type: 'ws', port: 3001 })
  })
})
