import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { createServer, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { Context, Fiber } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { Hono } from 'hono'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import PluginService from '@/plugin/host'
import { createMarketRoutes, Market, MarketError } from '@/plugin/internal/tool/market'
import {
  matches, PackageVersion, Packument, parseSpec, pickVersion, Registry, verify,
} from '@/plugin/internal/tool/market/registry'
import { extractPackage, readTar } from '@/plugin/internal/tool/market/tar'

declare global {
  var __marketTest: string[]
}

const tmpRoot = path.resolve('.tmp')
mkdirSync(tmpRoot, { recursive: true })
const workDir = mkdtempSync(path.join(tmpRoot, 'market-test-'))

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

interface TarFile {
  name: string
  content?: string
  type?: string
  link?: string
}

function header(name: string, size: number, type: string, link = ''): Buffer {
  const block = Buffer.alloc(512)
  block.write(name, 0, 100, 'utf8')
  block.write('0000644\0', 100)
  block.write('0000000\0', 108)
  block.write('0000000\0', 116)
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124)
  block.write('00000000000\0', 136)
  block.write('        ', 148)
  block.write(type, 156)
  block.write(link, 157)
  block.write('ustar\0', 257)
  block.write('00', 263)
  let sum = 0
  for (const byte of block) sum += byte
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
  return block
}

function padded(data: Buffer): Buffer {
  return Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)])
}

function tar(files: TarFile[]): Buffer {
  const blocks: Buffer[] = []
  for (const file of files) {
    const data = Buffer.from(file.content ?? '')
    let name = file.name
    if (Buffer.byteLength(name) > 100) {
      const record = ` path=${name}\n`
      let length = record.length
      length += String(length + String(length).length).length
      const pax = Buffer.from(`${length}${record}`)
      blocks.push(header('PaxHeader', pax.length, 'x'), padded(pax))
      name = name.slice(0, 99)
    }
    blocks.push(header(name, file.type && file.type !== '0' ? 0 : data.length, file.type ?? '0', file.link))
    if (!file.type || file.type === '0') blocks.push(padded(data))
  }
  blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

describe('the tar reader', () => {
  it('reads files, directories and long names, and drops links', async () => {
    const long = `package/${'deep/'.repeat(30)}file.js`
    const entries = [...readTar(tar([
      { name: 'package/', type: '5' },
      { name: 'package/index.js', content: 'export default 1' },
      { name: long, content: 'long' },
      { name: 'package/link.js', type: '2', link: '/etc/passwd' },
    ]))]
    expect(entries.map(entry => [entry.path, entry.type])).toEqual([
      ['package/', 'directory'], ['package/index.js', 'file'], [long, 'file'],
    ])
    const dir = mkdtempSync(path.join(workDir, 'tar-'))
    await extractPackage(tar([{ name: 'package/lib/index.js', content: 'x' }, { name: long, content: 'long' }]), dir)
    expect(readFileSync(path.join(dir, 'lib/index.js'), 'utf8')).toBe('x')
    expect(readFileSync(path.join(dir, `${'deep/'.repeat(30)}file.js`), 'utf8')).toBe('long')
  })

  it('refuses paths that leave the package and corrupt headers', async () => {
    const dir = mkdtempSync(path.join(workDir, 'tar-'))
    await expect(extractPackage(tar([{ name: 'package/../../evil.js', content: 'x' }]), dir)).rejects.toThrow(/unsafe path/)
    const broken = tar([{ name: 'package/index.js', content: 'x' }])
    broken[0] ^= 1
    expect(() => [...readTar(broken)]).toThrow(/corrupt/)
  })
})

function document(versions: string[], latest = versions.at(-1)!, peer?: Record<string, string>): Packument {
  return {
    name: 'p',
    'dist-tags': { latest },
    versions: Object.fromEntries(versions.map(version => [version, {
      name: 'p', version, dist: { tarball: '' }, peerDependencies: peer?.[version] ? { '@luckylillia/plugin-sdk': peer[version] } : undefined,
    }])),
  }
}

describe('picking versions', () => {
  it('reads ranges the way npm does', () => {
    expect(matches('1.5.0', '1')).toBe(true)
    expect(matches('2.0.0', '1')).toBe(false)
    expect(matches('1.2.9', '1.2')).toBe(true)
    expect(matches('1.3.0', '1.2')).toBe(false)
    expect(matches('9.9.9', '*')).toBe(true)
    expect(matches('9.9.9', '')).toBe(true)
    expect(matches('2.1.0', '^1.2.0 || ^2')).toBe(true)
    expect(matches('1.5.0', '1.0.0 - 2.0.0')).toBe(true)
    expect(matches('1.5.0', '>= 1.2.0 < 1.6')).toBe(true)
    expect(matches('1.5.0', 'not a range')).toBe(false)
  })

  it('prefers the latest tag, leaves out prereleases, and narrows to accepted versions', () => {
    const doc = document(['1.0.0', '1.1.0', '1.2.0', '2.0.0-beta.1', '1.3.0'], '1.2.0')
    expect(pickVersion(doc)?.version).toBe('1.2.0')
    expect(pickVersion(doc, '^1.0.0')?.version).toBe('1.2.0')
    expect(pickVersion(doc, '~1.1.0')?.version).toBe('1.1.0')
    expect(pickVersion(doc, '>=1.3.0')?.version).toBe('1.3.0')
    expect(pickVersion(doc, '^2.0.0-beta.0')?.version).toBe('2.0.0-beta.1')
    expect(pickVersion(doc, '^3.0.0')).toBeUndefined()
    // Never past the latest tag: whatever is above it was not released as the latest
    expect(pickVersion(doc, 'latest', version => version.version !== '1.2.0')?.version).toBe('1.1.0')
    expect(pickVersion(doc, '1.3.0', version => version.version !== '1.3.0')).toBeUndefined()
  })

  it('reads aliases and refuses what is not a registry version', () => {
    expect(parseSpec('string-width-cjs', 'npm:string-width@^4.2.0')).toEqual({ name: 'string-width', range: '^4.2.0' })
    expect(parseSpec('x', 'npm:@scope/y@1')).toEqual({ name: '@scope/y', range: '1' })
    expect(parseSpec('x', '^1.0.0')).toEqual({ name: 'x', range: '^1.0.0' })
    for (const spec of ['github:a/b', 'a/b', 'file:../x', 'https://x/y.tgz', 'workspace:*']) {
      expect(() => parseSpec('x', spec)).toThrow(/only registry versions/)
    }
  })

  it('checks a tarball against the strongest hash it has', () => {
    const data = Buffer.from('tarball')
    const sha512 = `sha512-${createHash('sha512').update(data).digest('base64')}`
    const version = (dist: PackageVersion['dist']): PackageVersion => ({ name: 'p', version: '1.0.0', dist })
    expect(() => verify(data, version({ tarball: '', integrity: `sha1-AAAA ${sha512}` }))).not.toThrow()
    expect(() => verify(data, version({ tarball: '', integrity: sha512.slice(0, -4) + 'AAA=' }))).toThrow(/integrity/)
    expect(() => verify(data, version({ tarball: '', shasum: createHash('sha1').update(data).digest('hex') }))).not.toThrow()
    expect(() => verify(data, version({ tarball: '' }))).toThrow(/no checksum/)
  })
})

interface Publish {
  files?: Record<string, string>
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  os?: string[]
  plugin?: boolean
  /** Leaves the latest tag where it is */
  untagged?: boolean
  /** Serves bytes that fail the checksum */
  corrupt?: boolean
}

/** Answers what the installer and the search ask, like registry.npmjs.org */
async function startRegistry() {
  const documents = new Map<string, Packument>()
  const tarballs = new Map<string, Buffer>()
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://registry')
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (url.pathname === '/-/v1/search') {
      const text = url.searchParams.get('text') ?? ''
      const objects = [...documents.values()]
        .map(doc => doc.versions[doc['dist-tags'].latest])
        .filter(version => text.includes('keywords:luckylillia-plugin') && version.keywords?.includes('luckylillia-plugin'))
        .map(version => ({ package: { name: version.name, version: version.version, description: version.description, keywords: version.keywords } }))
      return send(200, { objects, total: objects.length })
    }
    const tarball = tarballs.get(url.pathname)
    if (tarball) {
      response.writeHead(200, { 'content-type': 'application/octet-stream' })
      return response.end(tarball)
    }
    const doc = documents.get(decodeURIComponent(url.pathname.slice(1)))
    if (!doc) return send(404, { error: 'Not found' })
    const abbreviated = request.headers.accept?.includes('application/vnd.npm.install-v1+json')
    if (!abbreviated) return send(200, doc)
    send(200, {
      ...doc,
      versions: Object.fromEntries(Object.entries(doc.versions).map(([version, { llbot: _, description: __, ...rest }]) => [version, rest])),
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  function publish(name: string, version: string, options: Publish = {}) {
    const manifest = {
      name,
      version,
      type: 'module',
      main: 'index.js',
      ...options.plugin ? { keywords: ['luckylillia-plugin'], llbot: {}, description: `${name} plugin` } : {},
      ...options.dependencies ? { dependencies: options.dependencies } : {},
      ...options.optionalDependencies ? { optionalDependencies: options.optionalDependencies } : {},
      ...options.peerDependencies ? { peerDependencies: options.peerDependencies } : {},
      ...options.os ? { os: options.os } : {},
    }
    const files = { 'package.json': JSON.stringify(manifest), ...options.files }
    const data = gzipSync(tar(Object.entries(files).map(([file, content]) => ({ name: `package/${file}`, content }))))
    const file = `/${name}/-/${name.split('/').pop()}-${version}.tgz`
    tarballs.set(file, options.corrupt ? Buffer.concat([data, Buffer.from('!')]) : data)
    const doc = documents.get(name) ?? { name, 'dist-tags': {}, versions: {} }
    doc.versions[version] = {
      ...manifest,
      dist: { tarball: `${url}${file}`, integrity: `sha512-${createHash('sha512').update(data).digest('base64')}` },
    } as PackageVersion
    if (!options.untagged) doc['dist-tags'].latest = version
    documents.set(name, doc)
  }

  return { url, publish, close: () => new Promise<void>(resolve => server.close(() => resolve())) }
}

describe('the market', () => {
  let registry: Awaited<ReturnType<typeof startRegistry>>
  let ctx: Context
  let service: Fiber | undefined
  let pluginRoot: string
  let pluginsFile: string
  let market: Market

  const PLUGIN = 'luckylillia-plugin-greet'
  const pluginCode = (tag: string) => `
    import a from 'a'
    import b from 'b'
    export const name = 'greet'
    export function apply(ctx) {
      globalThis.__marketTest.push('${tag}:' + a + ',' + b)
    }
  `

  beforeEach(async () => {
    globalThis.__marketTest = []
    registry = await startRegistry()
    registry.publish('c', '1.0.0', { files: { 'index.js': `export default 'c1'` } })
    registry.publish('c', '2.0.0', { files: { 'index.js': `export default 'c2'` } })
    registry.publish('a', '1.0.0', { dependencies: { c: '^1.0.0' }, files: { 'index.js': `import c from 'c'; export default 'a1+' + c` } })
    registry.publish('b', '1.0.0', {
      dependencies: { c: '^2.0.0', d: 'npm:a@^1.0.0' },
      files: { 'index.js': `import c from 'c'; import d from 'd'; export default 'b1+' + c + '+' + d` },
    })
    registry.publish('native-x', '1.0.0', { os: ['no-such-os'] })
    registry.publish(PLUGIN, '1.0.0', {
      plugin: true,
      dependencies: { a: '^1.0.0', b: '^1.0.0', cordis: '*', schemastery: '^3.0.0' },
      optionalDependencies: { 'native-x': '^1.0.0' },
      files: { 'index.js': pluginCode('v1') },
    })
    const caseDir = mkdtempSync(path.join(workDir, 'case-'))
    pluginRoot = path.join(caseDir, 'plugins')
    ctx = new Context()
    await ctx.plugin(TimerService)
    pluginsFile = path.join(caseDir, 'plugins.json')
    service = await ctx.plugin(PluginService, { file: pluginsFile, roots: [pluginRoot], trust: true })
    market = new Market(ctx, new Registry(registry.url, registry.url), pluginRoot)
  })

  afterEach(async () => {
    await service?.dispose()
    service = undefined
    await registry.close()
  })

  const status = () => ctx.plugins.list().find(entry => entry.name === PLUGIN)
  const dir = (...parts: string[]) => path.join(pluginRoot, PLUGIN, ...parts)
  const versionAt = (...parts: string[]) => JSON.parse(readFileSync(dir(...parts, 'package.json'), 'utf8')).version

  it('finds plugins by their keyword and marks the installed ones', async () => {
    expect((await market.search('', 1)).items).toEqual([expect.objectContaining({ name: PLUGIN, version: '1.0.0', installed: undefined })])
    await market.install(PLUGIN)
    expect((await market.search('', 1)).items[0].installed).toBe('1.0.0')
  })

  it('installs a plugin and its dependencies the way npm lays them out, leaving shared packages to the host', async () => {
    const outcome = await market.install(PLUGIN)
    expect(outcome).toMatchObject({ name: PLUGIN, version: '1.0.0', skipped: ['native-x'], packages: 6, scripts: [] })
    expect(versionAt('node_modules', 'a')).toBe('1.0.0')
    expect(versionAt('node_modules', 'c')).toBe('1.0.0')
    expect(versionAt('node_modules', 'b', 'node_modules', 'c')).toBe('2.0.0')
    // The alias keeps its own directory
    expect(JSON.parse(readFileSync(dir('node_modules', 'd', 'package.json'), 'utf8')).name).toBe('a')
    expect(existsSync(dir('node_modules', 'cordis'))).toBe(false)
    expect(existsSync(dir('node_modules', 'schemastery'))).toBe(false)
    expect(existsSync(dir('node_modules', 'native-x'))).toBe(false)
    // A first install is listed switched off, like any package put there by hand
    expect(outcome.entries).toEqual([status()!.id])
    expect(status()).toMatchObject({ disabled: true, version: '1.0.0' })
    await ctx.plugins.enable(status()!.id, { trust: true })
    expect(globalThis.__marketTest).toEqual(['v1:a1+c1,b1+c2+a1+c1'])
    expect(market.installed()).toEqual([expect.objectContaining({ name: PLUGIN, version: '1.0.0', managed: true })])
  })

  it('updates a running plugin in place and reloads it', async () => {
    await market.install(PLUGIN)
    await ctx.plugins.enable(status()!.id, { trust: true })
    registry.publish('a', '1.1.0', { dependencies: { c: '^1.0.0' }, files: { 'index.js': `export default 'a2'` } })
    registry.publish(PLUGIN, '1.1.0', { plugin: true, dependencies: { a: '^1.1.0', b: '^1.0.0' }, files: { 'index.js': pluginCode('v2') } })
    expect(await market.updates()).toEqual({ [PLUGIN]: { latest: '1.1.0', update: '1.1.0' } })
    const outcome = await market.install(PLUGIN)
    expect(outcome).toMatchObject({ version: '1.1.0', previous: '1.0.0', reload: { status: 'reloaded' } })
    // Its dependencies are re-imported too, but only under Node's own loader (resolve-hook.test.ts)
    expect(globalThis.__marketTest).toEqual(['v1:a1+c1,b1+c2+a1+c1', expect.stringMatching(/^v2:/)])
    expect(versionAt('node_modules', 'a')).toBe('1.1.0')
    expect(versionAt('node_modules', 'd')).toBe('1.1.0')
    expect(status()).toMatchObject({ disabled: false, state: 'active', version: '1.1.0' })
    expect(readdirNames(pluginRoot)).toEqual([PLUGIN])
  })

  it('installs the newest version this bot runs, and says why the latest does not', async () => {
    registry.publish(PLUGIN, '2.0.0', { plugin: true, peerDependencies: { '@luckylillia/plugin-sdk': '^99.0.0' }, files: { 'index.js': pluginCode('v3') } })
    expect(await market.install(PLUGIN)).toMatchObject({ version: '1.0.0' })
    const updates = await market.updates()
    expect(updates[PLUGIN]).toMatchObject({ latest: '2.0.0', blocked: expect.stringContaining('^99.0.0') })
    expect(updates[PLUGIN].update).toBeUndefined()
    // Asked for by version, it is the user's call
    expect(await market.install(PLUGIN, '2.0.0')).toMatchObject({ version: '2.0.0', previous: '1.0.0' })
    expect(status()?.state).toBe('incompatible')
  })

  it('refuses packages that are no plugins and copies it does not manage', async () => {
    await expect(market.install('a')).rejects.toThrow(/no llbot field/)
    await expect(market.install('../escape')).rejects.toThrow(MarketError)
    await expect(market.install('nothing-here')).rejects.toThrow(/not found/)
    const devRoot = path.join(workDir, `dev-${Date.now()}`)
    mkdirSync(path.join(devRoot, PLUGIN), { recursive: true })
    mkdirSync(pluginRoot, { recursive: true })
    symlinkSync(path.join(devRoot, PLUGIN), dir(), 'junction')
    await expect(market.install(PLUGIN)).rejects.toThrow(/link/)
    expect(existsSync(path.join(devRoot, PLUGIN))).toBe(true)
  })

  it('removes a package with its entries', async () => {
    await market.install(PLUGIN)
    const id = status()!.id
    await ctx.plugins.enable(id, { trust: true })
    await ctx.plugins.setMessageOrder([id])
    expect(await market.uninstall(PLUGIN)).toEqual({ removed: [id] })
    expect(status()).toBeUndefined()
    expect(existsSync(dir())).toBe(false)
    // Installed again, it asks for trust again
    expect(JSON.parse(readFileSync(pluginsFile, 'utf8'))).toMatchObject({ trusted: [], messageOrder: [] })
    await expect(market.uninstall(PLUGIN)).rejects.toThrow(/not installed/)
  })

  it('answers the WebUI with what went wrong', async () => {
    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    const call = async (method: string, url: string, body?: unknown) => {
      const response = await routes.request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } })
      return { status: response.status, ...await response.json() as { success: boolean; data?: any; message?: string } }
    }
    expect(await call('POST', '/api/market/install', {})).toMatchObject({ status: 400, success: false, message: 'name is required' })
    expect(await call('POST', '/api/market/install', { name: 'nothing-here' })).toMatchObject({ status: 404, success: false })
    expect(await call('POST', '/api/market/install', { name: PLUGIN, version: '9.9.9' })).toMatchObject({ status: 404 })
    expect(await call('POST', '/api/market/install', { name: PLUGIN })).toMatchObject({ status: 200, data: { version: '1.0.0' } })
    expect(await call('GET', '/api/market/installed')).toMatchObject({ data: [{ name: PLUGIN, managed: true }] })
    expect(await call('GET', '/api/market/search?q=greet&page=1')).toMatchObject({ data: { total: 1, items: [{ name: PLUGIN, installed: '1.0.0' }] } })
    expect(await call('POST', '/api/market/uninstall', { name: PLUGIN })).toMatchObject({ status: 200, data: { removed: [expect.any(String)] } })
  })

  it('keeps the installed version when a download fails its check', async () => {
    await market.install(PLUGIN)
    registry.publish(PLUGIN, '1.1.0', { plugin: true, corrupt: true, files: { 'index.js': pluginCode('v2') } })
    await expect(market.install(PLUGIN)).rejects.toThrow(/integrity/)
    expect(versionAt()).toBe('1.0.0')
    expect(readdirNames(pluginRoot)).toEqual([PLUGIN])
  })
})

function readdirNames(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).sort() : []
}
