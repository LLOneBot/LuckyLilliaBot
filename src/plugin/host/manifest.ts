import { existsSync } from 'node:fs'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { satisfies } from 'compare-versions'
import { satisfies as satisfiesRange, validRange } from 'semver'
import type { LLBotManifest, PluginCategory } from '@luckylillia/plugin-sdk'

export const SDK_PACKAGE = '@luckylillia/plugin-sdk'

/** The values of `llbot.category`, in the order the plugin page lists them. */
export const PLUGIN_CATEGORIES: readonly PluginCategory[] = ['protocol', 'adapter', 'chat', 'tool', 'service', 'other']

/** Extensions of the images a package may show in the WebUI: its icon, screenshots and what its details show. */
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

export const isImagePath = (file: string) => IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase())

export interface PluginAuthor {
  name: string
  email?: string
  /** http(s) only */
  url?: string
}

export interface PluginScreenshot {
  /** From the package root, with forward slashes */
  file: string
  caption?: string
}

export interface PluginPackage {
  name: string
  version: string
  /** Absolute package directory. */
  root: string
  /** Absolute entry file. */
  main: string
  manifest: LLBotManifest
  description?: string
  /** package.json `author` */
  author?: PluginAuthor
  /** Browser URL normalized from package.json `repository`; HTTP(S) only. */
  repository?: string
  /** `peerDependencies['@luckylillia/plugin-sdk']`, if declared. */
  sdkRange?: string
  /** Absolute path of the `llbot.webui` module, when it exists inside the package. */
  webui?: string
  /** `llbot.icon` when it names an image in the package (else it is a lucide name): from the root, forward slashes */
  iconFile?: string
  /** `llbot.details`, the same way */
  detailsFile?: string
  /** The images of `llbot.screenshots` that are there */
  screenshots: PluginScreenshot[]
  warnings: string[]
}

/** `llbot.service` with every list present. */
export interface ServiceDeclaration {
  required: string[]
  optional: string[]
  implements: string[]
  labels?: Record<string, string>
}

export interface ScanResult {
  packages: PluginPackage[]
  errors: { path: string; error: string }[]
}

/** Every child directory of a root (one extra level under `@scope/`) whose package.json has an `llbot` field. */
export async function scanPluginRoots(roots: string[]): Promise<ScanResult> {
  const result: ScanResult = { packages: [], errors: [] }
  for (const root of roots) {
    for (const dir of await childDirs(root)) {
      const name = path.basename(dir)
      const candidates = name.startsWith('@') ? await childDirs(dir) : [dir]
      for (const candidate of candidates) {
        try {
          const pkg = await readPluginPackage(candidate)
          if (pkg) result.packages.push(pkg)
        } catch (e) {
          result.errors.push({ path: candidate, error: (e as Error).message })
        }
      }
    }
  }
  return result
}

/** Resolves to undefined when the directory is not a plugin package. */
export async function readPluginPackage(dir: string): Promise<PluginPackage | undefined> {
  const file = path.join(dir, 'package.json')
  if (!existsSync(file)) return
  const pkg = JSON.parse(await readFile(file, 'utf8')) as Record<string, any>
  if (!pkg.llbot || typeof pkg.llbot !== 'object') return
  if (typeof pkg.name !== 'string' || !pkg.name) throw new Error('package.json has no name')
  // ESM resolves symlinks, so module URLs carry the real path; package roots must match them
  const root = await realpath(dir)
  const main = path.resolve(root, resolveMain(pkg, root))
  if (!existsSync(main)) throw new Error(`entry ${path.relative(root, main)} does not exist`)
  const warnings: string[] = []
  if (pkg.type !== 'module' && path.extname(main) === '.js') {
    warnings.push('package.json lacks "type": "module", so .js files load as CommonJS')
  }
  let webui: string | undefined
  if (pkg.llbot.webui !== undefined) {
    const file = typeof pkg.llbot.webui === 'string' ? path.resolve(root, pkg.llbot.webui) : undefined
    if (!file || !isInside(root, file)) warnings.push('llbot.webui should be a path inside the package')
    else if (!existsSync(file)) warnings.push(`llbot.webui ${pkg.llbot.webui} does not exist`)
    else webui = file
  }
  const { icon, details } = pkg.llbot
  return {
    name: pkg.name,
    version: typeof pkg.version === 'string' ? pkg.version : '0.0.0',
    root,
    main,
    manifest: {
      ...pkg.llbot,
      dependencies: parsePluginDependencies(pkg.llbot.dependencies),
      service: normalizeService(pkg.llbot.service, warnings),
      category: normalizeCategory(pkg.llbot.category, warnings),
    },
    description: typeof pkg.description === 'string' ? pkg.description : undefined,
    author: parseAuthor(pkg.author),
    repository: parseRepository(pkg.repository),
    sdkRange: pkg.peerDependencies?.[SDK_PACKAGE],
    webui,
    iconFile: typeof icon === 'string' && isImagePath(icon) ? packageFile(root, icon, 'llbot.icon', warnings) : undefined,
    detailsFile: details === undefined ? undefined : packageFile(root, details, 'llbot.details', warnings, ['.md', '.markdown']),
    screenshots: normalizeScreenshots(root, pkg.llbot.screenshots, warnings),
    warnings,
  }
}

/** package.json `author`: `Name <email> (url)`, or `{ name, email, url }` */
export function parseAuthor(value: unknown): PluginAuthor | undefined {
  let parts: { name?: unknown; email?: unknown; url?: unknown } = {}
  if (typeof value === 'string') {
    const match = /^([^<(]*?)\s*(?:<([^>]*)>)?\s*(?:\((.*)\))?\s*$/.exec(value.trim())
    if (match) parts = { name: match[1], email: match[2], url: match[3] }
  } else if (value && typeof value === 'object') {
    parts = value as Record<string, unknown>
  }
  const text = (field: unknown) => (typeof field === 'string' && field.trim() ? field.trim() : undefined)
  const name = text(parts.name)
  if (!name) return
  const author: PluginAuthor = { name }
  const email = text(parts.email)
  if (email) author.email = email
  const url = text(parts.url)
  // It becomes a link in the WebUI
  if (url && /^https?:\/\//i.test(url)) author.url = url
  return author
}

/** npm repository metadata is a browser link here, never a Git transport URL. */
export function parseRepository(value: unknown): string | undefined {
  const field = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>).url : value
  if (typeof field !== 'string') return
  let source = field.trim()
  if (!source || /[\u0000-\u001f\u007f\\]/.test(source)) return
  source = source.replace(/^git\+(?=https?:\/\/)/i, '')
    .replace(/^(?:github:|git@github\.com:)/i, 'https://github.com/')
    .replace(/^(?:git:\/\/|(?:git\+)?ssh:\/\/git@)github\.com\//i, 'https://github.com/')
  try {
    const url = new URL(source)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return
    url.pathname = url.pathname.replace(/\.git\/?$/i, '')
    return url.href
  } catch {
    return
  }
}

/** `llbot.screenshots`: images, or `{ src, caption }`; what is not an image in the package is dropped with a warning */
export function normalizeScreenshots(root: string, value: unknown, warnings: string[] = []): PluginScreenshot[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    warnings.push('llbot.screenshots should be a list of images in the package')
    return []
  }
  return value.flatMap((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : undefined
    const file = packageFile(root, record ? record.src : item, `llbot.screenshots[${index}]`, warnings)
    if (!file) return []
    const caption = typeof record?.caption === 'string' && record.caption.trim() ? record.caption.trim() : undefined
    return [caption ? { file, caption } : { file }]
  })
}

/** A file a manifest field names, from the package root with forward slashes; undefined with a warning when it is not one */
function packageFile(root: string, value: unknown, field: string, warnings: string[], extensions = IMAGE_EXTENSIONS): string | undefined {
  const file = typeof value === 'string' && value ? path.resolve(root, value) : undefined
  if (!file || !isInside(root, file)) {
    warnings.push(`${field} should be a path inside the package`)
    return
  }
  if (!extensions.includes(path.extname(file).toLowerCase())) {
    warnings.push(`${field} should be a ${extensions.join(' / ')} file`)
    return
  }
  if (!existsSync(file)) {
    warnings.push(`${field} ${value} does not exist`)
    return
  }
  return path.relative(root, file).split(path.sep).join('/')
}

export function isInside(dir: string, file: string): boolean {
  const relative = path.relative(dir, file)
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/** An unknown category is dropped with a warning: the plugin page lists the plugin under `other`. */
export function normalizeCategory(value: unknown, warnings: string[] = []): PluginCategory | undefined {
  if (value === undefined) return
  if (PLUGIN_CATEGORIES.includes(value as PluginCategory)) return value as PluginCategory
  warnings.push(`llbot.category should be one of ${PLUGIN_CATEGORIES.join(' / ')}, got ${JSON.stringify(value)}`)
}

/** Plugin dependencies are installation requirements: malformed declarations must never be silently dropped. */
export function parsePluginDependencies(value: unknown): Record<string, string> {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('llbot.dependencies should map plugin package names to semver ranges')
  }
  const dependencies: [string, string][] = []
  for (const [name, range] of Object.entries(value)) {
    if (name.length > 214 || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)
      || name === 'node_modules' || name === 'favicon.ico') {
      throw new Error(`llbot.dependencies has an invalid plugin package name ${JSON.stringify(name)}`)
    }
    if (typeof range !== 'string' || !range.trim() || validRange(range) === null) {
      throw new Error(`llbot.dependencies[${JSON.stringify(name)}] should be a semver range, got ${JSON.stringify(range)}`)
    }
    dependencies.push([name, range.trim()])
  }
  return Object.fromEntries(dependencies)
}

/** npm semver matching, shared by runtime package gates and the market's plugin dependency planner. */
export function matchesPluginVersion(version: string, range: string): boolean {
  return satisfiesRange(version, range)
}

/** Fills in the missing lists; a malformed field is dropped with a warning instead of failing the package. */
export function normalizeService(value: unknown, warnings: string[] = []): ServiceDeclaration {
  const result: ServiceDeclaration = { required: [], optional: [], implements: [] }
  if (value === undefined) return result
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    warnings.push('llbot.service should be an object with required / optional / implements lists')
    return result
  }
  for (const key of ['required', 'optional', 'implements'] as const) {
    const list = (value as Record<string, unknown>)[key]
    if (list === undefined) continue
    if (!Array.isArray(list) || list.some(item => typeof item !== 'string')) {
      warnings.push(`llbot.service.${key} should be a list of service names`)
      continue
    }
    result[key] = [...new Set(list as string[])]
  }
  const labels = (value as Record<string, unknown>).labels
  if (labels !== undefined) {
    if (!labels || typeof labels !== 'object' || Array.isArray(labels) || Object.values(labels).some(label => typeof label !== 'string')) {
      warnings.push('llbot.service.labels should map service names to what they stand for')
    } else {
      result.labels = labels as Record<string, string>
    }
  }
  return result
}

/** Run from its TypeScript sources (tsx, vitest), not the release build */
const FROM_SOURCE = import.meta.url.endsWith('.ts')

/**
 * The entry: `exports` (`import`, `default`, `node`), then `main`, then index.js. A host run from its sources takes
 * the `development` export first, when that file is there: a plugin's own sources, so it runs unbuilt.
 */
export function resolveMain(pkg: Record<string, any>, root?: string, fromSource = FROM_SOURCE): string {
  const source = fromSource ? developmentExport(pkg.exports) : undefined
  if (source && (!root || existsSync(path.resolve(root, source)))) return source
  return pickExport(pkg.exports) ?? (typeof pkg.main === 'string' ? pkg.main : 'index.js')
}

function developmentExport(exports: unknown): string | undefined {
  if (!exports || typeof exports !== 'object') return
  const record = exports as Record<string, unknown>
  const target = '.' in record ? record['.'] : record
  const source = target && typeof target === 'object' ? (target as Record<string, unknown>).development : undefined
  return typeof source === 'string' ? source : undefined
}

function pickExport(exports: unknown): string | undefined {
  if (typeof exports === 'string') return exports
  if (!exports || typeof exports !== 'object') return
  const record = exports as Record<string, unknown>
  const target = '.' in record ? record['.'] : record
  if (typeof target === 'string') return target
  if (!target || typeof target !== 'object') return
  const conditions = target as Record<string, unknown>
  return pickExport(conditions.import ?? conditions.default ?? conditions.node)
}

/** A plugin that declares no SDK range does not import the SDK, so any host version will do. */
export function sdkIncompatibility(range: string | undefined, sdkVersion: string | undefined): string | undefined {
  if (!range) return
  if (!sdkVersion) return `requires ${SDK_PACKAGE} ${range}, but the host ships none`
  try {
    if (satisfies(sdkVersion, range)) return
  } catch {
    return `invalid ${SDK_PACKAGE} range ${JSON.stringify(range)}`
  }
  return `requires ${SDK_PACKAGE} ${range}, host provides ${sdkVersion}`
}

async function childDirs(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return []
  const dirs: string[] = []
  for (const dirent of await readdir(dir, { withFileTypes: true })) {
    if (dirent.name.startsWith('.') || dirent.name === 'node_modules') continue
    const full = path.join(dir, dirent.name)
    if (dirent.isDirectory() || (dirent.isSymbolicLink() && (await stat(full).catch(() => undefined))?.isDirectory())) {
      dirs.push(full)
    }
  }
  return dirs
}
