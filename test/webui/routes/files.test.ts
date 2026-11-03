import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from '../helpers/testApp'
import { createFileRoutes, listDirectory } from '@/plugin/internal/service/webui/BE/routes/files'

let root: string

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'llbot-fs-list-'))
  mkdirSync(path.join(root, 'b-dir'))
  mkdirSync(path.join(root, 'A-dir'))
  writeFileSync(path.join(root, 'file10.txt'), '')
  writeFileSync(path.join(root, 'file9.txt'), '')
  writeFileSync(path.join(root, 'QQ.exe'), '')
  // A junction needs no rights on Windows; elsewhere the type is ignored
  symlinkSync(path.join(root, 'A-dir'), path.join(root, 'link-to-dir'), 'junction')
  symlinkSync(path.join(root, 'gone'), path.join(root, 'broken-link'), 'junction')
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('the file picker listing', () => {
  it('lists a directory: folders first, names in natural order, links as what they point to', async () => {
    const listing = await listDirectory(root)
    expect(listing.path).toBe(root)
    expect(listing.parent).toBe(path.dirname(root))
    expect(listing.entries.map(entry => [entry.name, entry.dir])).toEqual([
      ['A-dir', true], ['b-dir', true], ['link-to-dir', true],
      ['file9.txt', false], ['file10.txt', false], ['QQ.exe', false],
    ])
    expect(listing.entries.find(entry => entry.name === 'QQ.exe')?.path).toBe(path.join(root, 'QQ.exe'))
    expect(listing.truncated).toBe(false)
    expect(listing.roots).toBeUndefined()
  })

  it('names the roots when asked: the drives on Windows, / elsewhere', async () => {
    const { roots } = await listDirectory(root, true)
    expect(roots).toContainEqual(process.platform === 'win32'
      ? { name: path.parse(root).root.slice(0, 2).toUpperCase(), path: path.parse(root).root.toUpperCase() }
      : { name: '/', path: '/' })
  })

  it('opens a file at its directory, and a path that is gone at the nearest one left', async () => {
    expect((await listDirectory(path.join(root, 'QQ.exe'))).path).toBe(root)
    expect((await listDirectory(path.join(root, 'b-dir', 'no', 'such'))).path).toBe(path.join(root, 'b-dir'))
    expect((await listDirectory('')).path).toBe(path.resolve(os.homedir()))
  })

  it('has no parent at a root', async () => {
    expect((await listDirectory(path.parse(root).root)).parent).toBeNull()
  })

  it('answers over the API', async () => {
    const res = await createTestApp(createFileRoutes()).request(`/fs/list?path=${encodeURIComponent(path.join(root, 'b-dir'))}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, data: { path: path.join(root, 'b-dir'), entries: [] } })
  })
})
