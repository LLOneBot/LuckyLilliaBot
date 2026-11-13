import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import type { PluginCategory } from '@luckylillia/plugin-sdk'
import { PLUGIN_CATEGORIES } from '../../../host/manifest'
import { isExactVersion, isPackageName, RegistryError, type PackageVersion, type RegistryClient } from './registry'
import { readTar } from './tar'
import { isImageSource, isScreenshot, type CatalogScreenshot } from './images'

export const MARKET_PACKAGE = '@luckylillia/market'

export interface CatalogEntry {
  name: string
  /** Registration category; older catalogs may omit it. */
  category?: PluginCategory
  title: string
  description: string
  author: { name: string; url?: string }
  repository: string
  /** A package-relative image path or external HTTP(S) URL, as stored in plugins.json. */
  icon?: string
  screenshots?: readonly CatalogScreenshot[]
  /** The exact version approved by the directory, independently of the plugin's npm latest tag. */
  version: string
}

export type CatalogSnapshot = ReadonlyMap<string, CatalogEntry>

const gunzipAsync = promisify(gunzip)
const MAX_DOWNLOAD = 4 * 1024 * 1024
const MAX_TAR = 16 * 1024 * 1024
const MAX_JSON = 4 * 1024 * 1024
const MAX_ENTRIES = 1024
const MAX_PLUGINS = 10_000

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const only = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key))
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0
  && value.length <= max && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value)

function fail(message: string): never {
  throw new RegistryError(`插件目录无效：${message}`)
}

function webUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\u0000-\u001f\u007f\\]/.test(value)) return false
  try {
    const url = new URL(value)
    return /^https?:\/\//.test(value) && ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
  } catch {
    return false
  }
}

function repository(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim()
    && /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/.test(value)
    && !/(?:\/\.\.?|\.git)$/.test(value)
}

/** Read only the catalog JSON. No package code is imported or written to disk. */
function parseArchive(tar: Buffer): CatalogSnapshot {
  if (tar.length < 1024 || tar.length % 512 !== 0 || !tar.subarray(-1024).every(byte => byte === 0)) {
    fail('目录包 tar 文件不完整')
  }
  const files = new Map<string, Buffer>()
  const paths = new Set<string>()
  for (const entry of readTar(tar)) {
    if (paths.size >= MAX_ENTRIES) fail('目录包文件数超过限制')
    const path = entry.type === 'directory' ? entry.path.replace(/\/$/, '') : entry.path
    if (!path || /[\\\u0000-\u001f\u007f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')
      || (path !== 'package' && !path.startsWith('package/'))) fail('目录包包含无效文件路径')
    if (paths.has(path)) fail(`目录包重复文件：${path}`)
    paths.add(path)
    if (path !== 'package/plugins.json') continue
    if (entry.type !== 'file') fail(`${path} 必须是普通文件`)
    if (entry.data.length > MAX_JSON) fail(`${path} 超过允许的大小`)
    files.set(path, entry.data)
  }
  const json = (path: string): unknown => {
    const data = files.get(path)
    if (!data) fail(`目录包缺少 ${path}`)
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data))
    } catch {
      fail(`${path} 不是有效的 UTF-8 JSON`)
    }
  }
  return parseCatalog(json('package/plugins.json'))
}

function parseCatalog(plugins: unknown): CatalogSnapshot {
  if (!Array.isArray(plugins) || plugins.length > MAX_PLUGINS) fail('plugins.json 必须是大小合理的插件数组')
  const entries = new Map<string, CatalogEntry>()
  for (const plugin of plugins) {
    if (!object(plugin) || !only(plugin, ['name', 'version', 'category', 'title', 'description', 'author', 'repository', 'icon', 'screenshots', 'examples'])) fail('插件条目包含无效字段')
    if (!isPackageName(plugin.name)) fail('插件条目的 npm 包名无效')
    const name = plugin.name
    if (entries.has(name)) fail(`插件重复登记：${name}`)
    if (Object.hasOwn(plugin, 'category') && !PLUGIN_CATEGORIES.includes(plugin.category as PluginCategory)) fail(`${name} 的插件分类无效`)
    if (!text(plugin.title, 200) || !text(plugin.description, 2000)) fail(`${name} 的名称或简介无效`)
    if (!object(plugin.author) || !only(plugin.author, ['name', 'url']) || !text(plugin.author.name, 200)) fail(`${name} 的作者信息无效`)
    if (Object.hasOwn(plugin.author, 'url') && !webUrl(plugin.author.url)) fail(`${name} 的作者链接必须是 HTTP(S) 地址`)
    if (!repository(plugin.repository)) fail(`${name} 的仓库链接必须是规范 GitHub 仓库地址`)
    if (Object.hasOwn(plugin, 'icon') && plugin.icon !== '' && !isImageSource(plugin.icon)) fail(`${name} 的图标必须是包内图片相对路径、HTTP(S) 地址或空字符串`)
    let screenshots: readonly CatalogScreenshot[] | undefined
    if (Object.hasOwn(plugin, 'screenshots')) {
      if (!Array.isArray(plugin.screenshots) || !plugin.screenshots.every(isScreenshot)) fail(`${name} 的截图必须是图片相对路径、HTTP(S) 地址或 { src, caption } 对象的数组`)
      screenshots = plugin.screenshots
    }
    // Older directory packages used examples for bare URL strings. Prefer the screenshots declaration, even when empty.
    if (Object.hasOwn(plugin, 'examples')) {
      if (!Array.isArray(plugin.examples) || !plugin.examples.every(source => webUrl(source) && isImageSource(source))) fail(`${name} 的示例图片必须是 HTTP(S) 地址数组`)
      screenshots ??= plugin.examples
    }
    const version = plugin.version
    if (!isExactVersion(version)) fail(`${name} 缺少有效的精确版本号`)
    entries.set(name, Object.freeze({
      name, title: plugin.title, description: plugin.description, repository: plugin.repository,
      ...(plugin.category === undefined ? {} : { category: plugin.category as PluginCategory }),
      author: Object.freeze({ name: plugin.author.name, ...(plugin.author.url ? { url: plugin.author.url as string } : {}) }),
      ...(plugin.icon ? { icon: plugin.icon as string } : {}),
      ...(screenshots?.length ? { screenshots: Object.freeze(screenshots.map(item => typeof item === 'string' ? item : Object.freeze({ ...item }))) } : {}),
      version,
    }))
  }
  return entries
}

export class Catalog {
  private pending?: Promise<CatalogSnapshot>
  private cache?: { key: string; snapshot: CatalogSnapshot }

  constructor(private readonly registry: RegistryClient, readonly name = MARKET_PACKAGE) {
    if (!isPackageName(name)) fail('目录包名称必须是有效的 npm 包名')
  }

  /** Always refresh directory metadata; concurrent callers share one validated snapshot. */
  load(): Promise<CatalogSnapshot> {
    return this.pending ??= this.read().finally(() => { this.pending = undefined })
  }

  private async read(): Promise<CatalogSnapshot> {
    const document = await this.registry.packument(this.name)
    if (!object(document) || document.name !== this.name || !object(document['dist-tags']) || !object(document.versions)) {
      fail('npm 返回的目录包元数据不完整或包名不匹配')
    }
    const latest = document['dist-tags'].latest
    if (!isExactVersion(latest) || !Object.hasOwn(document.versions, latest)) fail('目录包没有有效的 latest 精确版本')
    const version = document.versions[latest]
    if (!object(version) || version.name !== this.name || version.version !== latest || !object(version.dist)
      || !webUrl(version.dist.tarball)
      || (version.dist.integrity !== undefined && typeof version.dist.integrity !== 'string')
      || (version.dist.shasum !== undefined && typeof version.dist.shasum !== 'string')
      || (!version.dist.integrity && !version.dist.shasum)) fail('目录包的版本或发布文件信息无效')
    const key = JSON.stringify([latest, version.dist.tarball, version.dist.integrity, version.dist.shasum])
    if (this.cache?.key === key) return this.cache.snapshot
    const compressed = await this.registry.tarball(version as unknown as PackageVersion, MAX_DOWNLOAD)
    if (compressed.length > MAX_DOWNLOAD) fail('目录包下载超过允许的大小')
    let tar: Buffer
    try {
      tar = await gunzipAsync(compressed, { maxOutputLength: MAX_TAR })
    } catch {
      fail('目录包无法解压或解压后超过允许的大小')
    }
    const snapshot = parseArchive(tar)
    // Failed refreshes never replace the cache or silently return its older successful snapshot.
    this.cache = { key, snapshot }
    return snapshot
  }
}
