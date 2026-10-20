import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { normalizeService, resolveMain, scanPluginRoots, sdkIncompatibility } from '@/plugin/manifest'

const root = mkdtempSync(path.join(os.tmpdir(), 'llbot-plugin-scan-'))

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

function pkg(dir: string, json: Record<string, unknown>, files: string[] = ['index.js']) {
  mkdirSync(path.join(root, dir), { recursive: true })
  writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify(json))
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, dir, file)), { recursive: true })
    writeFileSync(path.join(root, dir, file), '')
  }
}

describe('scanPluginRoots', () => {
  it('finds plugins, including scoped ones, and skips everything else', async () => {
    pkg('plain', { name: 'plain', version: '2.0.0', type: 'module', llbot: { icon: 'timer' } })
    pkg('@scope/inner', { name: '@scope/inner', type: 'module', main: 'lib/main.js', llbot: {} }, ['lib/main.js'])
    pkg('not-a-plugin', { name: 'not-a-plugin' })
    pkg('node_modules/dep', { name: 'dep', llbot: {} })
    pkg('.hidden', { name: 'hidden', llbot: {} })
    pkg('cjs', { name: 'cjs', llbot: {} })
    pkg('broken-entry', { name: 'broken-entry', type: 'module', main: 'missing.js', llbot: {} }, [])

    const { packages, errors } = await scanPluginRoots([root, path.join(root, 'does-not-exist')])
    const byName = Object.fromEntries(packages.map(p => [p.name, p]))
    expect(Object.keys(byName).sort()).toEqual(['@scope/inner', 'cjs', 'plain'])
    expect(byName.plain).toMatchObject({ version: '2.0.0', manifest: { icon: 'timer' }, warnings: [] })
    expect(byName['@scope/inner'].main).toBe(path.join(byName['@scope/inner'].root, 'lib', 'main.js'))
    expect(byName.cjs.warnings[0]).toMatch(/CommonJS/)
    expect(errors).toEqual([{ path: path.join(root, 'broken-entry'), error: 'entry missing.js does not exist' }])
  })
})

describe('resolveMain', () => {
  it('prefers exports, then main, then index.js', () => {
    expect(resolveMain({ exports: './a.js', main: 'b.js' })).toBe('./a.js')
    expect(resolveMain({ exports: { '.': { types: './a.d.ts', import: './a.mjs', require: './a.cjs' } } })).toBe('./a.mjs')
    expect(resolveMain({ exports: { default: './d.js' } })).toBe('./d.js')
    expect(resolveMain({ main: 'b.js' })).toBe('b.js')
    expect(resolveMain({})).toBe('index.js')
  })
})

describe('sdkIncompatibility', () => {
  it('accepts plugins without an SDK range', () => {
    expect(sdkIncompatibility(undefined, '1.0.0')).toBeUndefined()
  })

  it('checks the range against the host SDK', () => {
    expect(sdkIncompatibility('^1.0.0', '1.4.2')).toBeUndefined()
    expect(sdkIncompatibility('^2.0.0', '1.4.2')).toMatch(/host provides 1\.4\.2/)
    expect(sdkIncompatibility('^1.0.0', undefined)).toMatch(/ships none/)
    expect(sdkIncompatibility('not a range', '1.0.0')).toMatch(/invalid/)
  })
})

describe('normalizeService', () => {
  it('fills in the missing lists and drops duplicates', () => {
    expect(normalizeService(undefined)).toEqual({ required: [], optional: [], implements: [] })
    expect(normalizeService({ required: ['bots', 'bots'], implements: ['translator'] }))
      .toEqual({ required: ['bots'], optional: [], implements: ['translator'] })
  })

  it('drops malformed parts with a warning instead of failing', () => {
    const warnings: string[] = []
    expect(normalizeService({ required: 'bots', optional: ['puppeteer'], implements: [1] }, warnings))
      .toEqual({ required: [], optional: ['puppeteer'], implements: [] })
    expect(warnings).toEqual([
      'llbot.service.required should be a list of service names',
      'llbot.service.implements should be a list of service names',
    ])
    expect(normalizeService(['bots'], warnings)).toEqual({ required: [], optional: [], implements: [] })
    expect(warnings.at(-1)).toMatch(/should be an object/)
  })
})
