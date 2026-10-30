import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDevMode } from '@/common/utils/environment'
import type { NativeSign } from './sign-types'
import type { NativeQQ } from './lucky-lillia/production'

export type { NativeQQ } from './lucky-lillia/production'
export interface NativeAddon extends NativeSign {
  NativeQQ: new () => NativeQQ
  getNativeDirectory(): string
  getNativeBuildInfo(): { package: string; version: string; variant: string; target: string; buildId: string }
}

const requireNative = createRequire(import.meta.url)
let addon: NativeAddon | undefined

/** One verified addon per host. Copy the entire target so Windows upgrades keep the sidecar paired. */
export function getNativeAddon(): NativeAddon {
  if (addon) return addon
  const variant = isDevMode() ? 'development' : 'production'
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [path.join(here, 'lucky-lillia', variant), path.join(here, 'native', 'lucky-lillia', variant)]
  const root = candidates.find(dir => existsSync(path.join(dir, 'loader.cjs')))
  if (!root) throw new Error(`缺少 LuckyLillia ${variant} 原生包；请在 LuckyLillia.node 执行 sync-to-bot 后重新构建 Bot。查找位置：${candidates.join(', ')}`)
  const loader = requireNative(path.join(root, 'loader.cjs'))
  if (loader.inspectBundle(root).manifest.variant !== variant) throw new Error('Native bundle authorization variant mismatch')
  const loaded = loader.loadNative(root, { cacheDir: path.join(tmpdir(), 'lucky-lillia-node') }) as NativeAddon
  if (typeof loaded.NativeQQ !== 'function') throw new Error('原生包缺少 NativeQQ，请同步新版 LuckyLillia.node 后重新构建 Bot')
  addon = loaded
  return addon
}
