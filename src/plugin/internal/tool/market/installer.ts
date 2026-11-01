import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { lstat, mkdir, readdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import { isInside } from '../../../host/manifest'
import { matches, PackageVersion, Packument, parseSpec, pickVersion, RegistryClient } from './registry'
import { extractPackage } from './tar'

const gunzipAsync = promisify(gunzip)

/** Prefix of the installer's own directories in the plugin root; the scanner and the watcher skip dot names */
const SCRATCH = '.market-'
const MAX_DEPTH = 64
const DOWNLOADS = 8

// validate-npm-package-name without its length and reserved-name checks
const PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

export interface InstallResult {
  name: string
  version: string
  /** Packages with install scripts, which did not run: one needing a native build will fail to load */
  scripts: string[]
  /** Optional dependencies left out: made for another platform, or not found */
  skipped: string[]
  /** How many packages were written, the plugin included */
  packages: number
}

interface Node {
  /** The directory under node_modules: an alias's own name, not the package's */
  alias: string
  manifest: PackageVersion
  parent?: Node
  children: Map<string, Node>
}

/**
 * Installs plugin packages from a registry into a plugin root, the way npm would lay them out, without npm: the
 * bot ships a bare node. Lifecycle scripts never run. Packages the host shares with every plugin (`shared`: cordis,
 * the SDK, ...) are left out, the module hook resolves them to the host's copy anyway.
 */
export class Installer {
  constructor(
    private readonly registry: RegistryClient,
    readonly root: string,
    private readonly shared: ReadonlySet<string>,
  ) {}

  static validName(name: string): boolean {
    return PACKAGE_NAME.test(name)
  }

  /** Where a package goes, or undefined for a name that is no package name */
  target(name: string): string | undefined {
    if (!Installer.validName(name)) return
    const target = path.resolve(this.root, name)
    return isInside(this.root, target) ? target : undefined
  }

  /** Lays `main` and its dependencies out in a scratch directory, then swaps it in for what was there. */
  async install(main: PackageVersion): Promise<InstallResult> {
    const target = this.target(main.name)
    if (!target) throw new Error(`invalid package name ${main.name}`)
    await this.assertReal(target)
    const { root, skipped } = await this.plan(main)
    await mkdir(this.root, { recursive: true })
    const scratch = this.scratch()
    try {
      const nodes = layout(root, scratch)
      await mapLimit(nodes, DOWNLOADS, async ({ node, dir }) => {
        const tar = await gunzipAsync(await this.registry.tarball(node.manifest))
        await extractPackage(tar, dir)
      })
      await this.swap(scratch, target)
      return {
        name: main.name,
        version: main.version,
        scripts: [...new Set(nodes.filter(({ node }) => hasScripts(node.manifest)).map(({ node }) => node.manifest.name))],
        skipped,
        packages: nodes.length,
      }
    } finally {
      await rm(scratch, { recursive: true, force: true }).catch(() => {})
    }
  }

  /** Moves the package away before deleting it, so a file held open fails the call before anything is lost. */
  async uninstall(name: string): Promise<void> {
    const target = this.target(name)
    if (!target) throw new Error(`invalid package name ${name}`)
    await this.assertReal(target)
    if (!existsSync(target)) return
    const away = this.scratch()
    await rename(target, away).catch((e) => {
      throw busy(e, name)
    })
    await rm(away, { recursive: true, force: true }).catch(() => {})
    const scope = path.dirname(target)
    if (scope !== this.root && !(await readdir(scope)).length) await rm(scope, { recursive: true, force: true }).catch(() => {})
  }

  /** What a crash in the middle of an install left behind */
  async cleanup(): Promise<void> {
    if (!existsSync(this.root)) return
    for (const name of await readdir(this.root)) {
      if (name.startsWith(SCRATCH)) await rm(path.join(this.root, name), { recursive: true, force: true }).catch(() => {})
    }
  }

  /**
   * npm's tree, kept simple: a dependency goes to the plugin's own node_modules unless a different version is there
   * already, then under the package that needs it. That never shadows what an earlier package resolved: a node's
   * children are all placed before any of its descendants look them up.
   */
  private async plan(main: PackageVersion): Promise<{ root: Node; skipped: string[] }> {
    const root: Node = { alias: main.name, manifest: main, children: new Map() }
    const skipped: string[] = []
    const queue = [root]
    // Each document once per install, asked for as soon as a package needing it is placed: the walk then rarely
    // waits on the network one document at a time
    const documents = new Map<string, Promise<Packument>>()
    const packument = (name: string) => {
      let document = documents.get(name)
      if (!document) {
        document = this.registry.packument(name)
        document.catch(() => {})
        documents.set(name, document)
      }
      return document
    }
    const prefetch = (manifest: PackageVersion) => {
      for (const dep of dependenciesOf(manifest)) {
        if (this.shared.has(dep.alias)) continue
        try {
          packument(parseSpec(dep.alias, dep.spec).name)
        } catch {
          // reported when its turn comes
        }
      }
    }
    prefetch(main)
    for (let node = queue.shift(); node; node = queue.shift()) {
      if (depthOf(node) > MAX_DEPTH) throw new Error(`dependencies nest too deep at ${node.manifest.name}`)
      for (const dep of dependenciesOf(node.manifest)) {
        if (this.shared.has(dep.alias)) continue
        let spec: { name: string; range: string }
        try {
          spec = parseSpec(dep.alias, dep.spec)
        } catch (e) {
          if (dep.optional) {
            skipped.push(dep.alias)
            continue
          }
          throw e
        }
        const existing = lookup(node, dep.alias)
        if (existing && existing.manifest.name === spec.name && matches(existing.manifest.version, spec.range)) continue
        const version = await packument(spec.name).then(
          document => pickVersion(document, spec.range),
          (e) => {
            if (dep.optional) return undefined
            throw e
          },
        )
        if (!version || !fitsPlatform(version)) {
          if (dep.optional) {
            skipped.push(dep.alias)
            continue
          }
          if (!version) throw new Error(`${node.manifest.name} needs ${spec.name}@${spec.range}, which has no matching version`)
          throw new Error(`${node.manifest.name} needs ${spec.name}@${version.version}, which is not made for ${process.platform}-${process.arch}`)
        }
        const child: Node = { alias: dep.alias, manifest: version, children: new Map() }
        // Another version on the way up: only right under this node does this one come first
        const parent = existing ? node : root
        child.parent = parent
        parent.children.set(dep.alias, child)
        queue.push(child)
        prefetch(version)
      }
    }
    return { root, skipped }
  }

  private async swap(scratch: string, target: string) {
    await mkdir(path.dirname(target), { recursive: true })
    const old = existsSync(target) ? this.scratch() : undefined
    if (old) {
      await rename(target, old).catch((e) => {
        throw busy(e, path.basename(target))
      })
    }
    try {
      await rename(scratch, target)
    } catch (e) {
      if (old) await rename(old, target).catch(() => {})
      throw e
    }
    if (old) await rm(old, { recursive: true, force: true }).catch(() => {})
  }

  /** A link (a plugin under development, say) is the user's own: the market neither replaces nor deletes it */
  private async assertReal(target: string) {
    const stat = await lstat(target).catch(() => undefined)
    if (stat?.isSymbolicLink()) throw new Error(`${target} is a link; the market leaves linked packages alone`)
    const scope = path.dirname(target)
    if (scope !== this.root && (await lstat(scope).catch(() => undefined))?.isSymbolicLink()) {
      throw new Error(`${scope} is a link; the market leaves linked packages alone`)
    }
  }

  private scratch() {
    return path.join(this.root, `${SCRATCH}${randomBytes(4).toString('hex')}`)
  }
}

function busy(error: unknown, name: string): Error {
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
    return new Error(`${name} has files in use (a native module, most likely); restart the bot and try again`)
  }
  return error as Error
}

function dependenciesOf(manifest: PackageVersion): { alias: string; spec: string; optional: boolean }[] {
  // Bundled ones come inside the tarball; `true` bundles them all
  const bundle = manifest.bundleDependencies ?? manifest.bundledDependencies
  if (bundle === true) return []
  const bundled = new Set(Array.isArray(bundle) ? bundle : [])
  const deps = new Map<string, { alias: string; spec: string; optional: boolean }>()
  for (const [alias, spec] of Object.entries(manifest.dependencies ?? {})) deps.set(alias, { alias, spec, optional: false })
  // npm lists an optional dependency in both; the optional entry wins
  for (const [alias, spec] of Object.entries(manifest.optionalDependencies ?? {})) deps.set(alias, { alias, spec, optional: true })
  return [...deps.values()].filter(dep => !bundled.has(dep.alias))
}

function lookup(node: Node, alias: string): Node | undefined {
  for (let current: Node | undefined = node; current; current = current.parent) {
    const found = current.children.get(alias)
    if (found) return found
  }
}

function depthOf(node: Node): number {
  let depth = 0
  for (let current = node.parent; current; current = current.parent) depth++
  return depth
}

function layout(root: Node, dir: string): { node: Node; dir: string }[] {
  const result = [{ node: root, dir }]
  for (const child of root.children.values()) result.push(...layout(child, path.join(dir, 'node_modules', child.alias)))
  return result
}

function hasScripts(manifest: PackageVersion): boolean {
  if (manifest.hasInstallScript) return true
  const scripts = manifest.scripts ?? {}
  return !!(scripts.preinstall || scripts.install || scripts.postinstall)
}

function fitsPlatform(manifest: PackageVersion): boolean {
  return fits(manifest.os, process.platform) && fits(manifest.cpu, process.arch) && (process.platform !== 'linux' || fits(manifest.libc, libc()))
}

/** npm's `os` / `cpu` / `libc` lists: names, or `!name` to exclude one */
function fits(list: string[] | undefined, value: string): boolean {
  if (!Array.isArray(list) || !list.length) return true
  if (list.includes(`!${value}`)) return false
  const allowed = list.filter(item => !item.startsWith('!'))
  return !allowed.length || allowed.includes(value)
}

let libcName: string | undefined

function libc(): string {
  libcName ??= (process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined)?.header?.glibcVersionRuntime ? 'glibc' : 'musl'
  return libcName
}

/** Stops at the first failure, but only rejects once the tasks under way are done: the caller deletes their directory */
async function mapLimit<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0
  let failed = false
  const workers = await Promise.allSettled(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && next < items.length) {
      try {
        await task(items[next++])
      } catch (e) {
        failed = true
        throw e
      }
    }
  }))
  const rejected = workers.find((worker): worker is PromiseRejectedResult => worker.status === 'rejected')
  if (rejected) throw rejected.reason
}
