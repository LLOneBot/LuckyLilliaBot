import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { getLogger } from '@/common/logger'
import { isDevMode } from '@/common/utils/environment'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const requireBin = createRequire(import.meta.url)

// --dev: dev build from SignProxy `npm run build:dev-bot` (base_url baked to localhost:8090, no TLS pinning).
// Names differ end to end, so a missing dev build fails to load instead of falling back to prod.
const isDev = isDevMode()
const baseName = isDev ? 'sign-proxy-dev' : 'sign-proxy'

// glibc 的 node report 带 glibcVersionRuntime, musl 上没有; 兜底看 alpine 标志文件和 musl 动态加载器
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

/** 版本号是 tmpdir 里 .node 副本的缓存 key */
function pickVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(here, `${baseName}.package.json`), 'utf-8'))
    if (typeof pkg.version === 'string' && pkg.version.length > 0) return pkg.version
  } catch {
    // 读不到就 fallback, 热更新失效但不影响加载
  }
  return '0.0.0'
}

/**
 * 拷到 tmpdir/lucky-lillia-sign-proxy/<baseName>.<triple>.<version>.node 再 require: 被 require 的 .node 会被 OS
 * 锁住 (Windows 尤甚), Bot 运行时没法覆盖升级。拷贝失败就直接加载原路径
 */
function ensureLoadablePath(srcPath: string, version: string, triple: string): string {
  const cacheRoot = join(tmpdir(), 'lucky-lillia-sign-proxy')
  const cachedName = `${baseName}.${triple}.${version}.node`
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
  setMachineGuid?(guidHex: string): void
  preflight(): Promise<string | null>
  /** 401/403 不 exit。返回 "valid" / "invalid" / "retry:<reason>" */
  validateAuthToken?(args: ValidateAuthTokenArgs): Promise<string>
  signRequest(args: SignRequestArgs): Promise<SignResultJs>
  acquireSignToken(args: AcquireSignTokenArgs): Promise<AcquireSignTokenResult>
  postEnvelope(args: PostEnvelopeArgs): Promise<string>
  /** ESK 拿 token1, 再 SA 换 token2 返回; 包走 bot 自己的 SSO, 不经 manager */
  getLinuxSAToken?(args: LinuxEskTokenArgs): Promise<LinuxTokenResult>
  startSsoReportLinux?(args: StartSsoReportLinuxArgs): Promise<void>
  stopSsoReport?(): void
  /** body 恒定, 每帧只有 sign 不同。reportId 默认是跨装机常量 "0df00071646" */
  buildXwidBody?(qua: string, reportId?: string | null): Buffer
  /** 一次调用签 count 条, 省掉逐条 signRequest 的 NAPI 往返 */
  signXwidBurst?(args: SignRequestArgs, count: number): Promise<SignResultJs[]>
  // ---- macOS o3: 本地组包, 只借 sendPacket 走 bot 的 SSO ----
  /** StarTrail 取号必须走本机出口: 服务端代取会把所有设备注册在同一个 IP */
  getMacosQimei?(args: MacosQimeiArgs): Promise<MacosQimeiResult>
  /** 34 字段的设备指纹, o3 各步共用 */
  buildMacosDevicePb?(args: MacosDevicePbArgs): string
  /** 登录前 ESK 拿 token1; 通道密钥只留在 .node 里 */
  getMacosEskToken?(args: MacosEstablishArgs): Promise<MacosTokenResult>
  /** 登录后 A2Establish + A2Access, 复用缓存的 ESK 通道 */
  getMacosLoginToken?(args: MacosEstablishArgs): Promise<MacosTokenResult>
  /** 一次性爆发 (sec_init + channel_report + env_detect + login), 不用 stop */
  startSsoReportMacos?(args: StartSsoReportMacosArgs): Promise<void>
  /** SsoKeyExchange + SsoNTLoginEasyLogin, 用存档的 0x106 刷新 d2 / d2key / tgt / 0x106。失败不抛, success=false */
  macosEasyLogin?(args: MacosEasyLoginArgs): Promise<MacosEasyLoginResult>
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
  /** 诊断用, 不参与过期计算: ESK 内层 field2 */
  eskInnerF2?: number
  /** 诊断用: ESK 内层 field3, 是相对 TTL 还是绝对时间戳待定 */
  eskInnerF3?: number
  /** 诊断用: ESK 内层 field4 里跟 token 同级的时间戳 */
  eskInnerTokenTs?: number
}

export interface StartSsoReportLinuxArgs {
  qua: string
  guidHex: string
  uin: string
  reportId?: string
  loginXwidBurst?: number
  verifyFileIntervalMs?: number
  uiReportMetric?: string
}

export interface MacosQimeiArgs {
  seedHex: string
  appKey?: string
  /** Entry QUA, drives the reported app_version; without it the crate default won't match the device_pb QUA. */
  qua?: string
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
  /** 毫秒时间戳; 不传 = .node 用当前时间。 */
  tsMs?: number
}

export interface MacosTokenResult {
  /** 12B token; 解不出是空串而不是报错 */
  token: string
  ttlSecs: number
}

export interface StartSsoReportMacosArgs {
  /** 32-hex, 与登录 / device_pb 同源 */
  guidHex: string
  qimei36: string
  uin: string
  /** QQ.app 的 Contents/Resources/app 绝对路径; 缺省 /Applications/QQ.app/Contents/Resources/app。 */
  appDir?: string
}

export interface MacosEasyLoginArgs {
  uin: string
  /** 32-hex 设备 guid (前 16B 进 KEX / EasyLogin body)。 */
  guidHex: string
  /** 存档 TLV 0x106 凭证 hex (= session.tempPassword, 登录响应 0x119 内层 0x106)。 */
  a1106Hex: string
  /** 稳定设备种子 hex (= machine guid; 派生 serial/osver, 与 device_pb 同源)。 */
  seedHex: string
  qua: string
  /** 不影响 serial */
  q36?: string
}

export interface MacosEasyLoginResult {
  /** false 时其余字段为空 */
  success: boolean
  d2Hex: string
  /** 注意 napi 命名: 数字后首字母大写, 故 d2key_hex -> d2KeyHex (跟 SessionInfo.d2Key 一致)。 */
  d2KeyHex: string
  tgtHex: string
  /** 刷新后的 TLV 0x106 凭证 hex (存回 session 供下次 EasyLogin)。 */
  a1106Hex: string
}

const triple = pickTriple()
const version = pickVersion()
const srcPath = join(here, `${baseName}.${triple}.node`)
const loadPath = ensureLoadablePath(srcPath, version, triple)

export interface InitArgs {
  botVersion: string
  /** manager JWT. */
  authToken: string
  /** 16B device GUID hex (32 chars). 跟 wtlogin client.guid 同源. */
  machineGuidHex: string
  /** 没有的话 SignProxy 等登录后自己绑 */
  uin?: number
  /** "cf" (默认) / "china" */
  cdn?: string
}

export interface RelayPacket {
  cmd: string
  body: Buffer
  /** 本命令 SecInfo sf2 的签名 token, 只有 SA 带 (token1); 缺省用 session 的 token */
  signToken?: string
}

/** level: "warn" / "error"。401/403 时 SDK 报 error 后会 exit */
export interface SignLog {
  level: string
  message: string
}

export interface ValidateAuthTokenArgs {
  authToken: string
  /** "cf" (默认) / "china"; dev build 忽略 */
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
   * 仅 watch: 32B per-install GUID 的 hex。不传后端就用空 blob, 即模拟器身份, 会被真机服务器拒。
   * napi 对未知字段静默丢弃: 加字段必须重编 .node 并 sync-to-bot, 否则传了也白传
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
    let hint = ''
    if (isDev) {
      hint = ' (--dev: run `npm run build:dev-bot` in LuckyLillia.SignProxy to sync the dev build)'
    } else if (process.platform === 'win32') {
      // Windows 上 .node 常被杀毒软件误杀/隔离, require 直接报文件缺失或加载失败.
      hint = ` (${loadPath} 可能被杀毒软件删除或隔离, 请检查杀软记录并将其加入白名单)`
    }
    throw new Error(`sign-proxy: failed to load ${loadPath}: ${message}${hint}`)
  }
}
