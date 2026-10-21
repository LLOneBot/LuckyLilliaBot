import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import path from 'node:path'
import { JsonFile } from '@/common/jsonFile'

interface Doc {
  version: 1
  items: string[]
}

const defaults = (): Doc => ({ version: 1, items: [] })

describe('JsonFile', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'jsonfile-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns the default when the file is missing', async () => {
    const jf = new JsonFile<Doc>(path.join(dir, 'nested', 'doc.json'), { defaultValue: defaults })
    const { data, error } = await jf.read()
    expect(error).toBeUndefined()
    expect(data).toEqual({ version: 1, items: [] })
  })

  it('writes atomically, creating parent dirs, and reads back', async () => {
    const file = path.join(dir, 'nested', 'doc.json')
    const jf = new JsonFile<Doc>(file, { defaultValue: defaults })
    await jf.write({ version: 1, items: ['a', 'b'] })
    expect(existsSync(file)).toBe(true)
    const raw = await readFile(file, 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    const again = await new JsonFile<Doc>(file, { defaultValue: defaults }).read()
    expect(again.data).toEqual({ version: 1, items: ['a', 'b'] })
  })

  it('tolerates JSON5 (comments / trailing commas) on read', async () => {
    const file = path.join(dir, 'doc5.json')
    await writeFile(file, '{ /* hi */ version: 1, items: ["x",], }', 'utf8')
    const { data, error } = await new JsonFile<Doc>(file, { defaultValue: defaults }).read()
    expect(error).toBeUndefined()
    expect(data).toEqual({ version: 1, items: ['x'] })
  })

  it('applies normalize() to shape parsed JSON', async () => {
    const file = path.join(dir, 'shape.json')
    await writeFile(file, '{"version":1,"items":"not-an-array","junk":true}', 'utf8')
    const jf = new JsonFile<Doc>(file, {
      defaultValue: defaults,
      normalize: (raw) => {
        const o = (raw ?? {}) as Partial<Doc>
        return { version: 1, items: Array.isArray(o.items) ? o.items : [] }
      },
    })
    const { data } = await jf.read()
    expect(data).toEqual({ version: 1, items: [] })
  })

  it('keeps the broken file in place and returns the last good value', async () => {
    const file = path.join(dir, 'doc.json')
    const jf = new JsonFile<Doc>(file, { defaultValue: defaults })
    await jf.write({ version: 1, items: ['good'] })
    await writeFile(file, '{ this is not json', 'utf8')
    const { data, error } = await jf.read()
    expect(error).toBeTruthy()
    expect(data).toEqual({ version: 1, items: ['good'] }) // last good, not default
    expect(await readFile(file, 'utf8')).toBe('{ this is not json') // left untouched
    const names = await readdir(dir)
    expect(names.some((n) => n.includes('broken'))).toBe(false) // no file moved aside
  })

  it('falls back to the default when the first read is already broken', async () => {
    const file = path.join(dir, 'bad.json')
    await writeFile(file, 'nonsense{', 'utf8')
    const { data, error } = await new JsonFile<Doc>(file, { defaultValue: defaults }).read()
    expect(error).toBeTruthy()
    expect(data).toEqual({ version: 1, items: [] })
  })

  it('serializes concurrent writes so the last one wins on disk', async () => {
    const file = path.join(dir, 'doc.json')
    const jf = new JsonFile<Doc>(file, { defaultValue: defaults })
    await Promise.all([
      jf.write({ version: 1, items: ['1'] }),
      jf.write({ version: 1, items: ['2'] }),
      jf.write({ version: 1, items: ['3'] }),
    ])
    const { data } = await new JsonFile<Doc>(file, { defaultValue: defaults }).read()
    expect(data).toEqual({ version: 1, items: ['3'] })
  })

  it('detects its own write for watcher self-write suppression', async () => {
    const file = path.join(dir, 'doc.json')
    const jf = new JsonFile<Doc>(file, { defaultValue: defaults })
    await jf.write({ version: 1, items: ['z'] })
    const raw = await readFile(file, 'utf8')
    expect(jf.wasSelfWrite(raw)).toBe(true)
    expect(jf.wasSelfWrite(raw + ' ')).toBe(false)
    expect(new JsonFile<Doc>(file, { defaultValue: defaults }).wasSelfWrite(raw)).toBe(false)
  })

  describe('update()', () => {
    it('re-reads then mutates then writes', async () => {
      const file = path.join(dir, 'doc.json')
      const jf = new JsonFile<Doc>(file, { defaultValue: defaults })
      await jf.write({ version: 1, items: ['a'] })
      const result = await jf.update((cur) => ({ version: 1, items: [...cur.items, 'b'] }))
      expect(result).toEqual({ version: 1, items: ['a', 'b'] })
      const { data } = await new JsonFile<Doc>(file, { defaultValue: defaults }).read()
      expect(data).toEqual({ version: 1, items: ['a', 'b'] })
    })

    it('serializes updates across two instances sharing the file (cross-process lock)', async () => {
      const file = path.join(dir, 'doc.json')
      const a = new JsonFile<Doc>(file, { defaultValue: defaults })
      const b = new JsonFile<Doc>(file, { defaultValue: defaults })
      await a.write({ version: 1, items: [] })
      // Each appends after re-reading; if the lock holds, both appends survive.
      await Promise.all([
        a.update((cur) => ({ version: 1, items: [...cur.items, 'A'] })),
        b.update((cur) => ({ version: 1, items: [...cur.items, 'B'] })),
      ])
      const { data } = await new JsonFile<Doc>(file, { defaultValue: defaults }).read()
      expect([...data.items].sort()).toEqual(['A', 'B'])
      expect(existsSync(`${file}.lock`)).toBe(false) // released
    })

    it('times out if the lock is held by a live foreign-host owner', async () => {
      const file = path.join(dir, 'doc.json')
      const jf = new JsonFile<Doc>(file, { defaultValue: defaults, lockTimeoutMs: 200 })
      await writeFile(
        `${file}.lock`,
        JSON.stringify({ pid: process.pid, host: 'some-other-host', ts: Date.now() }),
        'utf8',
      )
      await expect(jf.update((cur) => cur)).rejects.toThrow(/lock/)
    })

    it('reclaims a stale lock left by a dead process on this host', async () => {
      const file = path.join(dir, 'doc.json')
      const deadPid = 2 ** 30 // implausible pid, treated as dead by process.kill(pid, 0)
      await writeFile(`${file}.lock`, JSON.stringify({ pid: deadPid, host: hostname(), ts: Date.now() }), 'utf8')
      const jf = new JsonFile<Doc>(file, { defaultValue: defaults, lockTimeoutMs: 1000 })
      const result = await jf.update(() => ({ version: 1, items: ['recovered'] }))
      expect(result.items).toEqual(['recovered'])
    })
  })
})
