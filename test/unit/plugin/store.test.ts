import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { newEntryId, PluginStore } from '@/plugin/host/store'

const dir = mkdtempSync(path.join(os.tmpdir(), 'llbot-plugin-store-'))
let n = 0
const fresh = () => path.join(dir, `case-${n++}`, 'plugins.json')

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('PluginStore', () => {
  it('starts empty without a file', async () => {
    expect(await new PluginStore(fresh()).load()).toEqual({ data: { version: 1, entries: [] } })
  })

  it('round-trips entries and creates the directory', async () => {
    const file = fresh()
    const store = new PluginStore(file)
    const data = { version: 1 as const, hmr: true, entries: [{ id: 'a1b2c3d4', name: 'x', config: { n: 1 } }] }
    await store.save(data)
    expect(await new PluginStore(file).load()).toEqual({ data })
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })

  it('accepts hand-written JSON5 and drops malformed or duplicate entries', async () => {
    const file = fresh()
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, `{
      // added by hand
      entries: [
        { id: 'a', name: 'x' },
        { id: 'a', name: 'dupe' },
        { name: 'no id' },
        'garbage',
      ],
    }`)
    expect(await new PluginStore(file).load()).toEqual({ data: { version: 1, entries: [{ id: 'a', name: 'x' }] } })
  })

  it('keeps only well-formed UI preferences', async () => {
    const file = fresh()
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({
      entries: [],
      ui: { hidden: 'a|page|a:home', order: { 'a|dashboard.cards|x': 10, 'b|dashboard.cards|y': '1' } },
    }))
    expect((await new PluginStore(file).load()).data.ui).toEqual({ hidden: [], order: { 'a|dashboard.cards|x': 10 } })
  })

  it('persists retained raw configurations separately, normalizes scopes and forces them disabled', async () => {
    const file = fresh()
    const store = new PluginStore(file)
    await store.save({
      version: 1, entries: [{ id: 'active', name: 'current' }],
      retained: [
        { id: 'saved', name: 'removed', config: { secret: 'original-secret', nested: { value: [false, 0, ''] } },
          scope: { platforms: ['luckylillia'], users: { mode: 'allow', ids: ['luckylillia:123'] } } },
        { id: 'saved', name: 'duplicate' },
        { id: 'active', name: 'conflicting' },
        { id: 'builtin', name: 'builtin:commands' },
      ],
      messageOrder: ['active', 'saved'],
    })
    expect((await new PluginStore(file).load()).data).toEqual({
      version: 1, entries: [{ id: 'active', name: 'current' }], messageOrder: ['active'],
      retained: [{ id: 'saved', name: 'removed', disabled: true,
        config: { secret: 'original-secret', nested: { value: [false, 0, ''] } },
        scope: { platforms: ['ntqq'], users: { mode: 'allow', ids: ['ntqq:123'] } },
      }],
    })
  })

  it.each(['load', 'save'])('normalizes NTQQ selectors and command owners on %s, preserving third-party config', async (operation) => {
    const file = fresh()
    const store = new PluginStore(file)
    const data = { version: 1 as const, entries: [
      { id: 'a', name: '@luckylillia/example', config: { owners: ['luckylillia:U1'], platform: 'luckylillia' }, scope: {
        platforms: ['luckylillia', 'ntqq'], bots: ['luckylillia:10000'],
        users: { mode: 'deny' as const, ids: ['luckylillia:U1', 'qq:U1'] },
        guilds: { mode: 'allow' as const, ids: ['luckylillia:G1', 'G2'] },
      } },
      { id: 'b', name: 'builtin:commands', config: {
        owners: ['luckylillia:U1', 'qq:luckylillia:U2', 'U3', 'luckylillia-extra:U4'],
        aliases: [{ owner: 'luckylillia', command: 'hello', aliases: ['luckylillia:hello'] }],
      } },
    ] }
    if (operation === 'load') {
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(data))
    } else await store.save(data)
    const { data: loaded, error } = await store.load()
    expect(error).toBeUndefined()
    expect(loaded.entries[0]).toEqual({
      id: 'a', name: '@luckylillia/example', config: { owners: ['luckylillia:U1'], platform: 'luckylillia' }, scope: {
        platforms: ['ntqq'], bots: ['ntqq:10000'],
        users: { mode: 'deny', ids: ['ntqq:U1', 'qq:U1'] },
        guilds: { mode: 'allow', ids: ['ntqq:G1', 'G2'] },
      },
    })
    expect(loaded.entries[1].config).toEqual({
      owners: ['ntqq:U1', 'qq:luckylillia:U2', 'U3', 'luckylillia-extra:U4'],
      aliases: [{ owner: 'luckylillia', command: 'hello', aliases: ['luckylillia:hello'] }],
    })
    if (operation === 'load') expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(data)
    await store.save(loaded)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(loaded)
  })

  it.each([{ approved: [] }, { approved: ['ui'] }])('drops obsolete UI approvals while preserving entries and layout: $approved', async ({ approved }) => {
    const file = fresh()
    mkdirSync(path.dirname(file), { recursive: true })
    const entries = [{ id: 'a1b2c3d4', name: 'ui', disabled: true, config: { n: 2 } }]
    const prefs = { hidden: ['ui|page|ui:home'], order: { 'ui|dashboard.cards|x': 20 } }
    writeFileSync(file, JSON.stringify({ version: 1, entries, ui: { ...prefs, approved } }))

    const store = new PluginStore(file)
    const { data, error } = await store.load()
    expect(error).toBeUndefined()
    expect(data).toEqual({ version: 1, entries, ui: prefs })
    await store.save(data)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ version: 1, entries, ui: prefs })
  })

  it('keeps an unparsable file in place instead of moving it aside', async () => {
    const file = fresh()
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, '{ entries: [')
    const { data, error } = await new PluginStore(file).load()
    expect(data.entries).toEqual([])
    expect(error).toBeTruthy()
    expect(readFileSync(file, 'utf8')).toBe('{ entries: [') // left untouched for the user to fix
    expect(readdirSync(path.dirname(file)).some(name => name.includes('broken'))).toBe(false)
  })

  it('serializes concurrent saves so the last one wins', async () => {
    const file = fresh()
    const store = new PluginStore(file)
    await Promise.all([1, 2, 3].map(i => store.save({ version: 1, entries: [{ id: String(i), name: 'x' }] })))
    expect(JSON.parse(readFileSync(file, 'utf8')).entries).toEqual([{ id: '3', name: 'x' }])
  })
})

describe('newEntryId', () => {
  it('is eight hex chars and avoids taken ids', () => {
    const id = newEntryId(new Set())
    expect(id).toMatch(/^[0-9a-f]{8}$/)
    expect(newEntryId(new Set([id]))).not.toBe(id)
  })
})
