import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  normalizeCategory, normalizeService, parseAuthor, readPluginPackage, resolveMain, scanPluginRoots, sdkIncompatibility,
} from '@/plugin/host/manifest'

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

  it('takes the development export when the host runs from its sources and the file is there', () => {
    pkg('dual', { name: 'dual' }, ['src/index.ts', 'lib/index.js'])
    pkg('dual-unbuilt-src', { name: 'dual-unbuilt-src' }, ['lib/index.js'])
    const exports = { '.': { types: './lib/index.d.ts', development: './src/index.ts', default: './lib/index.js' } }
    expect(resolveMain({ exports }, path.join(root, 'dual'), true)).toBe('./src/index.ts')
    // The release build ignores it
    expect(resolveMain({ exports }, path.join(root, 'dual'), false)).toBe('./lib/index.js')
    // A published package may leave its sources out
    expect(resolveMain({ exports }, path.join(root, 'dual-unbuilt-src'), true)).toBe('./lib/index.js')
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

describe('parseAuthor', () => {
  it('reads the string form and the object form', () => {
    expect(parseAuthor('Alice <a@b.c> (https://alice.dev)')).toEqual({ name: 'Alice', email: 'a@b.c', url: 'https://alice.dev' })
    expect(parseAuthor('Alice Bob')).toEqual({ name: 'Alice Bob' })
    expect(parseAuthor('Alice (https://alice.dev)')).toEqual({ name: 'Alice', url: 'https://alice.dev' })
    expect(parseAuthor({ name: ' Alice ', email: 'a@b.c', url: 'https://alice.dev' })).toEqual({ name: 'Alice', email: 'a@b.c', url: 'https://alice.dev' })
  })

  it('drops an author without a name, and a URL that is not http(s), which would become a link', () => {
    expect(parseAuthor(undefined)).toBeUndefined()
    expect(parseAuthor('<a@b.c>')).toBeUndefined()
    expect(parseAuthor({ email: 'a@b.c' })).toBeUndefined()
    expect(parseAuthor({ name: 'Eve', url: 'javascript:alert(1)' })).toEqual({ name: 'Eve' })
    expect(parseAuthor('Eve (javascript:alert(1))')).toEqual({ name: 'Eve' })
  })
})

describe('readPluginPackage', () => {
  it('reads an image icon, the details and the screenshots', async () => {
    pkg('shown', {
      name: 'shown',
      type: 'module',
      author: { name: 'Alice' },
      llbot: { icon: 'assets/icon.svg', details: 'docs/details.md', screenshots: ['assets/a.png', { src: './assets/b.webp', caption: ' 群里 ' }] },
    }, ['index.js', 'assets/icon.svg', 'docs/details.md', 'assets/a.png', 'assets/b.webp'])
    expect(await readPluginPackage(path.join(root, 'shown'))).toMatchObject({
      author: { name: 'Alice' },
      iconFile: 'assets/icon.svg',
      detailsFile: 'docs/details.md',
      screenshots: [{ file: 'assets/a.png' }, { file: 'assets/b.webp', caption: '群里' }],
      warnings: [],
    })
  })

  it('takes an icon that is no image path for a lucide name', async () => {
    pkg('lucide', { name: 'lucide', type: 'module', llbot: { icon: 'message-square' } })
    const lucide = await readPluginPackage(path.join(root, 'lucide'))
    expect(lucide).toMatchObject({ manifest: { icon: 'message-square' }, screenshots: [], warnings: [] })
    expect(lucide?.iconFile).toBeUndefined()
  })

  it('drops what is missing, outside the package or of the wrong kind, with a warning each', async () => {
    pkg('wrong', {
      name: 'wrong',
      type: 'module',
      llbot: { icon: '../outside.png', details: 'README.txt', screenshots: ['missing.png', 'index.js', 7, { caption: 'no src' }] },
    }, ['index.js', 'README.txt'])
    const wrong = await readPluginPackage(path.join(root, 'wrong'))
    expect(wrong).toMatchObject({ iconFile: undefined, detailsFile: undefined, screenshots: [] })
    expect(wrong!.warnings).toEqual([
      'llbot.icon should be a path inside the package',
      'llbot.details should be a .md / .markdown file',
      'llbot.screenshots[0] missing.png does not exist',
      'llbot.screenshots[1] should be a .png / .jpg / .jpeg / .gif / .webp / .svg file',
      'llbot.screenshots[2] should be a path inside the package',
      'llbot.screenshots[3] should be a path inside the package',
    ])
    pkg('not-a-list', { name: 'not-a-list', type: 'module', llbot: { screenshots: 'a.png' } })
    expect((await readPluginPackage(path.join(root, 'not-a-list')))!.warnings).toEqual(['llbot.screenshots should be a list of images in the package'])
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

  it('keeps labels of the provided services when they are all text', () => {
    expect(normalizeService({ implements: ['account'], labels: { account: 'QQ 登录' } }).labels).toEqual({ account: 'QQ 登录' })
    const warnings: string[] = []
    expect(normalizeService({ labels: { account: 1 } }, warnings).labels).toBeUndefined()
    expect(warnings).toEqual(['llbot.service.labels should map service names to what they stand for'])
  })
})

describe('normalizeCategory', () => {
  it('keeps a known category and drops anything else with a warning, so the page lists it under other', async () => {
    const warnings: string[] = []
    expect(normalizeCategory('protocol', warnings)).toBe('protocol')
    expect(normalizeCategory(undefined, warnings)).toBeUndefined()
    expect(warnings).toEqual([])
    expect(normalizeCategory('games', warnings)).toBeUndefined()
    expect(normalizeCategory(1, warnings)).toBeUndefined()
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('protocol / adapter / chat / tool / service / other')

    pkg('categorized', { name: 'categorized', type: 'module', llbot: { category: 'chat' } })
    pkg('miscategorized', { name: 'miscategorized', type: 'module', llbot: { category: 'Chat' } })
    expect((await readPluginPackage(path.join(root, 'categorized')))!.manifest.category).toBe('chat')
    const wrong = (await readPluginPackage(path.join(root, 'miscategorized')))!
    expect(wrong.manifest.category).toBeUndefined()
    expect(wrong.warnings[0]).toContain('"Chat"')
  })
})

describe('llbot.webui', () => {
  it('keeps a module inside the package and warns about anything else', async () => {
    pkg('webui-ok', { name: 'webui-ok', type: 'module', llbot: { webui: 'webui/index.js' } }, ['index.js', 'webui/index.js'])
    pkg('webui-missing', { name: 'webui-missing', type: 'module', llbot: { webui: 'webui/index.js' } })
    pkg('webui-outside', { name: 'webui-outside', type: 'module', llbot: { webui: '../plain/index.js' } })

    const ok = (await readPluginPackage(path.join(root, 'webui-ok')))!
    expect(ok.webui).toBe(path.join(ok.root, 'webui', 'index.js'))
    expect(ok.warnings).toEqual([])
    const missing = (await readPluginPackage(path.join(root, 'webui-missing')))!
    expect(missing.webui).toBeUndefined()
    expect(missing.warnings).toEqual(['llbot.webui webui/index.js does not exist'])
    const outside = (await readPluginPackage(path.join(root, 'webui-outside')))!
    expect(outside.webui).toBeUndefined()
    expect(outside.warnings).toEqual(['llbot.webui should be a path inside the package'])
  })
})
