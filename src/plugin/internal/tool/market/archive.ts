import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { crc32, createGunzip } from 'node:zlib'
import { openPromise } from 'yauzl'
import { resolveMain } from '../../../host/manifest'
import { isExactVersion, isPackageName, type PackageManifest } from './registry'
import { readTarStream, type TarStreamEntry } from './tar'

export class ArchiveError extends Error {
  constructor(message: string, readonly status = 400 as const) {
    super(message)
  }
}

export interface LocalPackage {
  manifest: PackageManifest
  /** Validated files in a temporary directory on the plugin root's filesystem, ready to be moved into place. */
  directory: string
}

/** Stream into an isolated temporary directory; the caller removes it on failure or after installation. */
export async function readLocalPackage(archive: string, filename: string, directory: string): Promise<LocalPackage> {
  if (!(await stat(archive)).size) throw new ArchiveError('插件压缩包不能为空')
  const zip = /\.zip$/i.test(filename)
  if (!zip && !/\.(tgz|tar\.gz)$/i.test(filename)) throw new ArchiveError('请选择 ZIP 或 npm 格式的 .tgz / .tar.gz 插件包')
  try {
    await mkdir(directory, { recursive: true })
    const paths = new Map<string, { path: string; type: TarStreamEntry['type']; explicit: boolean }>()
    const entries = zip ? readZip(archive) : readNpmTar(archive)
    for await (const entry of entries) {
      const relative = packagePath(entry.path, entry.type, !zip)
      if (!relative) continue
      const key = relative.toLowerCase()
      const previous = paths.get(key)
      if (previous?.type === 'directory' && entry.type === 'file') throw new ArchiveError(`插件压缩包的文件与目录冲突：${relative}`)
      if (previous && (previous.explicit || previous.path !== relative)) throw new ArchiveError(`插件压缩包包含重复路径：${relative}`)
      // Track implicit directories too, so both archive orders and case-insensitive filesystems agree.
      const parts = relative.split('/')
      while (parts.pop() && parts.length) {
        const parent = parts.join('/')
        const existing = paths.get(parent.toLowerCase())
        if (existing?.type === 'file') throw new ArchiveError(`插件压缩包的文件与目录冲突：${relative}`)
        if (existing && existing.path !== parent) throw new ArchiveError(`插件压缩包包含重复路径：${parent}`)
        if (!existing) paths.set(parent.toLowerCase(), { path: parent, type: 'directory', explicit: false })
      }
      paths.set(key, { path: relative, type: entry.type, explicit: true })
      const target = path.join(directory, relative)
      if (entry.type === 'directory') await mkdir(target, { recursive: true })
      else {
        await mkdir(path.dirname(target), { recursive: true })
        await pipeline(entry.data, createWriteStream(target, { flags: 'wx' }))
      }
    }
    const json = paths.get('package.json')
    if (json?.path !== 'package.json' || json.type !== 'file') throw new ArchiveError(zip ? 'ZIP 顶层必须包含 package.json，不能再套一层文件夹' : 'npm 压缩包必须包含 package/package.json')
    const manifest = parseManifest(await readFile(path.join(directory, 'package.json')))
    const main = packagePath(resolveMain(manifest, undefined, false), 'file')
    const entry = paths.get(main.toLowerCase())
    if (entry?.type !== 'file' || entry.path !== main) throw new ArchiveError(`插件压缩包缺少入口文件：${main}，请先构建插件再打包`)
    return { manifest, directory }
  } catch (error) {
    if (error instanceof ArchiveError) throw error
    // Disk errors are installation failures, not evidence that the user's archive is corrupt.
    if (['ENOSPC', 'EDQUOT', 'EACCES', 'EPERM', 'EIO'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
    throw new ArchiveError(`插件压缩包无效或已损坏：${error instanceof Error ? error.message : String(error)}`)
  }
}

async function* readZip(archive: string): AsyncGenerator<TarStreamEntry> {
  const zip = await openPromise(archive, { strictFileNames: true, validateEntrySizes: true })
  const closed = new Promise<void>(resolve => zip.once('close', resolve))
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.isEncrypted()) throw new ArchiveError('不支持加密的 ZIP 插件包，请先解密后重新打包')
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000
      // Like npm tarballs, never restore symlinks, devices or other special files.
      if (mode && mode !== 0o100000 && mode !== 0o040000) continue
      if (entry.fileName.endsWith('/') || mode === 0o040000 || (entry.externalFileAttributes & 0x10)) {
        yield { path: entry.fileName, type: 'directory', data: empty() }
        continue
      }
      async function* data() {
        const stream = await zip.openReadStreamPromise(entry)
        let size = 0
        let checksum = 0
        for await (const chunk of stream) {
          size += chunk.length
          if (size > entry.uncompressedSize) throw new ArchiveError(`ZIP 文件大小不符：${entry.fileName}`)
          checksum = crc32(chunk, checksum)
          yield chunk as Buffer
        }
        if (size !== entry.uncompressedSize || checksum !== entry.crc32) throw new ArchiveError(`ZIP 文件校验失败：${entry.fileName}`)
      }
      yield { path: entry.fileName, type: 'file', data: data() }
    }
  } finally {
    zip.close()
    // Wait for the descriptor to close before the caller removes the uploaded archive on Windows.
    await closed
  }
}

async function* empty(): AsyncGenerator<Buffer> {}

async function* readNpmTar(archive: string): AsyncGenerator<TarStreamEntry> {
  const input = createReadStream(archive)
  const unzip = createGunzip()
  const decompressing = pipeline(input, unzip)
  decompressing.catch(() => {})
  try {
    yield* readTarStream(unzip)
    await decompressing
  } finally {
    input.destroy()
    unzip.destroy()
    await decompressing.catch(() => {})
  }
}

/** Keep path handling identical on Windows and Unix, including drive names and alternate data streams. */
function packagePath(name: string, type: TarStreamEntry['type'], npm = false): string {
  let relative = name.replace(/^(\.\/)+/, '')
  if (type === 'directory') relative = relative.replace(/\/$/, '')
  if (type === 'directory' && (!relative || relative === '.')) return ''
  if (npm) {
    if (relative === 'package' && type === 'directory') return ''
    if (!relative.startsWith('package/')) throw new ArchiveError(`npm 压缩包中的文件必须位于 package/ 下：${name}`)
    relative = relative.slice('package/'.length)
  }
  if (!relative || /[\\:\u0000-\u001f\u007f<>"|?*]/.test(relative) || relative.split('/').some(part => (
    !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
  ))) throw new ArchiveError(`插件压缩包包含不安全的路径：${name}`)
  return relative
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

function parseManifest(data: Buffer): PackageManifest {
  let manifest: unknown
  try {
    manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data))
  } catch {
    throw new ArchiveError('package.json 必须是有效的 UTF-8 JSON')
  }
  if (!object(manifest) || !isPackageName(manifest.name) || !isExactVersion(manifest.version)) {
    throw new ArchiveError('package.json 必须包含有效的 npm 包名 name 和完整版本号 version')
  }
  if (!object(manifest.llbot)) throw new ArchiveError('这不是 LuckyLillia 插件：package.json 缺少有效的 llbot 清单')
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'scripts']) {
    const value = manifest[field]
    if (value === undefined) continue
    if (!object(value) || Object.entries(value).some(([name, spec]) => typeof spec !== 'string' || (field !== 'scripts' && !isPackageName(name)))) {
      throw new ArchiveError(`package.json 的 ${field} 必须是名称到字符串的对象`)
    }
  }
  for (const field of ['bundleDependencies', 'bundledDependencies']) {
    const value = manifest[field]
    if (value !== undefined && typeof value !== 'boolean' && (!Array.isArray(value) || !value.every(isPackageName))) {
      throw new ArchiveError(`package.json 的 ${field} 必须是布尔值或包名数组`)
    }
  }
  // Also reject an escaping development export, which source-mode hosts may prefer.
  packagePath(resolveMain(manifest, undefined, true), 'file')
  return manifest as unknown as PackageManifest
}
