import { createHash } from 'node:crypto'
import { compareVersions, satisfies } from 'compare-versions'

/** The keyword a plugin package lists (`keywords` in package.json) to show up in the market */
export const PLUGIN_KEYWORD = 'luckylillia-plugin'

export interface PackageVersion {
  name: string
  version: string
  description?: string
  keywords?: string[]
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  bundleDependencies?: string[] | boolean
  bundledDependencies?: string[] | boolean
  os?: string[]
  cpu?: string[]
  libc?: string[]
  deprecated?: string
  /** Abbreviated documents only; full ones have `scripts` */
  hasInstallScript?: boolean
  scripts?: Record<string, string>
  dist: { tarball: string; integrity?: string; shasum?: string }
  /** Full documents only */
  llbot?: unknown
}

export interface Packument {
  name: string
  'dist-tags': Record<string, string>
  versions: Record<string, PackageVersion>
}

export interface SearchItem {
  name: string
  version: string
  description?: string
  keywords?: string[]
  date?: string
  publisher?: string
  links?: { npm?: string; homepage?: string; repository?: string }
}

export interface SearchResult {
  total: number
  items: SearchItem[]
}

/** What the installer needs of a registry; tests give it one in memory */
export interface RegistryClient {
  /** `full`: the whole package.json of each version (custom fields like `llbot`), instead of what installs need */
  packument(name: string, full?: boolean): Promise<Packument>
  /** Checked against `dist.integrity` / `dist.shasum` */
  tarball(version: PackageVersion): Promise<Buffer>
}

export class RegistryError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

const ABBREVIATED = 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*'

export class Registry implements RegistryClient {
  constructor(readonly url: string, readonly searchUrl: string) {}

  packument(name: string, full = false): Promise<Packument> {
    return this.json<Packument>(`${base(this.url)}/${name.replace('/', '%2f')}`, full ? 'application/json' : ABBREVIATED, `package ${name}`)
  }

  async tarball(version: PackageVersion): Promise<Buffer> {
    const response = await fetch(version.dist.tarball, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new RegistryError(`${version.name}@${version.version}: ${response.status} fetching ${version.dist.tarball}`, response.status)
    const data = Buffer.from(await response.arrayBuffer())
    verify(data, version)
    return data
  }

  async search(text: string, from: number, size: number): Promise<SearchResult> {
    const query = new URLSearchParams({ text: `keywords:${PLUGIN_KEYWORD} ${text}`.trim(), from: String(from), size: String(size) })
    const result = await this.json<{ total?: number; objects?: { package?: Record<string, any> }[] }>(
      `${base(this.searchUrl)}/-/v1/search?${query}`, 'application/json', 'search',
    )
    const items = (result.objects ?? []).flatMap(({ package: pkg }) => {
      if (typeof pkg?.name !== 'string' || typeof pkg.version !== 'string') return []
      // A registry ignoring the `keywords:` qualifier searches for the words instead
      if (Array.isArray(pkg.keywords) && !pkg.keywords.includes(PLUGIN_KEYWORD)) return []
      return [{
        name: pkg.name,
        version: pkg.version,
        description: typeof pkg.description === 'string' ? pkg.description : undefined,
        keywords: Array.isArray(pkg.keywords) ? pkg.keywords : undefined,
        date: typeof pkg.date === 'string' ? pkg.date : undefined,
        publisher: typeof pkg.publisher?.username === 'string' ? pkg.publisher.username : undefined,
        links: pkg.links && typeof pkg.links === 'object' ? pkg.links : undefined,
      } satisfies SearchItem]
    })
    return { total: typeof result.total === 'number' ? result.total : items.length, items }
  }

  private async json<T>(url: string, accept: string, what: string): Promise<T> {
    let response: Response
    try {
      response = await fetch(url, { headers: { accept }, signal: AbortSignal.timeout(30_000) })
    } catch (e) {
      throw new RegistryError(`${what}: cannot reach ${new URL(url).origin}: ${(e as Error).cause ?? (e as Error).message}`)
    }
    if (response.status === 404) throw new RegistryError(`${what} not found on ${new URL(url).origin}`, 404)
    if (!response.ok) throw new RegistryError(`${what}: ${new URL(url).origin} answered ${response.status}`, response.status)
    return await response.json() as T
  }
}

const base = (url: string) => url.replace(/\/+$/, '')

const STRENGTH = ['sha1', 'sha256', 'sha384', 'sha512']

/** Against the strongest hash of the SRI `dist.integrity`, else the sha1 `dist.shasum` */
export function verify(data: Buffer, version: PackageVersion) {
  const label = `${version.name}@${version.version}`
  const hashes = (version.dist.integrity ?? '').trim().split(/\s+/).flatMap((item) => {
    const dash = item.indexOf('-')
    const algorithm = item.slice(0, dash)
    return dash > 0 && STRENGTH.includes(algorithm) ? [{ algorithm, digest: item.slice(dash + 1).split('?')[0] }] : []
  })
  const strongest = hashes.sort((a, b) => STRENGTH.indexOf(b.algorithm) - STRENGTH.indexOf(a.algorithm))[0]
  if (strongest) {
    if (createHash(strongest.algorithm).update(data).digest('base64') !== strongest.digest) throw new Error(`${label}: tarball fails its ${strongest.algorithm} integrity check`)
    return
  }
  if (!version.dist.shasum) throw new Error(`${label}: the registry gives no checksum for the tarball`)
  if (createHash('sha1').update(data).digest('hex') !== version.dist.shasum.toLowerCase()) throw new Error(`${label}: tarball fails its sha1 check`)
}

/**
 * A dependency spec as the package to fetch and the range to pick from: `npm:<name>@<range>` aliases another
 * package. Git, file, link and URL specs are not supported.
 */
export function parseSpec(alias: string, spec: string): { name: string; range: string } {
  if (spec.startsWith('npm:')) {
    const rest = spec.slice(4)
    const at = rest.lastIndexOf('@')
    return at > 0 ? { name: rest.slice(0, at), range: rest.slice(at + 1) || 'latest' } : { name: rest, range: 'latest' }
  }
  // No semver range has either
  if (spec.includes(':') || spec.includes('/')) throw new Error(`${alias}@${spec}: only registry versions can be installed`)
  return { name: alias, range: spec.trim() || 'latest' }
}

/** compare-versions takes neither `*` nor partial versions (`1`, `1.2`), which npm reads as `1.x`, `1.2.x` */
function normalizeRange(range: string): string | undefined {
  const alternatives = range.split('||').map((part) => {
    if (part.includes(' - ')) return part.trim()
    return part.trim().replace(/([<>=]+)\s+/g, '$1').split(/\s+/).flatMap((comparator) => {
      if (!comparator || /^[*xX]$/.test(comparator)) return []
      if (/^v?\d+$/.test(comparator)) return [`${comparator}.x`]
      if (/^v?\d+\.\d+$/.test(comparator)) return [`${comparator}.x`]
      return [comparator]
    }).join(' ')
  })
  if (alternatives.some(part => !part)) return
  return alternatives.join(' || ')
}

export function matches(version: string, range: string): boolean {
  const normalized = normalizeRange(range)
  if (normalized === undefined) return true
  try {
    return satisfies(version, normalized)
  } catch {
    return false
  }
}

function compare(a: string, b: string): number {
  try {
    return compareVersions(a, b)
  } catch {
    return a.localeCompare(b)
  }
}

/**
 * What npm installs for a range or dist-tag: the `latest` tag when it fits, else the highest version that does,
 * prereleases only for a range naming one. `accept` narrows the choice, e.g. to versions that run on this bot;
 * a range that is just `latest` then falls back to the newest accepted version below it.
 */
export function pickVersion(
  document: Packument,
  range = 'latest',
  accept: (version: PackageVersion) => boolean = () => true,
): PackageVersion | undefined {
  const tags = document['dist-tags'] ?? {}
  if (range !== 'latest' && tags[range] !== undefined) {
    const tagged = document.versions[tags[range]]
    return tagged && accept(tagged) ? tagged : undefined
  }
  const any = range === 'latest' || normalizeRange(range) === undefined
  const latest = tags.latest === undefined ? undefined : document.versions[tags.latest]
  if (latest && accept(latest) && (any || matches(latest.version, range))) return latest
  const prerelease = !any && range.includes('-')
  return Object.values(document.versions)
    .filter(version => (prerelease || !version.version.includes('-'))
      && (any ? !latest || compare(version.version, latest.version) <= 0 : matches(version.version, range))
      && accept(version))
    .sort((a, b) => compare(a.version, b.version))
    .at(-1)
}
