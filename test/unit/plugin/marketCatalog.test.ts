import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { Catalog, MARKET_PACKAGE } from '@/plugin/internal/tool/market/catalog'
import { Registry, verify, type Packument, type PackageVersion, type RegistryClient } from '@/plugin/internal/tool/market/registry'
import { MarketSchema, marketSettings } from '@/plugin/internal/tool/market/settings'

interface File { path: string; text?: string; bytes?: Buffer; type?: string }

function tar(files: File[]): Buffer {
  const blocks: Buffer[] = []
  for (const file of files) {
    const data = file.bytes ?? Buffer.from(file.text ?? '')
    const header = Buffer.alloc(512)
    header.write(file.path, 0, 100, 'utf8')
    header.write('0000644\0', 100)
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124)
    header.write('        ', 148)
    header.write(file.type ?? '0', 156)
    header.write('ustar\0', 257)
    header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512))
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)])
}

const pluginWithoutVersion = {
  name: '@author/example', title: '示例插件', description: '目录中的简介',
  author: { name: '示例作者', url: 'https://example.com/author' }, repository: 'https://github.com/author/example',
}
const plugin = { ...pluginWithoutVersion, version: '1.2.3' }

function files(plugins: unknown = [plugin]): File[] {
  return [
    { path: 'package/package.json', text: JSON.stringify({ name: MARKET_PACKAGE, scripts: { install: 'never execute' } }) },
    { path: 'package/plugins.json', text: JSON.stringify(plugins) },
  ]
}

function fixture(initial = files(), name = MARKET_PACKAGE) {
  const document: Packument = { name, 'dist-tags': {}, versions: {} }
  const archives = new Map<string, Buffer>()
  const registry = {
    packument: vi.fn(async () => document),
    tarball: vi.fn(async (version: PackageVersion) => {
      const archive = archives.get(version.version)!
      verify(archive, version)
      return archive
    }),
  } satisfies RegistryClient
  const publish = (entries: File[], version = '1.0.0', content = gzipSync(tar(entries))) => {
    archives.set(version, content)
    document['dist-tags'].latest = version
    document.versions[version] = {
      name, version, dist: { tarball: `https://registry.example/catalog-${version}.tgz`, integrity: `sha512-${createHash('sha512').update(content).digest('base64')}` },
    }
  }
  publish(initial)
  return { registry, document, archives, publish, catalog: new Catalog(registry, name) }
}

describe('npm directory catalog', () => {
  it('reads display metadata and approved exact versions from plugins.json alone', async () => {
    const { registry, catalog } = fixture()
    expect([...await catalog.load()]).toEqual([[plugin.name, plugin]])
    expect(registry.packument.mock.calls).toEqual([[MARKET_PACKAGE]])
    expect(registry.tarball).toHaveBeenCalledTimes(1)
  })

  it('accepts an empty catalog and a configured catalog package', async () => {
    const { registry, catalog } = fixture(files([]), '@company/catalog')
    expect((await catalog.load()).size).toBe(0)
    expect(registry.packument).toHaveBeenCalledWith('@company/catalog')
  })

  it('rejects old split catalogs that store versions only in versions.json', async () => {
    const entries = [
      ...files([pluginWithoutVersion]),
      { path: 'package/versions.json', text: JSON.stringify({ [plugin.name]: plugin.version }) },
    ]
    await expect(fixture(entries).catalog.load()).rejects.toThrow('精确版本号')
  })

  it.each(['protocol', 'adapter', 'chat', 'tool', 'service', 'other'])('preserves the registration category supported by the Bot: %s', async category => {
    const entry = { ...plugin, category }
    expect([...await fixture(files([entry])).catalog.load()]).toEqual([[plugin.name, entry]])
  })

  it.each([null, '', 'unknown', 'chat ', 'Service', 1, {}, []])('rejects an invalid registration category: %j', async category => {
    await expect(fixture(files([{ ...plugin, category }])).catalog.load()).rejects.toThrow('插件分类')
  })

  it.each([
    JSON.stringify({ [plugin.name]: '9.0.0', unlisted: '1.0.0' }),
    '{',
  ])('uses inline versions without parsing or consulting an old sidecar: %s', async text => {
    const entries = [...files(), { path: 'package/versions.json', text }]
    expect([...await fixture(entries).catalog.load()]).toEqual([[plugin.name, plugin]])
  })

  it.each([undefined, null, '^1.0.0'])('requires every inline version even when versions.json provides a valid pin: %j', async version => {
    const invalid = { ...plugin, name: '@author/invalid-version', version }
    const entries = [
      ...files([plugin, invalid]),
      { path: 'package/versions.json', text: JSON.stringify({ [plugin.name]: plugin.version, [invalid.name]: '2.0.0' }) },
    ]
    await expect(fixture(entries).catalog.load()).rejects.toThrow('精确版本号')
  })

  it('accepts legacy example URLs without downloading them and returns a frozen screenshot list', async () => {
    const illustrated = {
      ...plugin,
      icon: 'https://images.example/icon.png',
      examples: ['https://images.example/demo.png?width=800', 'http://images.example/preview.webp'],
    }
    const { catalog, registry } = fixture(files([illustrated]))
    const snapshot = await catalog.load()
    const entry = snapshot.get(plugin.name)!
    expect(entry).toEqual({ ...plugin, icon: illustrated.icon, screenshots: illustrated.examples, version: '1.2.3' })
    expect(Object.isFrozen(entry.screenshots)).toBe(true)
    expect(() => (entry.screenshots as string[]).push('https://images.example/changed.png')).toThrow()
    expect(await catalog.load()).toBe(snapshot)
    expect(registry.packument.mock.calls).toEqual([[MARKET_PACKAGE], [MARKET_PACKAGE]])
    expect(registry.tarball).toHaveBeenCalledTimes(1)
  })

  it('preserves package-relative icon and screenshot paths and freezes caption objects', async () => {
    const screenshots = ['assets/preview.png', { src: './assets/设置 界面.webp', caption: '设置界面' }, { src: 'assets/second.svg' }, 'HTTPS://images.example/demo.png']
    const illustrated = { ...plugin, icon: './assets/icon.png', screenshots }
    const { catalog, registry } = fixture(files([illustrated]))
    const entry = (await catalog.load()).get(plugin.name)!
    expect(entry).toEqual({ ...illustrated, version: '1.2.3' })
    expect(Object.isFrozen(entry.screenshots)).toBe(true)
    expect(Object.isFrozen(entry.screenshots![1])).toBe(true)
    expect(() => { (entry.screenshots![1] as { caption: string }).caption = 'changed' }).toThrow()
    expect(registry.packument).toHaveBeenCalledTimes(1)
    expect(registry.tarball).toHaveBeenCalledTimes(1)
  })

  it('prefers screenshots over legacy examples, including an explicit empty list', async () => {
    for (const screenshots of [[], ['assets/preview.png']]) {
      const entry = (await fixture(files([{ ...plugin, screenshots, examples: ['https://images.example/legacy.png'] }])).catalog.load()).get(plugin.name)!
      expect(entry.screenshots).toEqual(screenshots.length ? screenshots : undefined)
      expect(entry).not.toHaveProperty('examples')
    }
  })

  it.each([{}, { icon: '' }, { examples: [] }, { icon: '', examples: [] }, { screenshots: [] }, { icon: '', screenshots: [] }])('keeps omitted or empty image fields absent in output: %j', async media => {
    const entry = (await fixture(files([{ ...plugin, ...media }])).catalog.load()).get(plugin.name)!
    expect(entry).toEqual({ ...plugin, version: '1.2.3' })
    expect(entry).not.toHaveProperty('icon')
    expect(entry).not.toHaveProperty('examples')
    expect(entry).not.toHaveProperty('screenshots')
  })

  const unsafeImages = [
    'javascript:alert(1)', 'data:image/png;base64,AAAA', 'file:///image.png', '/image.png', '//images.example/image.png',
    'https://user:password@images.example/image.png', 'https://images.example/image with space.png',
    'https://images.example/image\n.png', 'https://images.example/image\u0000.png', 'https://images.example/image\u007f.png',
    'https://images.example/image\u00a0.png', 'https://images.example\\image.png', 'https://images.example/' + 'x'.repeat(2048),
    'https:///images.example/image.png', 'https://@images.example/image.png',
    '../outside.png', 'assets/../outside.png', 'C:/image.png', 'assets\\image.png', 'assets/image.txt',
    ' assets/image.png', 'assets/image.png ', 'assets/image\n.png', 'x'.repeat(2045) + '.png',
  ]
  it.each(unsafeImages)('rejects unsafe icon and example URLs: %s', async url => {
    for (const media of [{ icon: url }, { examples: [url] }, { screenshots: [url] }, { screenshots: [{ src: url }] }]) {
      await expect(fixture(files([{ ...plugin, ...media }])).catalog.load()).rejects.toThrow(/图标|示例图片|截图/)
    }
  })

  it.each([
    { icon: null }, { icon: 1 }, { icon: false }, { icon: [] }, { icon: {} },
    { examples: null }, { examples: 1 }, { examples: false }, { examples: 'https://images.example/example.png' }, { examples: {} },
    { examples: [''] }, { examples: [null] }, { examples: [1] }, { examples: [[]] }, { examples: [{}] },
    { examples: ['https://images.example/valid.png', false] },
    { screenshots: null }, { screenshots: 'assets/demo.png' }, { screenshots: {} },
    { screenshots: [''] }, { screenshots: [null] }, { screenshots: [1] }, { screenshots: [{}] },
    { screenshots: [{ caption: 'missing source' }] }, { screenshots: [{ src: 'assets/demo.png', extra: 1 }] },
    ...[null, 1, '', ' leading', 'trailing ', 'bad\u0000caption', 'x'.repeat(201), { zh: '本地化说明' }].map(caption => ({ screenshots: [{ src: 'assets/demo.png', caption }] })),
  ])('rejects invalid image field types and empty example items: %j', async media => {
    await expect(fixture(files([{ ...plugin, ...media }])).catalog.load()).rejects.toThrow(/图标|示例图片|截图/)
  })

  it('shares concurrent refreshes, caches unchanged content, and reads metadata again for subsequent calls', async () => {
    const { registry, catalog, publish } = fixture()
    const [a, b] = await Promise.all([catalog.load(), catalog.load()])
    expect(a).toBe(b)
    expect(registry.packument).toHaveBeenCalledTimes(1)
    expect(await catalog.load()).toBe(a)
    expect(registry.packument).toHaveBeenCalledTimes(2)
    expect(registry.tarball).toHaveBeenCalledTimes(1)
    publish(files([{ ...plugin, version: '2.0.0' }]), '1.0.1')
    expect((await catalog.load()).get(plugin.name)?.version).toBe('2.0.0')
    expect(registry.tarball).toHaveBeenCalledTimes(2)
  })

  it('invalidates the cache when a registry changes integrity for the same catalog version', async () => {
    const { catalog, publish, registry } = fixture()
    await catalog.load()
    publish(files([{ ...plugin, version: '1.3.0' }]))
    expect((await catalog.load()).get(plugin.name)?.version).toBe('1.3.0')
    expect(registry.tarball).toHaveBeenCalledTimes(2)
  })

  it('reports refresh failures instead of returning an older successful catalog and allows retry', async () => {
    const { catalog, publish, registry } = fixture()
    await catalog.load()
    registry.packument.mockRejectedValueOnce(new Error('registry unavailable'))
    await expect(catalog.load()).rejects.toThrow('registry unavailable')
    publish(files([pluginWithoutVersion]), '1.0.1')
    await expect(catalog.load()).rejects.toThrow('精确版本号')
    await expect(catalog.load()).rejects.toThrow('精确版本号')
    publish(files([{ ...plugin, version: '1.3.0' }]), '1.0.2')
    expect((await catalog.load()).get(plugin.name)?.version).toBe('1.3.0')
  })

  it('requires the tagged version and never falls back to another catalog version', async () => {
    const { catalog, document, registry } = fixture()
    document['dist-tags'].latest = '2.0.0'
    await expect(catalog.load()).rejects.toThrow('latest')
    expect(registry.tarball).not.toHaveBeenCalled()
  })

  it.each([
    ['wrong package name', (doc: Packument) => { doc.name = 'other' }],
    ['missing tags', (doc: Packument) => { delete (doc as any)['dist-tags'] }],
    ['version range tag', (doc: Packument) => { doc['dist-tags'].latest = '^1.0.0' }],
    ['mismatched version name', (doc: Packument) => { doc.versions['1.0.0'].name = 'other' }],
    ['mismatched version number', (doc: Packument) => { doc.versions['1.0.0'].version = '2.0.0' }],
    ['missing integrity', (doc: Packument) => { delete doc.versions['1.0.0'].dist.integrity }],
    ['invalid tarball URL', (doc: Packument) => { doc.versions['1.0.0'].dist.tarball = 'file:///catalog.tgz' }],
  ])('rejects invalid catalog metadata: %s', async (_, mutate) => {
    const { catalog, document, registry } = fixture()
    mutate(document)
    await expect(catalog.load()).rejects.toThrow('插件目录无效')
    expect(registry.tarball).not.toHaveBeenCalled()
  })

  it.each([
    ['not an array', {}, '插件数组'],
    ['duplicate plugin', [plugin, plugin], '重复登记'],
    ['missing version', [pluginWithoutVersion], '精确版本号'],
    ['invalid package name', [{ ...plugin, name: '../example' }], 'npm 包名'],
    ['unknown property', [{ ...plugin, email: 'private@example.com' }], '无效字段'],
    ['blank title', [{ ...plugin, title: ' ' }], '名称或简介'],
    ['control character', [{ ...plugin, description: 'line\nbreak' }], '名称或简介'],
    ['missing author', [{ ...plugin, author: undefined }], '作者信息'],
    ['author email field', [{ ...plugin, author: { name: 'Author', email: 'a@example.com' } }], '作者信息'],
    ['unsafe author URL', [{ ...plugin, author: { name: 'Author', url: 'javascript:alert(1)' } }], '作者链接'],
    ['author credentials URL', [{ ...plugin, author: { name: 'Author', url: 'https://user:password@example.com' } }], '作者链接'],
    ['unsafe repository', [{ ...plugin, repository: 'https://example.com/author/example' }], '仓库链接'],
    ['repository file path', [{ ...plugin, repository: 'https://github.com/author/example/tree/main' }], '仓库链接'],
    ['repository git suffix', [{ ...plugin, repository: 'https://github.com/author/example.git' }], '仓库链接'],
    ['repository trailing newline', [{ ...plugin, repository: 'https://github.com/author/example\n' }], '仓库链接'],
  ])('rejects inconsistent catalog data: %s', async (_, plugins, reason) => {
    await expect(fixture(files(plugins)).catalog.load()).rejects.toThrow(reason)
  })

  it.each([null, 1, false, {}, [], 'latest', '^1.0.0', '1.0', 'v1.0.0', '01.0.0', '1.0.0-01', '1.0.0\n'])('rejects non-exact SemVer pins: %j', async version => {
    await expect(fixture(files([{ ...plugin, version }])).catalog.load()).rejects.toThrow('精确版本号')
  })

  it('accepts exact prerelease and build metadata versions', async () => {
    const version = '1.0.0-beta.1+build.7'
    expect((await fixture(files([{ ...plugin, version }])).catalog.load()).get(plugin.name)?.version).toBe(version)
  })

  it.each([
    ['missing JSON', files().filter(file => !file.path.endsWith('plugins.json')), '缺少'],
    ['duplicate JSON', [...files(), files()[1]], '重复文件'],
    ['invalid JSON', [{ ...files()[1], text: '{' }], 'JSON'],
    ['invalid UTF-8', [{ ...files()[1], bytes: Buffer.from([0xff]) }], 'UTF-8'],
    ['directory instead of JSON', [{ ...files()[1], type: '5' }], '普通文件'],
    ['symlink instead of JSON', [{ ...files()[1], type: '2', text: '' }], '缺少'],
    ['unsafe archive path', [...files(), { path: 'package/../plugins.json' }], '无效文件路径'],
  ])('rejects invalid catalog archives: %s', async (_, entries, reason) => {
    await expect(fixture(entries).catalog.load()).rejects.toThrow(reason)
  })

  it('reads JSON paths in standard npm pax and GNU long-name records', async () => {
    const path = 'package/plugins.json'
    const record = ` path=${path}\n`
    const length = record.length + String(record.length + String(record.length).length).length
    for (const prefix of [
      { path: 'PaxHeader', type: 'x', text: `${length}${record}` },
      { path: '././@LongLink', type: 'L', text: `${path}\0` },
    ]) {
      const entries = [prefix, { ...files()[1], path: 'short' }]
      expect((await fixture(entries).catalog.load()).has(plugin.name)).toBe(true)
    }
  })

  it('rejects broken compression, checksum and incomplete tar archives', async () => {
    const state = fixture()
    state.archives.set('1.0.0', Buffer.from('bad integrity'))
    await expect(state.catalog.load()).rejects.toThrow('integrity check')
    state.publish([], '1.0.1', Buffer.from('not gzip'))
    await expect(state.catalog.load()).rejects.toThrow('无法解压')
    state.publish([], '1.0.2', gzipSync(tar(files()).subarray(0, -1)))
    await expect(state.catalog.load()).rejects.toThrow('不完整')
    const broken = tar(files())
    broken[0] ^= 1
    state.publish([], '1.0.3', gzipSync(broken))
    await expect(state.catalog.load()).rejects.toThrow('corrupt tarball')
  })

  it('bounds compressed bytes, expanded data, individual JSON files and file count', async () => {
    const state = fixture()
    state.publish([], '1.0.0', Buffer.alloc(4 * 1024 * 1024 + 1))
    await expect(state.catalog.load()).rejects.toThrow('下载超过')
    state.publish([], '1.0.1', gzipSync(Buffer.alloc(16 * 1024 * 1024 + 1)))
    await expect(state.catalog.load()).rejects.toThrow('解压后超过')
    state.publish([{ path: 'package/plugins.json', bytes: Buffer.alloc(4 * 1024 * 1024 + 1) }], '1.0.2')
    await expect(state.catalog.load()).rejects.toThrow('plugins.json 超过')
    state.publish([...files(), ...Array.from({ length: 1024 }, (_, i) => ({ path: `package/file-${i}` }))], '1.0.3')
    await expect(state.catalog.load()).rejects.toThrow('文件数超过')
  })
})

describe('catalog download transport', () => {
  const version: PackageVersion = { name: MARKET_PACKAGE, version: '1.0.0', dist: { tarball: 'https://registry.example/catalog.tgz' } }

  it('rejects a declared oversized response before reading it', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream({ cancel })
    const registry = new Registry('https://registry.example', async () => new Response(body, { headers: { 'content-length': '20' } }))
    await expect(registry.tarball(version, 10)).rejects.toThrow('下载超过')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('stops an oversized response without trusting its content-length', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(11)) }, cancel })
    const registry = new Registry('https://registry.example', async () => new Response(body))
    await expect(registry.tarball(version, 10)).rejects.toThrow('下载超过')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('continues to verify bounded downloads', async () => {
    const data = Buffer.from('tarball')
    const registry = new Registry('https://registry.example', async () => new Response('tarball'))
    const checked = { ...version, dist: { ...version.dist, shasum: createHash('sha1').update(data).digest('hex') } }
    expect(await registry.tarball(checked, 10)).toEqual(data)
    await expect(registry.tarball({ ...checked, dist: { ...checked.dist, shasum: '0000' } }, 10)).rejects.toThrow('sha1 check')
  })
})

describe('market catalog settings', () => {
  it('defaults to the published market package and drops legacy search settings', () => {
    const normalized = marketSettings.normalize!({ registry: ' https://registry.example ', search: 'https://old.example' } as any)
    expect(normalized).not.toHaveProperty('search')
    const value = MarketSchema(normalized)
    expect(value).toMatchObject({ registry: 'https://registry.example', catalog: MARKET_PACKAGE })
    expect(marketSettings.check!(value, true)).toEqual([])
  })

  it.each(['../catalog', '@scope/catalog@latest', 'https://registry.example/catalog', 'node_modules', 'favicon.ico'])('rejects a catalog that is not an npm package name: %s', catalog => {
    expect(marketSettings.check!({ registry: 'https://registry.example', catalog }, true)).toContainEqual(expect.objectContaining({ path: ['catalog'] }))
    expect(() => new Catalog(fixture().registry, catalog)).toThrow('目录包名称')
  })
})
