import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const requireBin = createRequire(import.meta.url)

function pickTriple(): string {
  const p = process.platform
  const a = process.arch
  if (p === 'win32' && a === 'x64') return 'win-x64'
  if (p === 'win32' && a === 'arm64') return 'win-arm64'
  if (p === 'linux' && a === 'x64') return 'linux-x64'
  if (p === 'linux' && a === 'arm64') return 'linux-arm64'
  if (p === 'darwin' && a === 'x64') return 'darwin-x64'
  if (p === 'darwin' && a === 'arm64') return 'darwin-arm64'
  throw new Error(`sign-proxy: unsupported platform ${p}-${a}; rebuild lucky-lillia-sign-proxy on this target and drop the .node into ${here}`)
}

/**
 * 读 sign-proxy 版本号. dev 跑 tsx 时 here=src/.../sign-proxy/, package.json 就在旁边;
 * prod bundle 里 here=dist/, 跟 Bot 主 package.json 同名会撞, vite 时把它改名拷成
 * sign-proxy.package.json, 这里也试一下. 都不通就 fallback '0.0.0' (热更新失效但不影响加载).
 */
function pickVersion(): string {
  for (const name of ['package.json', 'sign-proxy.package.json']) {
    try {
      const raw = readFileSync(join(here, name), 'utf-8')
      const pkg = JSON.parse(raw)
      // 主 package.json 命中时校验 name, 防 prod 误读到 Bot 主 package.json
      if (pkg.name && pkg.name !== '@lucky-lillia/sign-proxy-loader') continue
      if (typeof pkg.version === 'string' && pkg.version.length > 0) return pkg.version
    } catch {
      // continue
    }
  }
  return '0.0.0'
}

/**
 * 把同目录的 .node 拷到 tmpdir/lucky-lillia-sign-proxy/sign-proxy.<triple>.<version>.node 再 require.
 *
 * 为什么转一道: Bot 跑着时 require 的 .node 文件被 OS 锁定 (Windows 尤甚), 无法被
 * `npm run build:dev-bot` / 外部部署脚本覆盖 -- 等于阻止热更新. 转 tmpdir + 把版本号
 * 串进文件名后, 升级时 src/ 目录 .node 随便覆盖 (它没被 require), 重启 Bot 时
 * version bump -> 新 tmpdir 路径 -> 新文件被复制并 require, 旧 tmpdir 副本留着不影响.
 *
 * 复制策略 (existsSync 优先, copy 失败 swallow):
 *   1. 目标已存在 -> 直接用, 不复制 (这是 99% 的情况, 同一版本第二次起 Bot)
 *   2. 不存在 -> copyFileSync; 失败 (e.g. tmpdir 写不进) -> fallback 到原路径加载
 *      (开发场景方便; 生产 tmpdir 总该可写)
 */
function ensureLoadablePath(srcPath: string, version: string, triple: string): string {
  const cacheRoot = join(tmpdir(), 'lucky-lillia-sign-proxy')
  const cachedName = `sign-proxy.${triple}.${version}.node`
  const cachedPath = join(cacheRoot, cachedName)

  if (existsSync(cachedPath)) return cachedPath

  try {
    mkdirSync(cacheRoot, { recursive: true })
    copyFileSync(srcPath, cachedPath)
    return cachedPath
  } catch (e) {
    console.warn(`[sign-proxy] hot-update copy failed (${(e as Error).message}); falling back to ${srcPath}`)
    return srcPath
  }
}

interface Native {
  init(args: InitArgs, sendPacket: (p: RelayPacket) => Promise<Buffer>, logger: (log: SignLog) => void): Promise<void>
  ping(): string
  setAuthToken(authToken: string): Promise<void>
  /** 运行中切换 16B device GUID (hex). 老版 .node 没这 export 时 swallow. */
  setMachineGuid?(guidHex: string): void
  preflight(): Promise<string | null>
  signRequest(args: SignRequestArgs): Promise<SignResultJs>
  acquireSignToken(args: AcquireSignTokenArgs): Promise<AcquireSignTokenResult>
  postEnvelope(args: PostEnvelopeArgs): Promise<string>
}

const triple = pickTriple()
const version = pickVersion()
const srcPath = join(here, `sign-proxy.${triple}.node`)
const loadPath = ensureLoadablePath(srcPath, version, triple)
let native: Native
try {
  native = requireBin(loadPath) as Native
} catch (e) {
  throw new Error(`sign-proxy: failed to load ${loadPath}: ${(e as Error).message}`)
}

export interface InitArgs {
  botVersion: string
  /** manager JWT. */
  authToken: string
  /** 16B device GUID hex (32 chars). 跟 wtlogin client.guid 同源. */
  machineGuidHex: string
  /** 当前账号 uin, 可选; 没有就等登录完成 SignProxy 自己绑. */
  uin?: number
}

/** 发包回调入参: 把 body relay 给 QQ 的 cmd. */
export interface RelayPacket {
  cmd: string
  body: Buffer
}

/** SDK logger 回调入参: level 是 "warn" / "error". 401/403 fatal 时 SDK 报 error 然后 exit. */
export interface SignLog {
  level: string
  message: string
}

export interface SignRequestArgs {
  cmd: string
  bodyHex: string
  seq: number
  guidHex: string
  qua: string
  uin: number
  /** QQ 12B session token 的 utf-8 hex (登录后由 acquireSignToken 拿到). 登录前传 "". */
  protocolTokenHex: string
}

export interface SignResultJs {
  sign: Buffer
  token: Buffer
  extra: Buffer
}

export interface AcquireSignTokenArgs {
  uin: number
  qua: string
}

/** acquireSignToken 返回: 12B token + QQ 下发的 TTL(秒, 0 = native 没解析到 ESK field 3). */
export interface AcquireSignTokenResult {
  token: Buffer
  ttlSecs: number
}

export interface PostEnvelopeArgs {
  path: string
  plaintextJson: string
}

export const init = native.init
export const ping = native.ping
export const setAuthToken = native.setAuthToken
export const setMachineGuid = native.setMachineGuid
export const preflight = native.preflight
export const signRequest = native.signRequest
export const acquireSignToken = native.acquireSignToken
export const postEnvelope = native.postEnvelope
