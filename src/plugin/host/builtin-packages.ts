import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { valid, gt } from 'semver'
import type { LLBotManifest } from '@luckylillia/plugin-sdk'
import { JsonFile } from '../../common/jsonFile'
import { isInside, readPluginPackage, sdkIncompatibility, SDK_PACKAGE, type PluginPackage } from './manifest'
import type { BuiltinPlugin } from './index'

/** Increment when changing the private imports used by the official bundled packages. */
export const BUILTIN_ABI = 1

export interface BuiltinPackageIdentity { name: string; version: string; abi: number }

export interface BuiltinPackageInfo {
  name: string
  version: string
  activeVersion: string
  bundledVersion: string
  entryName: string
  manifest: LLBotManifest
  /** Writable npm installation, never the files shipped with the application. */
  root?: string
  restartRequired: boolean
  error?: string
}

interface Approval { version: string; digest: string }
type Approvals = Record<string, Approval>

/** Official overrides are selected once at boot; their immutable snapshots also keep WebUI code in sync. */
export class BuiltinPackages {
  private readonly bundled: Map<string, BuiltinPlugin>
  private readonly approved = new Map<string, { approval: Approval; pkg: PluginPackage }>()
  private readonly active = new Map<string, PluginPackage>()
  private readonly failures = new Map<string, string>()
  private readonly store?: JsonFile<Approvals>

  constructor(builtins: Iterable<BuiltinPlugin>, private readonly root?: string) {
    this.bundled = new Map([...builtins].filter(item => item.npm).map(item => [item.npm!.name, item]))
    if (root) this.store = new JsonFile(path.join(root, '.builtin-updates.json'), { defaultValue: () => ({}) })
  }

  has(name: string): boolean { return this.bundled.has(name) }

  list(): BuiltinPackageInfo[] {
    return [...this.bundled].map(([name, builtin]) => {
      const installed = this.approved.get(name)?.pkg
      const activeVersion = this.active.get(builtin.name)?.version ?? builtin.npm!.version
      const version = installed?.version ?? builtin.npm!.version
      return {
        name, version, activeVersion, bundledVersion: builtin.npm!.version, entryName: builtin.name,
        manifest: installed?.manifest ?? builtin.manifest, root: installed && path.resolve(this.root!, name),
        restartRequired: version !== activeVersion, error: this.failures.get(name),
      }
    })
  }

  package(entryName: string): PluginPackage | undefined { return this.active.get(entryName) }

  fallback(entryName: string, error: string): BuiltinPlugin | undefined {
    if (!this.active.has(entryName)) return
    const builtin = [...this.bundled.values()].find(item => item.name === entryName)
    if (!builtin) return
    this.active.delete(entryName)
    this.failures.set(builtin.npm!.name, error)
    return builtin
  }

  check(name: string, manifest: Record<string, any>, sdkVersion?: string): string | undefined {
    const builtin = this.bundled.get(name)
    if (!builtin) return manifest.llbot?.builtin ? 'This package is not an official built-in plugin' : undefined
    if (manifest.name !== name) return 'Built-in package name does not match its approved identity'
    const identity = manifest.llbot?.builtin
    if (identity?.entry !== builtin.name || identity.abi !== builtin.npm!.abi) {
      return 'This built-in package targets a different Bot runtime; update Bot first'
    }
    if (!valid(manifest.version) || !gt(manifest.version, builtin.npm!.version)) {
      return `Built-in override must be newer than bundled version ${builtin.npm!.version}`
    }
    return sdkIncompatibility(manifest.peerDependencies?.[SDK_PACKAGE], sdkVersion)
  }

  /** Called only after a catalog-approved archive has passed integrity checks and installation. */
  async approve(name: string, version: string, sdkVersion?: string): Promise<void> {
    if (!this.has(name) || !this.root || !this.store) throw new Error(`${name} is not an updatable built-in package`)
    const target = path.resolve(this.root, name)
    if (!isInside(this.root, target)) throw new Error('Built-in package path is outside the plugin root')
    const manifest = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'))
    if (manifest.version !== version) throw new Error('Installed built-in version changed before approval')
    const problem = this.check(name, manifest, sdkVersion)
    if (problem) throw new Error(problem)
    const digest = await packageDigest(target)
    const approval = { version, digest }
    const snapshot = this.snapshot(name, approval)
    await mkdir(path.dirname(snapshot), { recursive: true })
    await cp(target, snapshot, { recursive: true, force: false, errorOnExist: false })
    if (await packageDigest(snapshot) !== digest) throw new Error('Built-in package changed while its snapshot was being created')
    const pkg = await readPluginPackage(snapshot)
    if (!pkg) throw new Error('Built-in package has no plugin entry')
    await this.store.update(current => ({ ...current, [name]: approval }))
    this.approved.set(name, { approval, pkg })
    this.failures.delete(name)
  }

  async restore(sdkVersion?: string): Promise<void> {
    if (!this.store) return
    const { data, error } = await this.store.read()
    if (error) throw new Error(`Cannot read built-in package approvals: ${error}`)
    for (const [name, builtin] of this.bundled) {
      const approval = data?.[name]
      if (!approval) continue
      try {
        if (!valid(approval.version) || !/^[a-f0-9]{64}$/.test(approval.digest)) throw new Error('Invalid built-in package approval')
        // A newer Bot may already ship this fix; it always wins over an equal or older override.
        if (!gt(approval.version, builtin.npm!.version)) continue
        const snapshot = this.snapshot(name, approval)
        if (await packageDigest(snapshot) !== approval.digest) throw new Error('Built-in package files no longer match the approved download')
        const manifest = JSON.parse(await readFile(path.join(snapshot, 'package.json'), 'utf8'))
        const problem = this.check(name, manifest, sdkVersion)
        if (problem || manifest.version !== approval.version) throw new Error(problem ?? 'Approved built-in version does not match')
        const pkg = await readPluginPackage(snapshot)
        if (!pkg) throw new Error('Built-in package has no plugin entry')
        this.approved.set(name, { approval, pkg })
      } catch (error) {
        this.failures.set(name, String(error instanceof Error ? error.message : error))
      }
    }
  }

  async load(builtins: Map<string, BuiltinPlugin>, validate: (plugin: unknown) => boolean): Promise<void> {
    for (const [name, { pkg }] of this.approved) {
      const bundled = this.bundled.get(name)!
      try {
        const exports = await import(pathToFileURL(pkg.main).href)
        const entry: BuiltinPlugin = exports.builtin
        if (entry?.name !== bundled.name || !validate(entry.plugin) || (entry.standby && !validate(entry.standby))) {
          throw new Error('The package does not export the expected built-in entry')
        }
        // Core restrictions and the stable identity belong to Bot, never to a downloadable manifest.
        builtins.set(bundled.name, { ...entry, name: bundled.name, core: bundled.core, npm: bundled.npm,
          manifest: { ...pkg.manifest, hidden: bundled.manifest.hidden },
          config: entry.config && { ...entry.config, initial: bundled.config?.initial ?? entry.config.initial,
            secrets: [...new Set([...(bundled.config?.secrets ?? []), ...(entry.config.secrets ?? [])])] },
        })
        this.active.set(bundled.name, pkg)
      } catch (error) {
        this.failures.set(name, String(error instanceof Error ? error.message : error))
      }
    }
  }

  private snapshot(name: string, approval: Approval): string {
    return path.join(this.root!, '.builtin-packages', name.replace('/', '+'), `${approval.version}-${approval.digest}`)
  }
}

/** No links: a snapshot may never load mutable code outside its approved directory. */
export async function packageDigest(root: string): Promise<string> {
  const hash = createHash('sha256')
  const absolute = path.resolve(root)
  if (await realpath(absolute) !== absolute) throw new Error('Built-in package directory must not be a symbolic link')
  const walk = async (dir: string): Promise<void> => {
    const info = await lstat(dir)
    if (info.isSymbolicLink()) throw new Error('Built-in package must not contain symbolic links')
    if (info.isDirectory()) {
      for (const name of (await readdir(dir)).sort()) await walk(path.join(dir, name))
    } else if (info.isFile()) {
      const bytes = await readFile(dir)
      const relative = path.relative(absolute, dir).split(path.sep).join('/')
      hash.update(JSON.stringify([relative, bytes.length])).update(bytes)
    } else throw new Error('Built-in package contains an unsupported file')
  }
  await walk(absolute)
  return hash.digest('hex')
}
