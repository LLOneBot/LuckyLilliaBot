import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { getLogger } from '@/common/logger'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const requireBin = createRequire(import.meta.url)

// alpine/musl 判据: glibc 的 node report 带 glibcVersionRuntime, musl 上没有 (napi-rs 同款).
// 兜底再看 alpine 标志文件 / musl 动态加载器. 直连 sign-proxy .node 分 glibc / musl 两套 (ABI 不通用).
function isMusl(): boolean {
  if (process.platform !== 'linux') return false
  try {
    const report = (process.report?.getReport?.() ?? {}) as { header?: { glibcVersionRuntime?: string } }
    if (report.header && 'glibcVersionRuntime' in report.header) return !report.header.glibcVersionRuntime
  } catch { /* 忽略, 走下面兜底 */ }
  return existsSync('/etc/alpine-release') || existsSync('/lib/ld-musl-x86_64.so.1') || existsSync('/lib/ld-musl-aarch64.so.1')
}

function pickTriple(): string {
  const p = process.platform
  const a = process.arch
  if (p === 'win32' && a === 'x64') return 'win-x64'
  if (p === 'win32' && a === 'arm64') return 'win-arm64'
  if (p === 'linux' && a === 'x64') return isMusl() ? 'linux-x64-musl' : 'linux-x64-glibc'
  if (p === 'linux' && a === 'arm64') return isMusl() ? 'linux-arm64-musl' : 'linux-arm64-glibc'
  if (p === 'darwin' && a === 'x64') return 'darwin-x64'
  if (p === 'darwin' && a === 'arm64') return 'darwin-arm64'
  throw new Error(`sign-proxy: unsupported platform ${p}-${a}; rebuild lucky-lillia-sign-proxy on this target and drop the .node into ${here}`)
}

/** 读 sign-proxy 版本号. 版本号塞进 tmpdir 文件名做 .node 热更新缓存 key. */
function pickVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(here, 'sign-proxy.package.json'), 'utf-8'))
    if (typeof pkg.version === 'string' && pkg.version.length > 0) return pkg.version
  } catch {
    // 读不到就 fallback, 热更新失效但不影响加载
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
    getLogger('sign-proxy').warn(`[sign-proxy] hot-update copy failed (${(e as Error).message}); falling back to ${srcPath}`)
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
  /**
   * 登录前软校验 auth_token (打 /api/sign/info, 401/403 不 exit)。base_url 跟 sign 链路同源。
   * 返回 "valid" / "invalid" / "retry:<reason>"。老版 .node 没这 export 时为 undefined。
   */
  validateAuthToken?(args: ValidateAuthTokenArgs): Promise<string>
  signRequest(args: SignRequestArgs): Promise<SignResultJs>
  acquireSignToken(args: AcquireSignTokenArgs): Promise<AcquireSignTokenResult>
  postEnvelope(args: PostEnvelopeArgs): Promise<string>
  /**
   * Linux ESK: 用 SDK 采的设备事实本地组 device_pb + request, 走 bot 自己的 SSO 发, 本地解 token。
   * 不经 manager (acquireSignToken 那条要打 manager 两趟 HTTP)。老 .node 没这个 export 时为 undefined。
   */
  getLinuxEskToken?(args: LinuxEskTokenArgs): Promise<LinuxTokenResult>
  // ---- macOS o3 链 (全部本地组包, 只借 sendPacket 走 bot 自己的 SSO) ----
  // 老 .node 没这几个 export 时为 undefined, 调用前先判一下再报"请重新 build"。
  /** qimei 取号。打 StarTrail, 走**本机**网络出口 (服务端代取会把全站设备注册到同一 IP)。 */
  getMacosQimei?(args: MacosQimeiArgs): Promise<MacosQimeiResult>
  /** 组 device_pb (34 字段设备指纹) hex, 三步 o3 共用同一份。 */
  buildMacosDevicePb?(args: MacosDevicePbArgs): string
  /** 登录前 ESK (SsoEstablishShareKey), 拿引导 token1 + 建通道。 */
  getMacosEskToken?(args: MacosEstablishArgs): Promise<MacosO3Result>
  /** 登录后 A2Establish, 建业务通道; token 非空 = 建成, 用它返的 aesKey/shareId。 */
  getMacosA2EstablishToken?(args: MacosEstablishArgs): Promise<MacosO3Result>
  /** 登录后 SA2 getToken, 复用传入通道拿业务 token。 */
  getMacosSa2Token?(args: MacosSa2Args): Promise<MacosO3Result>
}

export interface LinuxEskTokenArgs {
  /** 选 ProtocolVersion 用 (拿 ESK field4 的 xwid 常量)。 */
  qua: string
}

export interface LinuxTokenResult {
  /** 12B ASCII token; 解不出是空串而不是报错。 */
  token: string
  /** ESK 响应 field 3 的 TTL(秒); 没解析到是 0 —— 调用方别直接拿 0 算过期时间。 */
  ttlSecs: number
}

export interface MacosQimeiArgs {
  seedHex: string
  appKey?: string
}

export interface MacosQimeiResult {
  qimei36: string
  /** macOS schema 下 StarTrail 不返这个, 基本恒空。别依赖。 */
  qimei16: string
}

export interface MacosDevicePbArgs {
  seedHex: string
  qua: string
  q36: string
}

export interface MacosEstablishArgs {
  devicePbHex: string
  /** 毫秒时间戳。A2Establish 跟随后的 SA2 **必须传同一个值**。 */
  tsMs?: number
}

export interface MacosSa2Args {
  devicePbHex: string
  aesKey: string
  shareId: string
  /** ESK 解出的 token1; 传错 server 回 1001。 */
  currentToken?: string
  tsMs?: number
}

export interface MacosO3Result {
  /** 解不出是空串而不是报错 —— establish 被拒时就这样, 调用方据此选通道。 */
  token: string
  ttlSecs: number
  aesKey: string
  shareId: string
}

const triple = pickTriple()
const version = pickVersion()
const srcPath = join(here, `sign-proxy.${triple}.node`)
const loadPath = ensureLoadablePath(srcPath, version, triple)

export interface InitArgs {
  botVersion: string
  /** manager JWT. */
  authToken: string
  /** 16B device GUID hex (32 chars). 跟 wtlogin client.guid 同源. */
  machineGuidHex: string
  /** 当前账号 uin, 可选; 没有就等登录完成 SignProxy 自己绑. */
  uin?: number
  /** 接入点 CDN: "cf" (默认) / "china". 决定 base_url + TLS pin. 不传按 cf. */
  cdn?: string
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

export interface ValidateAuthTokenArgs {
  authToken: string
  /** "cf" | "china"; 省略按 cf。dev build 忽略 (base_url 编译期锁 localhost)。 */
  cdn?: string
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
  /**
   * watch 端设备身份: 32B per-install GUID 的 hex (64 chars). 仅 watch 协议需要 —— 后端据此
   * 派生 device_blob 做设备绑定; **不传的话后端用空 blob = 模拟器身份, 真机服务器会拒**。
   * Linux/macOS 省略即可。
   *
   * 注意: 这是手写 loader, 原生侧 napi `#[napi(object)]` 对未知字段是**静默丢弃**的 ——
   * 声明加了但 .node 没重编的话, 传了也白传且不报错。加字段必须连带重编 + sync-to-bot。
   */
  device32Hex?: string
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

let native: Native
export function getSignProxy() {
  try {
    native ??= requireBin(loadPath) as Native
    return native
  } catch (error) {
    const { message } = error as Error
    // Windows 上 .node 常被杀毒软件误杀/隔离, require 直接报文件缺失或加载失败.
    const hint = process.platform === 'win32'
      ? ` (${loadPath} 可能被杀毒软件删除或隔离, 请检查杀软记录并将其加入白名单)`
      : ''
    throw new Error(`sign-proxy: failed to load ${loadPath}: ${message}${hint}`)
  }
}
