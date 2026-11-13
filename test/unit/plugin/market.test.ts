import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { createServer, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import path from 'node:path'
import { Readable } from 'node:stream'
import { crc32, createGzip, deflateRawSync, gzipSync } from 'node:zlib'
import { Context, Fiber } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { Hono } from 'hono'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PluginCategory } from '@luckylillia/plugin-sdk'
import PluginService from '@/plugin/host'
import { createMarketRoutes, Market, MarketError } from '@/plugin/internal/tool/market'
import { readLocalPackage as readArchive } from '@/plugin/internal/tool/market/archive'
import { Catalog } from '@/plugin/internal/tool/market/catalog'
import {
  matches, PackageVersion, Packument, parseSpec, pickVersion, Registry, verify,
} from '@/plugin/internal/tool/market/registry'
import { extractPackage, readTar, readTarStream } from '@/plugin/internal/tool/market/tar'

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

/** Small real ZIP fixtures: stored or deflated, optionally with streaming data descriptors. */
function zip(files: TarFile[], options: { deflate?: boolean; descriptor?: boolean; encrypted?: boolean; size?: number } = {}): Buffer {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name)
    const data = Buffer.from(file.content ?? '')
    const payload = options.deflate ? deflateRawSync(data) : data
    const compressed = options.encrypted ? Buffer.concat([Buffer.alloc(12), payload]) : payload
    const flags = 0x800 | (options.descriptor ? 8 : 0) | (options.encrypted ? 1 : 0)
    const checksum = crc32(data)
    const record = Buffer.alloc(30)
    record.writeUInt32LE(0x04034b50)
    record.writeUInt16LE(20, 4)
    record.writeUInt16LE(flags, 6)
    record.writeUInt16LE(options.deflate ? 8 : 0, 8)
    if (!options.descriptor) {
      record.writeUInt32LE(checksum, 14)
      record.writeUInt32LE(compressed.length, 18)
      record.writeUInt32LE(options.size ?? data.length, 22)
    }
    record.writeUInt16LE(name.length, 26)
    const index = Buffer.alloc(46)
    index.writeUInt32LE(0x02014b50)
    index.writeUInt16LE(0x314, 4)
    index.writeUInt16LE(20, 6)
    index.writeUInt16LE(flags, 8)
    index.writeUInt16LE(options.deflate ? 8 : 0, 10)
    index.writeUInt32LE(checksum, 16)
    index.writeUInt32LE(compressed.length, 20)
    index.writeUInt32LE(options.size ?? data.length, 24)
    index.writeUInt16LE(name.length, 28)
    index.writeUInt32LE(((file.type === '2' ? 0o120777 : file.type === '5' ? 0o040755 : 0o100644) * 0x10000) >>> 0, 38)
    index.writeUInt32LE(offset, 42)
    central.push(index, name)
    local.push(record, name, compressed)
    offset += record.length + name.length + compressed.length
    if (options.descriptor) {
      const descriptor = Buffer.alloc(16)
      descriptor.writeUInt32LE(0x08074b50)
      descriptor.writeUInt32LE(checksum, 4)
      descriptor.writeUInt32LE(compressed.length, 8)
      descriptor.writeUInt32LE(data.length, 12)
      local.push(descriptor)
      offset += descriptor.length
    }
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}

/** Stored ZIP with data descriptors, so large fixtures never have to be allocated as one buffer. */
async function* streamingZip(files: { name: string; data: AsyncIterable<Buffer> }[]): AsyncGenerator<Buffer> {
  const indexes: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const empty = zip([{ name: file.name }], { descriptor: true })
    const directoryOffset = empty.readUInt32LE(empty.length - 22 + 16)
    const header = empty.subarray(0, directoryOffset - 16)
    const descriptor = empty.subarray(directoryOffset - 16, directoryOffset)
    const index = empty.subarray(directoryOffset, empty.length - 22)
    yield header
    let size = 0
    let checksum = 0
    for await (const chunk of file.data) {
      size += chunk.length
      checksum = crc32(chunk, checksum)
      yield chunk
    }
    descriptor.writeUInt32LE(checksum, 4)
    descriptor.writeUInt32LE(size, 8)
    descriptor.writeUInt32LE(size, 12)
    yield descriptor
    index.writeUInt32LE(checksum, 16)
    index.writeUInt32LE(size, 20)
    index.writeUInt32LE(size, 24)
    index.writeUInt32LE(offset, 42)
    indexes.push(index)
    offset += header.length + size + descriptor.length
  }
  yield* indexes
  const end = zip([])
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(indexes.reduce((total, index) => total + index.length, 0), 12)
  end.writeUInt32LE(offset, 16)
  yield end
}

const UPLOAD_BOUNDARY = 'market-streaming-test-boundary'

async function* multipart(data: AsyncIterable<Buffer>, filename: string): AsyncGenerator<Buffer> {
  yield Buffer.from(`--${UPLOAD_BOUNDARY}\r\nContent-Disposition: form-data; name="confirm"\r\n\r\ntrue\r\n--${UPLOAD_BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`)
  yield* data
  yield Buffer.from(`\r\n--${UPLOAD_BOUNDARY}--\r\n`)
}

function streamingRequest(data: AsyncIterable<Buffer>, signal?: AbortSignal): Request {
  const iterator = data[Symbol.asyncIterator]()
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next()
      if (cancelled) return
      if (next.done) controller.close()
      else controller.enqueue(next.value)
    },
    async cancel() {
      cancelled = true
      await iterator.return?.()
    },
  })
  return new Request('http://localhost/api/market/install-local', {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${UPLOAD_BOUNDARY}` },
    body,
    duplex: 'half',
    signal,
  } as RequestInit)
}

function localFiles(manifest: Record<string, unknown> = {}, extra: TarFile[] = []): TarFile[] {
  return [
    { name: 'package.json', content: JSON.stringify({ name: 'luckylillia-plugin-local', version: '1.0.0', type: 'module', main: 'index.js', llbot: {}, ...manifest }) },
    { name: 'index.js', content: 'export function apply() {}' },
    ...extra,
  ]
}

function npmArchive(files: TarFile[]): Buffer {
  return gzipSync(tar(files.map(file => ({ ...file, name: `package/${file.name}` }))))
}

function saveLocalArchive(data: Buffer): string {
  const directory = mkdtempSync(path.join(workDir, 'archive-'))
  const archive = path.join(directory, 'upload')
  writeFileSync(archive, data)
  return archive
}

async function readLocalPackage(data: Buffer, filename: string) {
  const archive = saveLocalArchive(data)
  return readArchive(archive, filename, path.join(path.dirname(archive), 'package'))
}

describe('local plugin archives', () => {
  it.each([{}, { deflate: true }, { deflate: true, descriptor: true }])('reads root-level ZIP packages, including Chinese file names (%j)', async options => {
    const result = await readLocalPackage(zip(localFiles({}, [
      { name: '素材/', type: '5' },
      { name: '素材/说明.txt', content: '你好，插件' },
    ]), options), '本地插件.ZIP')
    expect(result.manifest).toMatchObject({ name: 'luckylillia-plugin-local', version: '1.0.0' })
    expect(readFileSync(path.join(result.directory, '素材/说明.txt'), 'utf8')).toBe('你好，插件')
  })

  it.each(['plugin.tgz', 'plugin.tar.gz'])('reads npm packages without retaining the package/ wrapper (%s)', async filename => {
    const result = await readLocalPackage(npmArchive(localFiles()), filename)
    expect(readdirSync(result.directory).sort()).toEqual(['index.js', 'package.json'])
  })

  it('requires the correct root layout for each format', async () => {
    await expect(readLocalPackage(zip(localFiles().map(file => ({ ...file, name: `nested/${file.name}` }))), 'p.zip')).rejects.toThrow(/ZIP 顶层必须包含 package.json/)
    await expect(readLocalPackage(gzipSync(tar(localFiles())), 'p.tgz')).rejects.toThrow(/package\//)
  })

  it.each([
    ['../escape.js'], ['/absolute.js'], ['C:/escape.js'], ['..\\escape.js'], ['index.js:stream'],
    ['assets/../../escape.js'], ['assets/CON.txt'], ['package.json.'],
  ])('rejects unsafe paths before installation: %s', async name => {
    const files = localFiles({}, [{ name, content: 'bad' }])
    await expect(readLocalPackage(zip(files), 'p.zip')).rejects.toThrow()
    await expect(readLocalPackage(npmArchive(files), 'p.tgz')).rejects.toThrow(/不安全的路径/)
  })

  it('rejects duplicate names, case collisions and files used as directories', async () => {
    for (const files of [
      localFiles({}, [{ name: 'package.json', content: '{}' }]),
      localFiles({}, [{ name: 'PACKAGE.JSON', content: '{}' }]),
      localFiles({}, [{ name: 'assets/a.txt', content: 'a' }, { name: 'assets', content: 'b' }]),
      localFiles({}, [{ name: 'assets', content: 'b' }, { name: 'assets/a.txt', content: 'a' }]),
      localFiles({}, [{ name: 'assets/a.txt', content: 'a' }, { name: 'ASSETS/b.txt', content: 'b' }]),
    ]) {
      await expect(readLocalPackage(zip(files), 'p.zip')).rejects.toThrow(/重复路径|文件与目录冲突/)
      await expect(readLocalPackage(npmArchive(files), 'p.tgz')).rejects.toThrow(/重复路径|文件与目录冲突/)
    }
  })

  it('drops links in both formats, so they cannot redirect extracted files', async () => {
    const files = localFiles({}, [{ name: 'link', content: '../outside', type: '2', link: '../outside' }])
    expect(existsSync(path.join((await readLocalPackage(zip(files), 'p.zip')).directory, 'link'))).toBe(false)
    expect(existsSync(path.join((await readLocalPackage(npmArchive(files), 'p.tgz')).directory, 'link'))).toBe(false)
  })

  it('rejects damaged, truncated, encrypted and incorrectly sized archives', async () => {
    const damaged = zip(localFiles())
    damaged[damaged.indexOf(Buffer.from('export function'))] ^= 1
    await expect(readLocalPackage(damaged, 'p.zip')).rejects.toThrow(/校验失败/)
    await expect(readLocalPackage(zip(localFiles()).subarray(0, -10), 'p.zip')).rejects.toThrow(/损坏/)
    await expect(readLocalPackage(npmArchive(localFiles()).subarray(0, -10), 'p.tgz')).rejects.toThrow(/损坏/)
    await expect(readLocalPackage(zip(localFiles(), { encrypted: true }), 'p.zip')).rejects.toThrow(/加密/)
    await expect(readLocalPackage(zip(localFiles(), { deflate: true, size: 257 * 1024 * 1024 }), 'p.zip')).rejects.toThrow(/损坏|校验失败/)
    const truncatedTar = tar([{ name: 'package/package.json', content: '{}' }]).subarray(0, -1)
    await expect(readLocalPackage(gzipSync(truncatedTar), 'p.tgz')).rejects.toThrow(/incomplete|truncated/)
  })

  it.each([
    [{ name: '../escape' }, /有效的 npm 包名/],
    [{ version: 'latest' }, /完整版本号/],
    [{ llbot: null }, /llbot/],
    [{ llbot: [] }, /llbot/],
    [{ main: '../index.js' }, /不安全的路径/],
    [{ main: 'missing.js' }, /缺少入口文件/],
    [{ dependencies: { a: 12 } }, /dependencies/],
    [{ dependencies: { '../escape': '*' } }, /dependencies/],
    [{ bundleDependencies: ['../escape'] }, /bundleDependencies/],
  ])('validates the local manifest before installing (%j)', async (manifest, error) => {
    await expect(readLocalPackage(zip(localFiles(manifest as Record<string, unknown>)), 'p.zip')).rejects.toThrow(error as RegExp)
  })

  it('rejects missing or invalid JSON, empty uploads and unsupported formats', async () => {
    await expect(readLocalPackage(zip([{ name: 'package.json', content: '{' }]), 'p.zip')).rejects.toThrow(/UTF-8 JSON/)
    await expect(readLocalPackage(zip([{ name: 'index.js' }]), 'p.zip')).rejects.toThrow(/package.json/)
    await expect(readLocalPackage(Buffer.alloc(0), 'p.zip')).rejects.toThrow(/不能为空/)
    await expect(readLocalPackage(Buffer.from('archive'), 'p.rar')).rejects.toThrow(/ZIP 或 npm/)
  })

  it('accepts directories recorded after their files and a manifest larger than the former 1 MiB limit', async () => {
    const files = localFiles({ description: 'a'.repeat(1024 * 1024) }, [
      { name: 'assets/a.txt', content: 'a' }, { name: 'assets/', type: '5' },
    ])
    for (const [data, name] of [[zip(files), 'p.zip'], [npmArchive(files), 'p.tgz']] as const) {
      const result = await readLocalPackage(data, name)
      expect(result.manifest.description?.length).toBe(1024 * 1024)
      expect(readFileSync(path.join(result.directory, 'assets/a.txt'), 'utf8')).toBe('a')
    }
  })
})

describe('the tar reader', () => {
  async function streamed(tarball: Buffer, chunkSize: number) {
    async function* chunks() {
      for (let i = 0; i < tarball.length; i += chunkSize) yield tarball.subarray(i, i + chunkSize)
    }
    const files: { path: string; type: string; content: string }[] = []
    for await (const entry of readTarStream(chunks())) {
      const chunks: Buffer[] = []
      for await (const chunk of entry.data) chunks.push(chunk)
      files.push({ path: entry.path, type: entry.type, content: Buffer.concat(chunks).toString() })
    }
    return files
  }

  it.each([1, 7, 511, 513, 65536])('streams across header, pax and file boundaries (%i-byte chunks)', async chunkSize => {
    const long = `package/${'deep/'.repeat(30)}file.js`
    const data = tar([
      { name: 'package/', type: '5' },
      { name: long, content: '你好'.repeat(300) },
      { name: 'package/link', type: '2', link: '../outside' },
      { name: 'package/last.txt', content: 'last' },
    ])
    expect(await streamed(data, chunkSize)).toEqual([...readTar(data)].map(entry => ({ path: entry.path, type: entry.type, content: entry.data.toString() })))
  })

  it('checks streaming tar checksums, entry lengths and complete end markers', async () => {
    const data = tar([{ name: 'package/index.js', content: 'body' }])
    const corrupt = Buffer.from(data)
    corrupt[0] ^= 1
    await expect(streamed(corrupt, 7)).rejects.toThrow(/bad header/)
    for (const truncated of [data.subarray(0, 515), data.subarray(0, -1), data.subarray(0, -512)]) {
      await expect(streamed(truncated, 7)).rejects.toThrow(/truncated|incomplete/)
    }
    await expect(streamed(Buffer.concat([data, Buffer.from('trailing')]), 7)).rejects.toThrow(/data after end marker/)
  })

  it('streams GNU long names and pax path/size overrides while skipping unrelated metadata', async () => {
    const long = 'package/' + 'long/'.repeat(30) + 'file.js'
    const gnuName = Buffer.from(long + String.fromCharCode(0))
    const gnu = Buffer.concat([
      header('././@LongLink', gnuName.length, 'L'), padded(gnuName),
      header('short.js', 4, '0'), padded(Buffer.from('body')), Buffer.alloc(1024),
    ])
    expect(await streamed(gnu, 7)).toEqual([{ path: long, type: 'file', content: 'body' }])
    const record = (key: string, value: string) => {
      const text = ' ' + key + '=' + value + String.fromCharCode(10)
      let length = Buffer.byteLength(text) + 1
      while (Buffer.byteLength(String(length) + text) !== length) length = Buffer.byteLength(String(length) + text)
      return Buffer.from(String(length) + text)
    }
    const pax = Buffer.concat([record('comment', 'ignored'.repeat(1000)), record('path', 'package/说明.txt'), record('size', '4')])
    const data = Buffer.concat([
      header('PaxHeader', pax.length, 'x'), padded(pax),
      header('short.txt', 0, '0'), padded(Buffer.from('body')), Buffer.alloc(1024),
    ])
    expect(await streamed(data, 7)).toEqual([{ path: 'package/说明.txt', type: 'file', content: 'body' }])
  })

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
  llbot?: unknown
  keywords?: string[]
  /** Catalog membership is independent of the package manifest and keywords. */
  listed?: boolean
  pinnedVersion?: string
  title?: string
  description?: string
  author?: { name: string; url?: string }
  /** Category registered in the catalog, independently of llbot.category. */
  category?: PluginCategory
  /** Leaves the latest tag where it is */
  untagged?: boolean
  /** Serves bytes that fail the checksum */
  corrupt?: boolean
}

const CATALOG = '@luckylillia/market'

/** Serves real registry documents and tarballs, including the catalog package. */
async function startRegistry() {
  const documents = new Map<string, Packument>()
  const tarballs = new Map<string, Buffer>()
  const entries = new Map<string, { name: string; title: string; description: string; author: { name: string; url?: string }; repository: string; category?: PluginCategory }>()
  const versions = new Map<string, string>()
  let catalogVersion = 0
  let catalogFailure = 0
  const packageFailures = new Map<string, number>()
  let onRequest: ((url: URL) => void) | undefined
  const requests: URL[] = []
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://registry')
    requests.push(url)
    onRequest?.(url)
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (decodeURIComponent(url.pathname) === `/${CATALOG}` && catalogFailure) return send(catalogFailure, { error: 'Catalog unavailable' })
    const failure = packageFailures.get(decodeURIComponent(url.pathname.slice(1)))
    if (failure) return send(failure, { error: 'Package unavailable' })
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
      ...options.plugin ? { keywords: ['luckylillia-plugin'], llbot: {}, description: `${name} plugin`, author: 'Alice <alice@example.com>' } : {},
      ...options.llbot !== undefined ? { llbot: options.llbot } : {},
      ...options.keywords ? { keywords: options.keywords } : {},
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
    if (name === CATALOG) return
    if (options.listed === false) {
      entries.delete(name)
      versions.delete(name)
    } else if (options.plugin || options.listed) {
      entries.set(name, {
        name, title: options.title ?? name, description: options.description ?? `${name} plugin`,
        author: options.author ?? { name: 'Alice', url: 'https://github.com/alice' },
        repository: `https://github.com/example/${name.split('/').pop()}`,
        category: options.category,
      })
      if (options.pinnedVersion) versions.set(name, options.pinnedVersion)
      else if (!options.untagged || !versions.has(name)) versions.set(name, version)
    } else return
    publishCatalog()
  }

  function publishCatalog() {
    publish(CATALOG, `1.0.${++catalogVersion}`, { files: {
      'plugins.json': JSON.stringify([...entries.values()].map(entry => ({ ...entry, version: versions.get(entry.name) }))),
    } })
  }
  publishCatalog()

  return {
    url, publish, requests,
    pin: (name: string, version: string) => { versions.set(name, version); publishCatalog() },
    unlist: (name: string) => { entries.delete(name); versions.delete(name); publishCatalog() },
    failCatalog: (status = 503) => { catalogFailure = status },
    failPackage: (name: string, status: number) => { packageFailures.set(name, status) },
    onRequest: (callback: (url: URL) => void) => { onRequest = callback },
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

describe('the market', () => {
  let registry: Awaited<ReturnType<typeof startRegistry>>
  let ctx: Context
  let service: Fiber | undefined
  let pluginRoot: string
  let pluginsFile: string
  let market: Market

  const PLUGIN = 'luckylillia-plugin-greet'
  const emptyCategories = { protocol: 0, adapter: 0, chat: 0, tool: 0, service: 0, other: 0 }
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
    market = new Market(ctx, new Registry(registry.url), pluginRoot)
  })

  afterEach(async () => {
    await service?.dispose()
    service = undefined
    await registry.close()
  })

  const status = () => ctx.plugins.list().find(entry => entry.name === PLUGIN)
  const dir = (...parts: string[]) => path.join(pluginRoot, PLUGIN, ...parts)
  const versionAt = (...parts: string[]) => JSON.parse(readFileSync(dir(...parts, 'package.json'), 'utf8')).version
  const publishPlugin = (name: string, dependencies: Record<string, string> = {}, version = '1.0.0', options: Publish = {}) => registry.publish(name, version, {
    plugin: true, llbot: { dependencies }, files: { 'index.js': 'export function apply() {}' }, ...options,
  })
  const requestsFor = (name: string) => registry.requests.filter(url => (
    decodeURIComponent(url.pathname) === `/${name}`
    || decodeURIComponent(url.pathname).startsWith(`/${name}/-/`)
  ))
  const tarballRequests = () => registry.requests.filter(url => url.pathname.endsWith('.tgz') && !decodeURIComponent(url.pathname).startsWith(`/${CATALOG}/-/`))
  const catalogRequests = () => requestsFor(CATALOG).filter(url => decodeURIComponent(url.pathname) === `/${CATALOG}`)
  const installedVersion = (name: string) => JSON.parse(readFileSync(path.join(pluginRoot, name, 'package.json'), 'utf8')).version
  const installLocal = (data: Buffer, filename: string) => market.installLocal(saveLocalArchive(data), filename)
  const BUILTIN = '@luckylillia/plugin-example'
  const setupBuiltin = async () => {
    await service?.dispose()
    service = await ctx.plugin(PluginService, {
      file: pluginsFile, roots: [pluginRoot], trust: true, builtins: [{
        name: 'builtin:example', title: '示例内置插件', manifest: {},
        npm: { name: BUILTIN, version: '1.0.0', abi: 1 },
        plugin: { apply() { globalThis.__marketTest.push('bundled') } },
      }],
    })
    market = new Market(ctx, new Registry(registry.url), pluginRoot)
    return ctx.plugins.list().find(entry => entry.name === 'builtin:example')!
  }
  const publishBuiltin = (version: string, abi = 1) => publishPlugin(BUILTIN, {}, version, {
    llbot: { builtin: { entry: 'builtin:example', abi } },
    files: { 'index.js': "export function apply() { globalThis.__marketTest.push('updated') }" },
  })

  it('returns the whole catalog for the unified list without fetching individual plugin metadata', async () => {
    await setupBuiltin()
    publishBuiltin('1.1.0')
    for (let index = 0; index < 25; index++) publishPlugin(`luckylillia-plugin-full-${index}`)
    await market.install(PLUGIN, '1.0.0')
    registry.requests.length = 0
    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    const response = await routes.request('/api/market/catalog')
    expect(response.status).toBe(200)
    const { success, data } = await response.json() as { success: boolean; data: { name: string; builtin?: string }[] }
    expect(success).toBe(true)
    expect(data).toHaveLength(27)
    expect(data.find(item => item.name === BUILTIN)).toMatchObject({ name: BUILTIN, builtin: 'builtin:example' })
    expect(data.find(item => item.name === 'luckylillia-plugin-full-24')).toMatchObject({ name: 'luckylillia-plugin-full-24' })
    expect(requestsFor(PLUGIN)).toEqual([])
    expect(tarballRequests()).toEqual([])
    expect(catalogRequests()).toHaveLength(1)
  })

  it('filters catalog origins before counting and paging, using only registered builtin identities', async () => {
    await setupBuiltin()
    publishBuiltin('1.1.0')
    for (let index = 0; index < 25; index++) publishPlugin(`luckylillia-plugin-origin-${index}`)
    const impostor = '@luckylillia/plugin-impostor'
    publishPlugin(impostor, {}, '1.0.0', { llbot: { builtin: { entry: 'builtin:example', abi: 1 } } })
    expect((await market.search('', 1)).total).toBe(28)
    expect(await market.search('', 1, 'builtin')).toMatchObject({ total: 1, items: [{ name: BUILTIN, builtin: 'builtin:example' }] })
    const first = await market.search('', 1, 'third-party')
    const second = await market.search('', 2, 'third-party')
    expect(first.total).toBe(27)
    expect(first.items).toHaveLength(20)
    expect(second.total).toBe(27)
    expect(second.items).toHaveLength(7)
    expect([...first.items, ...second.items].every(item => !item.builtin && item.name !== BUILTIN)).toBe(true)
    expect(second.items.some(item => item.name === impostor)).toBe(true)
    expect((await market.search('origin', 1, 'third-party')).total).toBe(25)
    expect(await market.search('origin', 1, 'builtin')).toEqual({ total: 0, items: [], categories: emptyCategories })
    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    const response = await routes.request('/api/market/search?origin=third-party&page=2')
    expect(await response.json()).toMatchObject({ success: true, data: { total: 27, items: second.items.map(item => ({ name: item.name })) } })
    expect((await routes.request('/api/market/search?origin=unrecognized')).status).toBe(400)
  })

  it('filters every catalog category, treats uncategorized entries as other, and returns all category counts', async () => {
    const categories: PluginCategory[] = ['protocol', 'adapter', 'chat', 'tool', 'service', 'other']
    for (const category of categories) publishPlugin(`luckylillia-plugin-category-${category}`, {}, '1.0.0', { category })
    const counts = { protocol: 1, adapter: 1, chat: 1, tool: 1, service: 1, other: 2 }
    expect(await market.search('', 1)).toMatchObject({ total: 7, categories: counts })
    for (const category of categories) {
      const result = await market.search('', 1, 'all', category)
      const names = [`luckylillia-plugin-category-${category}`]
      if (category === 'other') names.unshift(PLUGIN)
      expect(result.items.map(item => item.name)).toEqual(names)
      expect(result.total).toBe(names.length)
      expect(result.categories).toEqual(counts)
    }
    expect(await market.search('not-in-catalog', 1, 'all', 'chat')).toEqual({ total: 0, items: [], categories: emptyCategories })
    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    expect(await (await routes.request('/api/market/search')).json()).toMatchObject({ success: true, data: { total: 7, categories: counts } })
    expect(await (await routes.request('/api/market/search?category=all')).json()).toMatchObject({ success: true, data: { total: 7, categories: counts } })
    expect((await routes.request('/api/market/search?category=unrecognized')).status).toBe(400)
  })

  it('combines category selection with keywords and origins while keeping counts for the other categories', async () => {
    await setupBuiltin()
    publishPlugin(BUILTIN, {}, '1.1.0', { category: 'service', title: '天气内置服务' })
    const tool = 'luckylillia-plugin-weather-tool'
    const service = 'luckylillia-plugin-weather-service'
    publishPlugin(tool, {}, '1.0.0', { category: 'tool', title: '天气工具' })
    publishPlugin(service, {}, '1.0.0', { category: 'service', title: '天气数据服务' })
    publishPlugin('luckylillia-plugin-conversation', {}, '1.0.0', { category: 'chat', title: '闲聊助手' })
    const all = await market.search('天气', 1, 'all', 'service')
    expect(all.items.map(item => item.name)).toEqual([BUILTIN, service])
    expect(all).toMatchObject({ total: 2, categories: { ...emptyCategories, tool: 1, service: 2 } })
    const thirdParty = await market.search('天气', 1, 'third-party', 'service')
    expect(thirdParty.items.map(item => item.name)).toEqual([service])
    expect(thirdParty).toMatchObject({ total: 1, categories: { ...emptyCategories, tool: 1, service: 1 } })
    expect(await market.search('天气', 1, 'builtin', 'tool')).toEqual({
      total: 0, items: [], categories: { ...emptyCategories, service: 1 },
    })
    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    const query = new URLSearchParams({ q: '天气', origin: 'third-party', category: 'service' })
    const response = await routes.request(`/api/market/search?${query}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: JSON.parse(JSON.stringify(thirdParty)) })
  })

  it('filters categories before pagination and counts all matching entries on every page', async () => {
    const tools: string[] = []
    for (let index = 0; index < 25; index++) {
      const name = `luckylillia-plugin-paged-tool-${index}`
      tools.push(name)
      publishPlugin(`luckylillia-plugin-paged-service-${index}`, {}, '1.0.0', { category: 'service' })
      publishPlugin(name, {}, '1.0.0', { category: 'tool' })
    }
    const first = await market.search('paged', 1, 'all', 'tool')
    const second = await market.search('paged', 2, 'all', 'tool')
    const empty = await market.search('paged', 3, 'all', 'tool')
    expect(first.items.map(item => item.name)).toEqual(tools.slice(0, 20))
    expect(second.items.map(item => item.name)).toEqual(tools.slice(20))
    expect(empty.items).toEqual([])
    for (const page of [first, second, empty]) {
      expect(page.total).toBe(25)
      expect(page.categories).toEqual({ ...emptyCategories, tool: 25, service: 25 })
    }
  })

  it('takes categories from the catalog instead of npm manifests or installed plugin metadata', async () => {
    const categorized = 'luckylillia-plugin-category-source'
    const uncategorized = 'luckylillia-plugin-category-source-missing'
    publishPlugin(categorized, {}, '1.0.0', { category: 'tool', llbot: { category: 'chat' } })
    publishPlugin(uncategorized, {}, '1.0.0', { llbot: { category: 'service' } })
    const before = await market.search('category-source', 1)
    expect(before.categories).toEqual({ ...emptyCategories, tool: 1, other: 1 })
    expect(requestsFor(categorized)).toEqual([])
    expect(requestsFor(uncategorized)).toEqual([])
    await market.install(categorized)
    expect(JSON.parse(readFileSync(path.join(pluginRoot, categorized, 'package.json'), 'utf8')).llbot.category).toBe('chat')
    const tools = await market.search('category-source', 1, 'all', 'tool')
    expect(tools.items).toEqual([expect.objectContaining({ name: categorized, category: 'tool', installed: '1.0.0' })])
    expect(tools.categories).toEqual(before.categories)
    expect((await market.search('category-source', 1, 'all', 'chat')).items).toEqual([])
    expect((await market.search('category-source', 1, 'all', 'other')).items.map(item => item.name)).toEqual([uncategorized])
  })

  it('lists bundled npm plugins and installs approved updates without replacing the running builtin', async () => {
    const entry = await setupBuiltin()
    await ctx.plugins.enable(entry.id)
    publishBuiltin('1.0.0')
    expect(await market.updates()).toEqual({ [BUILTIN]: { latest: '1.0.0' } })
    expect(market.installed()).toContainEqual(expect.objectContaining({
      name: BUILTIN, version: '1.0.0', builtin: 'builtin:example', managed: true, activeVersion: '1.0.0',
    }))
    publishBuiltin('1.1.0')
    expect(await market.updates()).toEqual({ [BUILTIN]: { latest: '1.1.0', update: '1.1.0' } })
    const configBefore = readFileSync(pluginsFile, 'utf8')
    const outcome = await market.update(BUILTIN, '1.1.0', '1.0.0')
    expect(outcome).toMatchObject({ previous: '1.0.0', version: '1.1.0', entries: [entry.id], reload: { status: 'restart-required' } })
    expect(market.installed()).toContainEqual(expect.objectContaining({ name: BUILTIN, version: '1.1.0', activeVersion: '1.0.0', restartRequired: true }))
    expect(readFileSync(pluginsFile, 'utf8')).toBe(configBefore)
    expect(ctx.plugins.packageList()).toEqual([])
    expect(globalThis.__marketTest).not.toContain('updated')
    expect(await market.updates()).toEqual({ [BUILTIN]: { latest: '1.1.0' } })
  })

  it('requires compatible catalog approval for builtins and rejects local replacement and uninstall', async () => {
    await setupBuiltin()
    publishBuiltin('1.1.0', 99)
    expect((await market.updates())[BUILTIN]).toMatchObject({ blocked: expect.stringContaining('different Bot runtime') })
    await expect(market.update(BUILTIN, '1.1.0', '1.0.0')).rejects.toMatchObject({ status: 409 })
    publishBuiltin('1.1.0')
    registry.unlist(BUILTIN)
    await expect(market.update(BUILTIN, '1.1.0', '1.0.0')).rejects.toMatchObject({ status: 404 })
    await expect(installLocal(zip(localFiles({ name: BUILTIN, version: '1.1.0' })), 'builtin.zip'))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('不能用本地包覆盖') })
    await expect(market.uninstall(BUILTIN)).rejects.toMatchObject({ status: 409, message: '内置插件不能卸载' })
    expect(existsSync(path.join(pluginRoot, BUILTIN))).toBe(false)
    expect(ctx.plugins.builtinPackageList()[0].version).toBe('1.0.0')
  })

  it('installs an unlisted local ZIP with the catalog offline, without executing plugin code or install scripts', async () => {
    registry.failCatalog()
    const outcome = await installLocal(zip(localFiles({
      name: PLUGIN, version: '3.0.0', scripts: { postinstall: 'node -e "process.exit(1)"' },
    }, [{ name: 'assets/说明.txt', content: '本地文件' }])), '测试插件.zip')
    expect(outcome).toMatchObject({ name: PLUGIN, version: '3.0.0', scripts: [PLUGIN], packages: 1, entries: [status()!.id] })
    expect(status()).toMatchObject({ disabled: true, version: '3.0.0' })
    expect(versionAt()).toBe('3.0.0')
    expect(readFileSync(dir('assets/说明.txt'), 'utf8')).toBe('本地文件')
    expect(globalThis.__marketTest).toEqual([])
    expect(registry.requests).toEqual([])
    expect(readdirNames(pluginRoot)).toEqual([PLUGIN])
  })

  it.each(['local.tgz', 'local.tar.gz'])('installs scoped local npm packages from %s', async filename => {
    const name = '@example/local-plugin'
    const outcome = await installLocal(npmArchive(localFiles({ name })), filename)
    expect(outcome).toMatchObject({ name, version: '1.0.0', packages: 1 })
    expect(installedVersion(name)).toBe('1.0.0')
    expect(existsSync(path.join(pluginRoot, name, 'index.js'))).toBe(true)
    expect(existsSync(path.join(pluginRoot, name, 'package'))).toBe(false)
    expect(market.installed()).toContainEqual(expect.objectContaining({ name, managed: true }))
    expect(registry.requests).toEqual([])
  })

  it('resolves npm library dependencies for a local package, including aliases and optional dependencies', async () => {
    const outcome = await installLocal(zip(localFiles({
      name: PLUGIN, dependencies: { a: '^1.0.0', b: '^1.0.0', cordis: '*' }, optionalDependencies: { 'native-x': '^1.0.0' },
    })), 'p.zip')
    expect(outcome).toMatchObject({ packages: 6, skipped: ['native-x'] })
    expect(versionAt('node_modules/a')).toBe('1.0.0')
    expect(versionAt('node_modules/b/node_modules/c')).toBe('2.0.0')
    expect(versionAt('node_modules/d')).toBe('1.0.0')
    expect(existsSync(dir('node_modules/cordis'))).toBe(false)
    expect(requestsFor(PLUGIN)).toEqual([])
    expect(catalogRequests()).toEqual([])
  })

  it('preserves bundled npm dependencies in local archives without downloading them', async () => {
    const outcome = await installLocal(npmArchive(localFiles({
      name: PLUGIN, dependencies: { bundled: '^1.0.0' }, bundleDependencies: ['bundled'],
    }, [
      { name: 'node_modules/bundled/package.json', content: JSON.stringify({ name: 'bundled', version: '1.0.0', main: 'index.js' }) },
      { name: 'node_modules/bundled/index.js', content: 'module.exports = 42' },
    ])), 'p.tgz')
    expect(outcome.packages).toBe(1)
    expect(versionAt('node_modules/bundled')).toBe('1.0.0')
    expect(readFileSync(dir('node_modules/bundled/index.js'), 'utf8')).toBe('module.exports = 42')
    expect(registry.requests).toEqual([])
  })

  it('installs missing plugin dependencies of a local upload from one catalog snapshot', async () => {
    const provider = 'lucky-lillia-provider'
    publishPlugin(provider)
    const outcome = await installLocal(zip(localFiles({
      name: PLUGIN, version: '4.0.0', llbot: { dependencies: { [provider]: '^1.0.0' } }, dependencies: { [provider]: '^1.0.0' },
    })), 'p.zip')
    expect(outcome.dependencies).toEqual([expect.objectContaining({ name: provider, version: '1.0.0' })])
    expect(ctx.plugins.list().find(entry => entry.name === provider)?.disabled).toBe(true)
    expect(installedVersion(provider)).toBe('1.0.0')
    expect(versionAt()).toBe('4.0.0')
    expect(existsSync(dir('node_modules', provider))).toBe(false)
    expect(requestsFor(PLUGIN)).toEqual([])
    expect(catalogRequests()).toHaveLength(1)
  })

  it('reuses installed local plugin dependencies with the catalog offline and protects their consumers', async () => {
    const provider = 'local-provider'
    await installLocal(zip(localFiles({ name: provider })), 'provider.zip')
    registry.failCatalog()
    const outcome = await installLocal(zip(localFiles({ name: PLUGIN, llbot: { dependencies: { [provider]: '^1.0.0' } } })), 'p.zip')
    expect(outcome.dependencies).toBeUndefined()
    await expect(installLocal(zip(localFiles({ name: provider, version: '2.0.0' })), 'provider.zip')).rejects.toThrow(/would break that dependency/)
    expect(installedVersion(provider)).toBe('1.0.0')
    expect(registry.requests).toEqual([])
  })

  it('does not bypass catalog requirements for missing plugins or SDK compatibility on a local install', async () => {
    await expect(installLocal(zip(localFiles({ name: PLUGIN, llbot: { dependencies: { unlisted: '^1.0.0' } } })), 'p.zip')).rejects.toThrow(/not found in the plugin market list/)
    await expect(installLocal(zip(localFiles({ name: PLUGIN, peerDependencies: { '@luckylillia/plugin-sdk': '^999.0.0' } })), 'p.zip')).rejects.toMatchObject({ status: 409 })
    expect(readdirNames(pluginRoot)).toEqual([])
    expect(status()).toBeUndefined()
  })

  it('replaces a running plugin from a local archive and reloads the existing entry', async () => {
    const files = (version: string) => localFiles({ name: PLUGIN, version }).map(file => file.name === 'index.js'
      ? { ...file, content: `export function apply() { globalThis.__marketTest.push('${version}') }` }
      : file)
    await installLocal(zip(files('1.0.0')), 'p.zip')
    const id = status()!.id
    await ctx.plugins.enable(id, { trust: true })
    const outcome = await installLocal(npmArchive(files('2.0.0')), 'p.tgz')
    expect(outcome).toMatchObject({ previous: '1.0.0', version: '2.0.0', entries: [id], reload: { status: 'reloaded' } })
    expect(globalThis.__marketTest).toEqual(['1.0.0', '2.0.0'])
    expect(status()).toMatchObject({ id, disabled: false, version: '2.0.0' })
  })

  it('keeps the installed version and entries when a local archive or its dependency download fails', async () => {
    await installLocal(zip(localFiles({ name: PLUGIN })), 'p.zip')
    const id = status()!.id
    const damaged = zip(localFiles({ name: PLUGIN, version: '2.0.0' }))
    damaged[damaged.indexOf(Buffer.from('export function'))] ^= 1
    await expect(installLocal(damaged, 'p.zip')).rejects.toThrow(/校验失败/)
    await expect(installLocal(zip(localFiles({ name: PLUGIN, version: '2.0.0', dependencies: { missing: '^1' } })), 'p.zip')).rejects.toThrow(/not found/)
    expect(versionAt()).toBe('1.0.0')
    expect(status()?.id).toBe(id)
    expect(readdirNames(pluginRoot)).toEqual([PLUGIN])
  })

  it('checks the gzip footer before installing dependencies or replacing the old plugin', async () => {
    await installLocal(zip(localFiles({ name: PLUGIN })), 'p.zip')
    const provider = 'local-footer-provider'
    publishPlugin(provider)
    const damaged = npmArchive(localFiles({ name: PLUGIN, version: '2.0.0', llbot: { dependencies: { [provider]: '^1' } } }))
    damaged[damaged.length - 8] ^= 1
    await expect(installLocal(damaged, 'p.tgz')).rejects.toThrow(/损坏/)
    expect(registry.requests).toEqual([])
    expect(versionAt()).toBe('1.0.0')
    expect(readdirNames(pluginRoot)).toEqual([PLUGIN])
  })

  it('leaves a linked development plugin untouched by a local upload', async () => {
    const dev = mkdtempSync(path.join(workDir, 'local-dev-'))
    for (const file of localFiles({ name: PLUGIN })) writeFileSync(path.join(dev, file.name), file.content!)
    mkdirSync(pluginRoot, { recursive: true })
    symlinkSync(dev, dir(), 'junction')
    await ctx.plugins.scan()
    await expect(installLocal(zip(localFiles({ name: PLUGIN, version: '2.0.0' })), 'p.zip')).rejects.toMatchObject({ status: 409 })
    expect(JSON.parse(readFileSync(path.join(dev, 'package.json'), 'utf8')).version).toBe('1.0.0')
    expect(registry.requests).toEqual([])
  })

  it('requires an explicit risk confirmation and one uploaded file through the WebUI route', async () => {
    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    const data = zip(localFiles({ name: PLUGIN }))
    const form = (confirm?: string) => {
      const body = new FormData()
      body.set('file', new File([data], '本地插件.zip'))
      if (confirm !== undefined) body.set('confirm', confirm)
      return body
    }
    const upload = async (body: FormData, headers?: Record<string, string>) => {
      const response = await routes.request('/api/market/install-local', { method: 'POST', body, headers })
      return { status: response.status, ...await response.json() as any }
    }
    for (const confirm of [undefined, 'false']) {
      expect(await upload(form(confirm))).toMatchObject({ status: 400, success: false, message: expect.stringContaining('确认') })
    }
    expect(readdirNames(pluginRoot)).toEqual([])
    const missing = form('true')
    missing.set('file', 'not a file')
    expect(await upload(missing)).toMatchObject({ status: 400, success: false })
    const multiple = form('true')
    multiple.append('file', new File([data], 'other.zip'))
    expect(await upload(multiple)).toMatchObject({ status: 400, success: false })
    const duplicateConfirmation = form('true')
    duplicateConfirmation.append('confirm', 'true')
    expect(await upload(duplicateConfirmation)).toMatchObject({ status: 400, success: false })
    expect(readdirNames(pluginRoot)).toEqual([])
    expect(await upload(form('true'))).toMatchObject({ status: 200, success: true, data: { name: PLUGIN, version: '1.0.0', entries: [expect.any(String)] } })
    expect(status()?.disabled).toBe(true)
    const invalid = form('true')
    invalid.set('file', new File(['broken'], 'p.zip'))
    expect(await upload(invalid)).toMatchObject({ status: 400, success: false })
    expect(versionAt()).toBe('1.0.0')
    expect(readdirNames(pluginRoot)).toEqual([PLUGIN])
  })

  it.each(['zip', 'tgz'])('streams a 257 MiB local %s through the upload route and into place', async format => {
    const size = 257 * 1024 * 1024
    const tail = Buffer.from('large file complete')
    const files = localFiles({ name: PLUGIN })
    async function* largeFile() {
      const chunk = Buffer.alloc(64 * 1024, 0x62)
      for (let remaining = size - tail.length; remaining > 0; remaining -= chunk.length) {
        yield chunk.subarray(0, Math.min(chunk.length, remaining))
      }
      yield tail
    }
    async function* npmTar() {
      yield tar(files.map(file => ({ ...file, name: `package/${file.name}` }))).subarray(0, -1024)
      yield header('package/data/large.bin', size, '0')
      yield* largeFile()
      yield Buffer.alloc(1024)
    }
    const archive = format === 'zip' ? streamingZip([
      ...files.map(file => ({ name: file.name, data: Readable.from([Buffer.from(file.content ?? '')]) })),
      { name: 'data/large.bin', data: largeFile() },
    ]) : Readable.from(npmTar()).pipe(createGzip())
    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    const response = await routes.fetch(streamingRequest(multipart(archive, `大插件.${format}`)))
    expect(await response.json()).toMatchObject({ success: true, data: { name: PLUGIN, version: '1.0.0' } })
    expect(response.status).toBe(200)
    expect((await stat(dir('data/large.bin'))).size).toBe(size)
    const handle = await open(dir('data/large.bin'))
    try {
      const buffer = Buffer.alloc(tail.length)
      await handle.read(buffer, 0, buffer.length, size - buffer.length)
      expect(buffer).toEqual(tail)
    } finally {
      await handle.close()
    }
    expect(status()?.disabled).toBe(true)
    expect(readdirNames(pluginRoot)).toEqual([PLUGIN])
  }, 60_000)

  it.each(['truncated', 'disconnected', 'aborted'])('cleans a %s multipart upload and keeps the installed plugin', async failure => {
    await installLocal(zip(localFiles({ name: PLUGIN })), 'p.zip')
    const id = status()!.id
    const controller = new AbortController()
    async function* interrupted() {
      const parts = multipart(Readable.from([zip(localFiles({ name: PLUGIN, version: '2.0.0' }))]), 'p.zip')
      yield (await parts.next()).value!
      yield (await parts.next()).value!
      if (failure === 'disconnected') throw new Error('connection lost')
      if (failure === 'aborted') controller.abort()
      // No closing boundary: receiving a full archive alone must not commit the installation.
    }
    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    const response = await routes.fetch(streamingRequest(interrupted(), controller.signal))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ success: false })
    expect(versionAt()).toBe('1.0.0')
    expect(status()?.id).toBe(id)
    expect(readdirNames(pluginRoot)).toEqual([PLUGIN])
  })

  it('lists catalog metadata and marks the installed ones without npm keyword search', async () => {
    expect((await market.search('', 1)).items).toEqual([{
      name: PLUGIN, version: '1.0.0', title: PLUGIN, description: `${PLUGIN} plugin`,
      author: { name: 'Alice', url: 'https://github.com/alice' },
      repository: `https://github.com/example/${PLUGIN}`, installed: undefined,
    }])
    expect(requestsFor(PLUGIN)).toEqual([])
    await market.install(PLUGIN)
    expect((await market.search('', 1)).items[0].installed).toBe('1.0.0')
    expect(registry.requests.some(url => url.pathname === '/-/v1/search')).toBe(false)
  })

  it('filters Chinese titles, descriptions, authors and package names before paginating the catalog', async () => {
    for (let index = 0; index < 25; index++) publishPlugin(`luckylillia-plugin-cat-${index.toString().padStart(2, '0')}`, {}, '1.0.0', {
      title: `猫咪助手 ${index}`, description: '每日推送天气预报', author: { name: '小明' }, keywords: [],
    })
    const first = await market.search('猫咪', 1)
    const second = await market.search('猫咪', 2)
    expect(first.total).toBe(25)
    expect(first.items).toHaveLength(20)
    expect(second.total).toBe(25)
    expect(second.items).toHaveLength(5)
    expect(new Set([...first.items, ...second.items].map(item => item.name)).size).toBe(25)
    expect((await market.search('天气', 1)).total).toBe(25)
    expect((await market.search('小明', 1)).total).toBe(25)
    expect((await market.search('CAT-24', 1)).items.map(item => item.name)).toEqual(['luckylillia-plugin-cat-24'])
    expect((await market.search('猫咪 天气', 1)).total).toBe(25)
    expect((await market.search('不存在', 1)).items).toEqual([])
    expect(requestsFor(PLUGIN)).toEqual([])
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

  it('installs recursive plugin dependencies as separate disabled entries, keeping npm libraries local', async () => {
    const provider = 'lucky-lillia-aiprovider'
    const engine = '@example/luckylillia-plugin-engine'
    publishPlugin(engine)
    publishPlugin(provider, { [engine]: '^1.0.0' }, '1.0.0', { dependencies: { a: '^1.0.0' } })
    publishPlugin(PLUGIN, { [provider]: '^1.0.0' }, '1.0.0', { dependencies: { b: '^1.0.0', [provider]: '^1.0.0' } })

    const outcome = await market.install(PLUGIN)
    expect(outcome.dependencies?.map(pkg => pkg.name)).toEqual([engine, provider])
    expect(outcome.dependencies).toEqual([engine, provider].map(name => expect.objectContaining({
      name, version: '1.0.0', entries: [ctx.plugins.list().find(entry => entry.name === name)!.id],
    })))
    expect(ctx.plugins.list().filter(entry => !entry.builtin)).toEqual(expect.arrayContaining([engine, provider, PLUGIN].map(name => expect.objectContaining({ name, disabled: true }))))
    expect(market.installed().map(pkg => pkg.name).sort()).toEqual([engine, provider, PLUGIN].sort())
    expect(installedVersion(engine)).toBe('1.0.0')
    expect(installedVersion(provider)).toBe('1.0.0')
    expect(JSON.parse(readFileSync(path.join(pluginRoot, provider, 'node_modules/a/package.json'), 'utf8')).version).toBe('1.0.0')
    expect(versionAt('node_modules', 'b')).toBe('1.0.0')
    expect(existsSync(dir('node_modules', provider))).toBe(false)
    expect(existsSync(path.join(pluginRoot, provider, 'node_modules', engine))).toBe(false)
  })

  it('uses the pinned common plugin version across a diamond and downloads it once', async () => {
    const left = 'luckylillia-plugin-left'
    const right = 'luckylillia-plugin-right'
    const bridge = 'luckylillia-plugin-bridge'
    const shared = 'luckylillia-plugin-shared'
    for (const version of ['1.0.0', '1.5.0', '2.0.0']) publishPlugin(shared, {}, version)
    registry.pin(shared, '1.5.0')
    publishPlugin(left, { [shared]: '>=1.0.0 <3.0.0' })
    publishPlugin(right, { [bridge]: '^1.0.0' })
    publishPlugin(bridge, { [shared]: '^1.0.0' })
    publishPlugin(PLUGIN, { [left]: '^1.0.0', [right]: '^1.0.0' })

    const outcome = await market.install(PLUGIN)
    expect(installedVersion(shared)).toBe('1.5.0')
    expect(outcome.dependencies?.map(pkg => pkg.name)).toEqual([shared, left, bridge, right])
    expect(requestsFor(shared).filter(url => decodeURIComponent(url.pathname) === `/${shared}`)).toHaveLength(1)
    expect(requestsFor(shared).filter(url => url.pathname.endsWith('.tgz')).map(url => url.pathname)).toEqual([`/${shared}/-/${shared}-1.5.0.tgz`])
    expect(ctx.plugins.list().filter(entry => entry.name === shared)).toHaveLength(1)
    expect(existsSync(path.join(pluginRoot, left, 'node_modules', shared))).toBe(false)
    expect(catalogRequests()).toHaveLength(1)
  })

  it('keeps one catalog snapshot across the dependency graph while a new catalog is published', async () => {
    const dependency = 'luckylillia-plugin-snapshot'
    publishPlugin(dependency)
    publishPlugin(dependency, {}, '2.0.0', { pinnedVersion: '1.0.0' })
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0' })
    let advanced = false
    registry.onRequest(url => {
      if (!advanced && decodeURIComponent(url.pathname) === `/${PLUGIN}`) {
        advanced = true
        registry.pin(dependency, '2.0.0')
      }
    })

    const outcome = await market.install(PLUGIN)
    expect(advanced).toBe(true)
    expect(outcome.dependencies).toEqual([expect.objectContaining({ name: dependency, version: '1.0.0' })])
    expect(catalogRequests()).toHaveLength(1)
    expect(installedVersion(dependency)).toBe('1.0.0')
    expect((await market.search('snapshot', 1)).items).toEqual([expect.objectContaining({ name: dependency, version: '2.0.0', installed: '1.0.0' })])
  })

  it('rejects a pinned dependency outside the required range instead of selecting another npm version', async () => {
    const dependency = 'luckylillia-plugin-range'
    publishPlugin(dependency)
    publishPlugin(dependency, {}, '2.0.0')
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0' })

    await expect(market.install(PLUGIN)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('only lists 2.0.0') })
    expect(requestsFor(dependency)).toEqual([])
    expect(tarballRequests()).toEqual([])
    expect(readdirNames(pluginRoot)).toEqual([])
  })

  it('rejects an SDK-incompatible pinned dependency instead of selecting a compatible older version', async () => {
    const dependency = 'luckylillia-plugin-incompatible'
    publishPlugin(dependency)
    publishPlugin(dependency, {}, '2.0.0', { peerDependencies: { '@luckylillia/plugin-sdk': '^99.0.0' } })
    publishPlugin(PLUGIN, { [dependency]: '*' })

    await expect(market.install(PLUGIN)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('^99.0.0') })
    expect(tarballRequests()).toEqual([])
    expect(readdirNames(pluginRoot)).toEqual([])
  })

  it.each(['plugin', 'dependency'])('rejects a catalog %s version missing from npm without falling back', async kind => {
    const dependency = 'luckylillia-plugin-missing-release'
    publishPlugin(dependency)
    publishPlugin(PLUGIN, { [dependency]: '*' })
    const missing = kind === 'plugin' ? PLUGIN : dependency
    registry.pin(missing, '9.9.9')

    await expect(market.install(PLUGIN)).rejects.toMatchObject({ status: 404, message: expect.stringContaining('9.9.9') })
    expect(tarballRequests()).toEqual([])
    expect(readdirNames(pluginRoot)).toEqual([])
  })

  it.each(['managed', 'junction'] as const)('reuses an installed compatible %s plugin without consulting the registry for it', async kind => {
    const dependency = 'luckylillia-plugin-local'
    publishPlugin(dependency)
    if (kind === 'managed') {
      await market.install(dependency)
    } else {
      const devRoot = mkdtempSync(path.join(workDir, 'linked-plugin-'))
      writeFileSync(path.join(devRoot, 'package.json'), JSON.stringify({ name: dependency, version: '1.0.0', type: 'module', main: 'index.js', llbot: {} }))
      writeFileSync(path.join(devRoot, 'index.js'), 'export function apply() {}')
      mkdirSync(pluginRoot, { recursive: true })
      symlinkSync(devRoot, path.join(pluginRoot, dependency), 'junction')
      await ctx.plugins.scan()
      expect(market.installed()).toContainEqual(expect.objectContaining({ name: dependency, managed: false }))
    }
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0' })
    registry.unlist(dependency)
    registry.requests.length = 0

    const outcome = await market.install(PLUGIN)
    expect(outcome.dependencies).toBeUndefined()
    expect(requestsFor(dependency)).toEqual([])
    expect(installedVersion(dependency)).toBe('1.0.0')
    expect(ctx.plugins.list().filter(entry => entry.name === dependency)).toHaveLength(1)
  })

  it('refuses an incompatible installed dependency without replacing it or changing entries', async () => {
    const dependency = 'luckylillia-plugin-existing'
    publishPlugin(dependency)
    await market.install(dependency)
    await ctx.plugins.enable(ctx.plugins.list().find(entry => entry.name === dependency)!.id, { trust: true })
    const entriesBefore = readFileSync(pluginsFile, 'utf8')
    publishPlugin(dependency, {}, '2.0.0')
    publishPlugin(PLUGIN, { [dependency]: '^2.0.0' })
    registry.requests.length = 0

    await expect(market.install(PLUGIN)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('already installed') })
    expect(installedVersion(dependency)).toBe('1.0.0')
    expect(readFileSync(pluginsFile, 'utf8')).toBe(entriesBefore)
    expect(readdirNames(pluginRoot)).toEqual([dependency])
    expect(requestsFor(dependency)).toEqual([])
    expect(tarballRequests()).toEqual([])
  })

  it('accepts a pinned missing dependency that also satisfies already installed consumers', async () => {
    const consumer = 'luckylillia-plugin-existing-consumer'
    const dependency = 'luckylillia-plugin-shared-missing'
    const consumerDir = path.join(pluginRoot, consumer)
    mkdirSync(consumerDir, { recursive: true })
    writeFileSync(path.join(consumerDir, 'package.json'), JSON.stringify({
      name: consumer, version: '1.0.0', type: 'module', main: 'index.js',
      llbot: { dependencies: { [dependency]: '^1.0.0' } },
    }))
    writeFileSync(path.join(consumerDir, 'index.js'), 'export function apply() {}')
    await ctx.plugins.scan()
    const consumerEntry = ctx.plugins.list().find(entry => entry.name === consumer)!
    await ctx.plugins.enable(consumerEntry.id, { trust: true })
    expect(ctx.plugins.list().find(entry => entry.id === consumerEntry.id)?.state).toBe('pending')
    publishPlugin(dependency, {}, '1.0.0')
    publishPlugin(dependency, {}, '2.0.0')
    registry.pin(dependency, '1.0.0')
    publishPlugin(PLUGIN, { [dependency]: '*' })

    const outcome = await market.install(PLUGIN)
    expect(outcome.dependencies).toEqual([expect.objectContaining({ name: dependency, version: '1.0.0' })])
    expect(installedVersion(dependency)).toBe('1.0.0')
    await expect.poll(() => ctx.plugins.list().find(entry => entry.id === consumerEntry.id)?.state).toBe('active')
  })

  it('rejects an unlisted dependency before fetching its metadata or writing any packages', async () => {
    const dependency = 'luckylillia-plugin-unlisted'
    publishPlugin(dependency, {}, '1.0.0', { listed: false })
    publishPlugin(`${dependency}-lookalike`)
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0' })

    await expect(market.install(PLUGIN)).rejects.toMatchObject({ status: 404, message: expect.stringContaining('plugin market list') })
    expect(requestsFor(dependency)).toEqual([])
    expect(tarballRequests()).toEqual([])
    expect(readdirNames(pluginRoot)).toEqual([])
    expect(market.installed()).toEqual([])
  })

  it('accepts a catalog entry even when the npm package has no market keyword', async () => {
    const dependency = 'luckylillia-plugin-no-keyword'
    publishPlugin(dependency, {}, '1.0.0', { keywords: ['other'] })
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0' })
    expect((await market.search('no-keyword', 1)).items.map(item => item.name)).toEqual([dependency])
    const outcome = await market.install(PLUGIN)
    expect(outcome.dependencies).toEqual([expect.objectContaining({ name: dependency, version: '1.0.0' })])
  })

  it('fails closed when the catalog is unavailable, even after a successful load', async () => {
    await market.install(PLUGIN)
    registry.failCatalog()
    registry.requests.length = 0

    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    for (const action of ['install', 'search', 'updates']) {
      const response = await routes.request(`/api/market/${action}`, action === 'install' ? {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: PLUGIN }),
      } : undefined)
      expect(response.status).toBe(502)
      expect(await response.json()).toMatchObject({ success: false, message: expect.stringContaining('503') })
    }
    expect(requestsFor(PLUGIN)).toEqual([])
    expect(tarballRequests()).toEqual([])
    expect(installedVersion(PLUGIN)).toBe('1.0.0')
  })

  it('uses its catalog even when the download registry has a different catalog', async () => {
    const dependency = 'luckylillia-plugin-download-only'
    publishPlugin(dependency)
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0' })
    const catalogRegistry = await startRegistry()
    try {
      catalogRegistry.publish(PLUGIN, '1.0.0', { plugin: true })
      const configured = new Market(ctx, new Registry(registry.url), pluginRoot, new Catalog(new Registry(catalogRegistry.url)))
      await expect(configured.install(PLUGIN)).rejects.toMatchObject({ status: 404, message: expect.stringContaining('plugin market list') })
      expect(requestsFor(dependency)).toEqual([])
      expect(catalogRequests()).toEqual([])
      expect(catalogRegistry.requests.filter(url => decodeURIComponent(url.pathname) === `/${CATALOG}`)).toHaveLength(1)
      expect(tarballRequests()).toEqual([])
      expect(readdirNames(pluginRoot)).toEqual([])
    } finally {
      await catalogRegistry.close()
    }
  })

  it('rejects invalid dependency declarations and listed packages without a plugin manifest', async () => {
    for (const dependencies of [[], { a: 123 }, { a: 'file:../a' }]) {
      publishPlugin(PLUGIN, {}, '1.0.0', { llbot: { dependencies } })
      await expect(market.install(PLUGIN)).rejects.toMatchObject({ status: 400 })
    }
    registry.publish('listed-library', '1.0.0', { listed: true })
    publishPlugin(PLUGIN, { 'listed-library': '^1.0.0' })
    await expect(market.install(PLUGIN)).rejects.toMatchObject({ status: 400, message: expect.stringContaining('no llbot field') })
    expect(tarballRequests()).toEqual([])
    expect(readdirNames(pluginRoot)).toEqual([])
  })

  it('rejects plugin cycles and incompatible graph ranges before downloading anything', async () => {
    const dependency = 'luckylillia-plugin-cycle'
    publishPlugin(dependency, { [PLUGIN]: '^1.0.0' })
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0' })
    await expect(market.install(PLUGIN)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('circular') })
    expect(tarballRequests()).toEqual([])
    expect(readdirNames(pluginRoot)).toEqual([])

    const other = 'luckylillia-plugin-conflicting'
    publishPlugin(dependency)
    publishPlugin(other, { [dependency]: '^2.0.0' })
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0', [other]: '^1.0.0' })
    await expect(market.install(PLUGIN)).rejects.toMatchObject({ status: 409 })
    expect(tarballRequests()).toEqual([])
    expect(readdirNames(pluginRoot)).toEqual([])
  })

  it('checks exact catalog membership independently of search pagination', async () => {
    const dependency = 'luckylillia-plugin-paged'
    for (let index = 0; index < 20; index++) publishPlugin(`${dependency}-example-${index}`)
    publishPlugin(dependency)
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0' })
    await market.install(PLUGIN)
    expect(catalogRequests()).toHaveLength(1)
    expect(installedVersion(dependency)).toBe('1.0.0')

    const unlisted = 'luckylillia-plugin-private'
    publishPlugin(unlisted, {}, '1.0.0', { listed: false })
    publishPlugin(`${unlisted}-lookalike`)
    registry.requests.length = 0
    await expect(market.install(unlisted, '1.0.0')).rejects.toMatchObject({ status: 404, message: expect.stringContaining('plugin market list') })
    expect(requestsFor(unlisted)).toEqual([])
    expect(tarballRequests()).toEqual([])
    expect(existsSync(path.join(pluginRoot, unlisted))).toBe(false)
  })

  it('does not install the parent if a required plugin download fails', async () => {
    const dependency = 'luckylillia-plugin-broken'
    publishPlugin(dependency, {}, '1.0.0', { corrupt: true })
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0' })
    await expect(market.install(PLUGIN)).rejects.toThrow(/integrity/)
    expect(readdirNames(pluginRoot)).toEqual([])
    expect(tarballRequests().map(url => url.pathname)).toEqual([`/${dependency}/-/${dependency}-1.0.0.tgz`])
    expect(market.installed()).toEqual([])
  })

  it('returns automatically installed plugin entries through the WebUI API', async () => {
    const dependency = 'luckylillia-plugin-api-dependency'
    publishPlugin(dependency)
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0' })
    const response = await new Hono().route('/api/market', createMarketRoutes(ctx, market)).request('/api/market/install', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: PLUGIN }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, data: {
      name: PLUGIN, version: '1.0.0', entries: [expect.any(String)],
      dependencies: [{ name: dependency, version: '1.0.0', entries: [expect.any(String)] }],
    } })
  })

  it('preserves installed consumers when a dependency is explicitly upgraded beyond their range', async () => {
    const dependency = 'luckylillia-plugin-protected'
    publishPlugin(dependency)
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0' })
    await market.install(PLUGIN)
    publishPlugin(dependency, {}, '2.0.0')
    registry.requests.length = 0

    expect((await market.updates())[dependency]).toEqual({ latest: '2.0.0', blocked: expect.stringContaining('would break') })
    await expect(market.install(dependency)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('would break') })
    expect(installedVersion(dependency)).toBe('1.0.0')
    expect(tarballRequests()).toEqual([])
    expect(installedVersion(PLUGIN)).toBe('1.0.0')
  })

  it('blocks an update that needs an incompatible installed dependency', async () => {
    const dependency = 'luckylillia-plugin-existing'
    publishPlugin(dependency)
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0' })
    await market.install(PLUGIN)
    publishPlugin(dependency, {}, '2.0.0')
    publishPlugin(PLUGIN, { [dependency]: '^2.0.0' }, '2.0.0')
    registry.requests.length = 0

    expect((await market.updates())[PLUGIN]).toEqual({ latest: '2.0.0', blocked: expect.stringContaining('already installed') })
    expect(tarballRequests()).toEqual([])
    expect(installedVersion(PLUGIN)).toBe('1.0.0')
    expect(installedVersion(dependency)).toBe('1.0.0')
  })

  it.each([
    ['unlisted', 'plugin market list'],
    ['version range', 'only lists 1.0.0'],
    ['SDK version', '^99.0.0'],
    ['plugin manifest', 'no llbot field'],
    ['cycle', 'circular'],
  ])('blocks updates whose dependency graph fails its %s check', async (problem, reason) => {
    await market.install(PLUGIN)
    const dependency = 'luckylillia-plugin-new-dependency'
    if (problem === 'plugin manifest') registry.publish(dependency, '1.0.0', { listed: true })
    else publishPlugin(dependency, problem === 'cycle' ? { [PLUGIN]: '^2.0.0' } : {}, '1.0.0', {
      listed: problem !== 'unlisted',
      peerDependencies: problem === 'SDK version' ? { '@luckylillia/plugin-sdk': '^99.0.0' } : undefined,
    })
    publishPlugin(PLUGIN, { [dependency]: problem === 'version range' ? '^2.0.0' : '^1.0.0' }, '2.0.0')
    registry.requests.length = 0

    expect((await market.updates())[PLUGIN]).toEqual({ latest: '2.0.0', blocked: expect.stringContaining(reason) })
    expect(tarballRequests()).toEqual([])
    expect(readdirNames(pluginRoot)).toEqual([PLUGIN])
  })

  it('blocks a listed newer version whose package is no longer a plugin', async () => {
    await market.install(PLUGIN)
    registry.publish(PLUGIN, '2.0.0', { listed: true })
    registry.requests.length = 0

    expect(await market.updates()).toEqual({ [PLUGIN]: { latest: '2.0.0', blocked: expect.stringContaining('no llbot field') } })
    expect(tarballRequests()).toEqual([])
    expect(installedVersion(PLUGIN)).toBe('1.0.0')
  })

  it('shares dependency metadata between update plans without downloading or installing it', async () => {
    const other = 'luckylillia-plugin-other-consumer'
    const dependency = 'luckylillia-plugin-shared-update-dependency'
    publishPlugin(other)
    await market.install(PLUGIN)
    await market.install(other)
    publishPlugin(dependency)
    for (const name of [PLUGIN, other]) publishPlugin(name, { [dependency]: '^1.0.0' }, '2.0.0')
    registry.requests.length = 0

    expect(await market.updates()).toEqual({
      [PLUGIN]: { latest: '2.0.0', update: '2.0.0' },
      [other]: { latest: '2.0.0', update: '2.0.0' },
    })
    for (const name of [PLUGIN, other, dependency]) expect(requestsFor(name)).toHaveLength(1)
    expect(catalogRequests()).toHaveLength(1)
    expect(tarballRequests()).toEqual([])
    expect(market.installed().map(pkg => pkg.name).sort()).toEqual([PLUGIN, other].sort())
  })

  it('distinguishes unavailable dependencies from transient registry failures and retries the next update check', async () => {
    await market.install(PLUGIN)
    const dependency = 'luckylillia-plugin-update-dependency'
    publishPlugin(dependency)
    publishPlugin(PLUGIN, { [dependency]: '^1.0.0' }, '2.0.0')
    registry.failPackage(dependency, 404)
    expect(await market.updates()).toEqual({ [PLUGIN]: { latest: '2.0.0', blocked: expect.stringContaining('not found') } })

    registry.failPackage(dependency, 503)
    expect(await market.updates()).toEqual({ [PLUGIN]: { latest: '2.0.0', error: expect.stringContaining('503') } })

    registry.failPackage(dependency, 0)
    expect(await market.updates()).toEqual({ [PLUGIN]: { latest: '2.0.0', update: '2.0.0' } })
    expect(installedVersion(PLUGIN)).toBe('1.0.0')
    expect(existsSync(path.join(pluginRoot, dependency))).toBe(false)
  })

  it('updates a running plugin in place and reloads it', async () => {
    await market.install(PLUGIN)
    await ctx.plugins.enable(status()!.id, { trust: true })
    registry.publish('a', '1.1.0', { dependencies: { c: '^1.0.0' }, files: { 'index.js': `export default 'a2'` } })
    registry.publish(PLUGIN, '1.1.0', { plugin: true, dependencies: { a: '^1.1.0', b: '^1.0.0' }, files: { 'index.js': pluginCode('v2') } })
    expect(await market.updates()).toEqual({ [PLUGIN]: { latest: '1.1.0', update: '1.1.0' } })
    const outcome = await market.update(PLUGIN, '1.1.0', '1.0.0')
    expect(outcome).toMatchObject({ version: '1.1.0', previous: '1.0.0', reload: { status: 'reloaded' } })
    // Its dependencies are re-imported too, but only under Node's own loader (resolve-hook.test.ts)
    expect(globalThis.__marketTest).toEqual(['v1:a1+c1,b1+c2+a1+c1', expect.stringMatching(/^v2:/)])
    expect(versionAt('node_modules', 'a')).toBe('1.1.0')
    expect(versionAt('node_modules', 'd')).toBe('1.1.0')
    expect(status()).toMatchObject({ disabled: false, state: 'active', version: '1.1.0' })
    expect(readdirNames(pluginRoot)).toEqual([PLUGIN])
  })

  it('rejects stale manual updates, including requests queued for the same plugin', async () => {
    await market.install(PLUGIN)
    publishPlugin(PLUGIN, {}, '2.0.0')
    const outcomes = await Promise.allSettled([
      market.update(PLUGIN, '2.0.0', '1.0.0'),
      market.update(PLUGIN, '2.0.0', '1.0.0'),
    ])
    expect(outcomes[0]).toMatchObject({ status: 'fulfilled', value: { previous: '1.0.0', version: '2.0.0' } })
    expect(outcomes[1]).toMatchObject({ status: 'rejected', reason: { status: 409, message: expect.stringContaining('is now 2.0.0') } })
    expect(installedVersion(PLUGIN)).toBe('2.0.0')
  })

  it('never installs an absent plugin or reinstalls/downgrades through the update endpoint', async () => {
    await expect(market.update(PLUGIN, '2.0.0', '1.0.0')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('no longer installed') })
    await market.install(PLUGIN)
    registry.requests.length = 0
    await expect(market.update(PLUGIN, '1.0.0', '1.0.0')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('not newer') })
    await expect(market.update(PLUGIN, '0.9.0', '1.0.0')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('not newer') })
    expect(registry.requests).toEqual([])
    expect(installedVersion(PLUGIN)).toBe('1.0.0')
  })

  it('revalidates catalog and consumer requirements before a manual update writes files', async () => {
    await market.install(PLUGIN)
    const consumer = 'luckylillia-plugin-consumer'
    publishPlugin(consumer, { [PLUGIN]: '^1.0.0' })
    await market.install(consumer)
    publishPlugin(PLUGIN, {}, '2.0.0')
    registry.requests.length = 0
    await expect(market.update(PLUGIN, '1.1.0', '1.0.0')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('catalog version 2.0.0') })
    await expect(market.update(PLUGIN, '2.0.0', '1.0.0')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('would break') })
    expect(tarballRequests()).toEqual([])
    expect(installedVersion(PLUGIN)).toBe('1.0.0')
  })

  it('requires both versions for the WebUI manual update route', async () => {
    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    const call = async (body: unknown) => {
      const response = await routes.request('/api/market/update', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      return { status: response.status, ...await response.json() as object }
    }
    for (const body of [{ name: PLUGIN }, { name: PLUGIN, version: '2.0.0' }, { name: PLUGIN, version: '2.0.0', currentVersion: 1 }]) {
      expect(await call(body)).toMatchObject({ status: 400, success: false })
    }
    await market.install(PLUGIN)
    publishPlugin(PLUGIN, {}, '2.0.0')
    expect(await call({ name: PLUGIN, version: '2.0.0', currentVersion: '1.0.0' }))
      .toMatchObject({ status: 200, success: true, data: { previous: '1.0.0', version: '2.0.0' } })
  })

  it('blocks an incompatible catalog version, including explicit requests, and preserves the installed plugin', async () => {
    await market.install(PLUGIN)
    registry.publish(PLUGIN, '2.0.0', { plugin: true, peerDependencies: { '@luckylillia/plugin-sdk': '^99.0.0' }, files: { 'index.js': pluginCode('v3') } })
    registry.requests.length = 0
    await expect(market.install(PLUGIN)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('^99.0.0') })
    const updates = await market.updates()
    expect(updates[PLUGIN]).toMatchObject({ latest: '2.0.0', blocked: expect.stringContaining('^99.0.0') })
    expect(updates[PLUGIN].update).toBeUndefined()
    await expect(market.install(PLUGIN, '2.0.0')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('^99.0.0') })
    await expect(market.install(PLUGIN, '1.0.0')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('catalog version 2.0.0') })
    expect(tarballRequests()).toEqual([])
    expect(installedVersion(PLUGIN)).toBe('1.0.0')
  })

  it('installs and offers only the catalog version even when npm latest is newer, then refreshes the catalog', async () => {
    publishPlugin(PLUGIN, {}, '2.0.0', { pinnedVersion: '1.0.0' })
    expect((await market.search('greet', 1)).items[0].version).toBe('1.0.0')
    expect(await market.install(PLUGIN)).toMatchObject({ version: '1.0.0' })
    expect(await market.updates()).toEqual({ [PLUGIN]: { latest: '1.0.0' } })
    registry.requests.length = 0
    await expect(market.install(PLUGIN, '2.0.0')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('catalog version 1.0.0') })
    expect(requestsFor(PLUGIN)).toEqual([])
    expect(tarballRequests()).toEqual([])

    registry.pin(PLUGIN, '2.0.0')
    expect((await market.search('greet', 1)).items[0].version).toBe('2.0.0')
    expect(await market.updates()).toEqual({ [PLUGIN]: { latest: '2.0.0', update: '2.0.0' } })
    expect(await market.install(PLUGIN, '2.0.0')).toMatchObject({ version: '2.0.0', previous: '1.0.0' })
  })

  it('uses the exact catalog version even when npm latest points to an older release', async () => {
    publishPlugin(PLUGIN, {}, '2.0.0', { untagged: true, pinnedVersion: '2.0.0' })
    expect(await market.install(PLUGIN)).toMatchObject({ version: '2.0.0' })
    registry.pin(PLUGIN, '1.0.0')
    expect(await market.updates()).toEqual({ [PLUGIN]: { latest: '1.0.0' } })
    expect(installedVersion(PLUGIN)).toBe('2.0.0')
  })

  it('keeps removed catalog entries installed and removable without offering unlisted updates', async () => {
    await market.install(PLUGIN)
    const id = status()!.id
    publishPlugin(PLUGIN, {}, '2.0.0', { listed: false })
    registry.requests.length = 0
    expect((await market.search('', 1)).items).toEqual([])
    expect(await market.updates()).toEqual({ [PLUGIN]: { blocked: expect.any(String) } })
    expect(requestsFor(PLUGIN)).toEqual([])
    expect(installedVersion(PLUGIN)).toBe('1.0.0')
    expect(market.installed()).toContainEqual(expect.objectContaining({ name: PLUGIN, version: '1.0.0', managed: true }))
    registry.failCatalog()
    expect(await market.uninstall(PLUGIN)).toEqual({ removed: [id] })
  })

  it('refuses packages that are no plugins and copies it does not manage', async () => {
    await expect(market.install('a')).rejects.toThrow(/not found in the plugin market list/)
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

  it('retains every instance configuration and scope across uninstall, restart and market reinstall', async () => {
    const name = 'luckylillia-plugin-retained'
    publishPlugin(name, {}, '1.0.0', { files: { 'index.js': `
      import Schema from 'schemastery'
      export const Config = Schema.object({ token: Schema.string().role('secret').default(''), n: Schema.number().default(1) })
      export function apply() {}
    ` } })
    await market.install(name)
    const first = ctx.plugins.list().find(entry => entry.name === name)!
    await ctx.plugins.updateConfig(first.id, { token: 'secret-one', n: 7 })
    await ctx.plugins.setScope(first.id, { platforms: ['qq'], guilds: { mode: 'allow', ids: ['qq:group'] } })
    await ctx.plugins.enable(first.id, { trust: true })
    const second = await ctx.plugins.add(name, { token: 'secret-two', n: 9 }, { trust: true })
    await ctx.plugins.setScope(second.id, { users: { mode: 'deny', ids: ['ntqq:123'] } })
    await ctx.plugins.setMessageOrder([second.id, first.id])
    await ctx.plugins.updateUiPrefs({ hide: [`${name}|page|home`], order: { [`${name}|dashboard.cards|card`]: 2 } })
    const saved = JSON.parse(readFileSync(pluginsFile, 'utf8')).entries.filter((entry: { name: string }) => entry.name === name)
      .map((entry: object) => ({ ...entry, disabled: true }))
    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    const response = await routes.request('/api/market/uninstall', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, keepConfig: true }),
    })
    expect(await response.json()).toMatchObject({ success: true, data: { removed: [first.id, second.id] } })
    expect(ctx.plugins.list().filter(entry => entry.name === name)).toEqual([])
    expect(market.installed().some(pkg => pkg.name === name)).toBe(false)
    expect(existsSync(path.join(pluginRoot, name))).toBe(false)
    expect(JSON.parse(readFileSync(pluginsFile, 'utf8'))).toMatchObject({
      entries: [], retained: saved, trusted: [], messageOrder: [], ui: { hidden: [], order: {} },
    })

    await service!.dispose()
    ctx = new Context()
    await ctx.plugin(TimerService)
    service = await ctx.plugin(PluginService, { file: pluginsFile, roots: [pluginRoot], trust: true })
    market = new Market(ctx, new Registry(registry.url), pluginRoot)
    expect(ctx.plugins.list()).toEqual([])
    const result = await market.install(name)
    expect(result.entries).toEqual([first.id, second.id])
    expect(ctx.plugins.list().filter(entry => entry.name === name).map(entry => ({ id: entry.id, disabled: entry.disabled, trusted: entry.trusted })))
      .toEqual([{ id: first.id, disabled: true, trusted: false }, { id: second.id, disabled: true, trusted: false }])
    const restored = JSON.parse(readFileSync(pluginsFile, 'utf8'))
    expect(restored.entries).toEqual(saved)
    expect(restored.retained).toBeUndefined()
    await expect(ctx.plugins.enable(first.id)).rejects.toMatchObject({ name: 'Error', message: expect.stringContaining('trust') })
    const description = await ctx.plugins.describe(first.id)
    expect(JSON.stringify(description)).not.toContain('secret-one')
    await ctx.plugins.enable(first.id, { trust: true })
    expect(ctx.plugins.get(first.id).state).toBe('active')
  })

  it.each([undefined, false])('removes configs permanently when keepConfig is %s', async keepConfig => {
    const name = 'luckylillia-plugin-forget-config'
    publishPlugin(name, {}, '1.0.0', { files: { 'index.js': `
      import Schema from 'schemastery'
      export const Config = Schema.object({ value: Schema.string().default('default') })
      export function apply() {}
    ` } })
    await market.install(name)
    const first = ctx.plugins.list().find(entry => entry.name === name)!
    await ctx.plugins.updateConfig(first.id, { value: 'erase-me' })
    await ctx.plugins.setScope(first.id, { platforms: ['ntqq'] })
    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    const response = await routes.request('/api/market/uninstall', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, keepConfig }),
    })
    expect(response.status).toBe(200)
    expect(JSON.parse(readFileSync(pluginsFile, 'utf8')).retained).toBeUndefined()
    await market.install(name)
    const current = ctx.plugins.list().find(entry => entry.name === name)!
    expect(current.id).not.toBe(first.id)
    expect(current.scope).toBeUndefined()
    expect((await ctx.plugins.describe(current.id)).effective).toEqual({ value: 'default' })
  })

  it.each([null, 'true', 0, {}, []])('rejects a non-boolean keepConfig without removing anything: %j', async keepConfig => {
    await market.install(PLUGIN)
    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    const response = await routes.request('/api/market/uninstall', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: PLUGIN, keepConfig }),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ success: false, message: 'keepConfig must be a boolean' })
    expect(status()).toBeDefined()
    expect(existsSync(dir())).toBe(true)
  })

  it('answers the WebUI with what went wrong', async () => {
    const routes = new Hono().route('/api/market', createMarketRoutes(ctx, market))
    const call = async (method: string, url: string, body?: unknown) => {
      const response = await routes.request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } })
      return { status: response.status, ...await response.json() as { success: boolean; data?: any; message?: string } }
    }
    expect(await call('POST', '/api/market/install', {})).toMatchObject({ status: 400, success: false, message: 'name is required' })
    expect(await call('POST', '/api/market/install', { name: 'nothing-here' })).toMatchObject({ status: 404, success: false })
    expect(await call('POST', '/api/market/install', { name: PLUGIN, version: '9.9.9' })).toMatchObject({ status: 409 })
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
