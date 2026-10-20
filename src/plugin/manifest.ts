import { existsSync } from 'node:fs'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { satisfies } from 'compare-versions'
import type { LLBotManifest } from '@luckylillia/plugin-sdk'

export const SDK_PACKAGE = '@luckylillia/plugin-sdk'

export interface PluginPackage {
  name: string
  version: string
  /** Absolute package directory. */
  root: string
  /** Absolute entry file. */
  main: string
  manifest: LLBotManifest
  description?: string
  /** `peerDependencies['@luckylillia/plugin-sdk']`, if declared. */
  sdkRange?: string
  warnings: string[]
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
  const main = path.resolve(root, resolveMain(pkg))
  if (!existsSync(main)) throw new Error(`entry ${path.relative(root, main)} does not exist`)
  const warnings: string[] = []
  if (pkg.type !== 'module' && path.extname(main) === '.js') {
    warnings.push('package.json lacks "type": "module", so .js files load as CommonJS')
  }
  return {
    name: pkg.name,
    version: typeof pkg.version === 'string' ? pkg.version : '0.0.0',
    root,
    main,
    manifest: pkg.llbot,
    description: typeof pkg.description === 'string' ? pkg.description : undefined,
    sdkRange: pkg.peerDependencies?.[SDK_PACKAGE],
    warnings,
  }
}

export function resolveMain(pkg: Record<string, any>): string {
  return pickExport(pkg.exports) ?? (typeof pkg.main === 'string' ? pkg.main : 'index.js')
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
