import { getLogger, isDebugEnabled } from '@/common/logger'
import { getActiveProfile } from './profiles'
import { getCdn, getProtocol } from '@/common/utils/environment'
import { loadMachineGuidSync } from './machineGuid'
import { device32FromGuid } from './watch/device32'
import { getMacosDevice } from './macosDevice'
import { getNativeAddon } from '@/native'
import type { RelayPacket, SignLog } from '@/native/sign-types'

const logger = getLogger('sign')

export interface SignResult {
  sign: Buffer
  token: Buffer
  extra: Buffer
}

export interface PreflightLogger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

let inited = false
let initError: Error
// Bound in setupSign along with the relay: to the one client of the process (direct.ts)
let reportRefusal: (detail: string) => void = () => {}

export async function setupSign(opts: {
  botVersion: string
  authToken: string
  machineGuid: Buffer
  uin?: number
  cdn?: string
  sendPacket: (p: RelayPacket) => Promise<Buffer>
  logger?: (log: SignLog) => void
  /** The sign server turned the auth token down (HTTP 403), e.g. it has no QQ account left */
  onRefused?: (detail: string) => void
}): Promise<void> {
  if (opts.machineGuid.length !== 16) {
    throw new Error(`setupSign expected 16B machineGuid, got ${opts.machineGuid.length}B`)
  }
  if (opts.onRefused) reportRefusal = opts.onRefused
  try {
    await getNativeAddon().init(
      {
        botVersion: opts.botVersion,
        authToken: opts.authToken,
        machineGuidHex: opts.machineGuid.toString('hex'),
        uin: opts.uin,
        cdn: opts.cdn,
      },
      opts.sendPacket,
      opts.logger ?? defaultLogger,
    )
    inited = true
  } catch (error) {
    initError = error as Error
    throw error
  }
}

export function setSignMachineGuid(guid: Buffer): void {
  if (guid.length !== 16) {
    logger.warn(`[Sign] setSignMachineGuid expected 16B GUID, got ${guid.length}B -- skip`)
    return
  }
  if (!inited) return
  const { setMachineGuid } = getNativeAddon()
  if (typeof setMachineGuid !== 'function') {
    logger.warn('[Sign] LuckyLillia.NTQQ.node 未导出 setMachineGuid (老版 .node), GUID 切换不会生效.')
    return
  }
  try {
    setMachineGuid(guid.toString('hex'))
  } catch (e) {
    logger.warn(`[Sign] setMachineGuid failed: ${(e as Error).message}`)
  }
}

function defaultLogger(log: SignLog): void {
  const out = log.level === 'error' ? logger.error : logger.warn
  out(`[Sign/${log.level}] ${log.message}`)
}

export async function updateAuthToken(authToken: string): Promise<void> {
  if (inited) await getNativeAddon().setAuthToken(authToken)
}

export async function preflightSign(
  logger: PreflightLogger = console,
): Promise<string | null> {
  if (!inited) return 'sign not initialized'

  let reason: string | null
  try {
    reason = await getNativeAddon().preflight()
  } catch (e) {
    const msg = (e as Error).message
    logger.error(`[Sign Preflight] native call failed: ${msg}`)
    return `native: ${msg}`
  }
  if (!reason) return null
  logger.error(`[Sign Preflight] ${reason}`)
  return reason
}

const SIGN_LOG_BODY_BYTES = 512

export async function requestSign(
  cmd: string,
  src: Buffer,
  seq: number,
  guid?: Buffer,
  qua?: string,
  uin?: number,
  protocolToken12B?: string,
): Promise<SignResult | null> {
  if (!inited) {
    if (initError) {
      const { message } = initError as Error
      logger.error(`[Sign] sign 未初始化, ${message}`)
    } else {
      logger.error('[Sign] sign 未初始化')
    }
    return null
  }

  const guidHex = guid?.toString('hex') ?? ''
  // watch 的 sign 绑设备: device32 从 machine guid 派生, 跟 wtlogin 是同一台设备
  const device32Hex = getActiveProfile().family === 'watch'
    ? device32FromGuid(loadMachineGuidSync()).toString('hex')
    : undefined

  // 调用前打, native 抛错时也留得下现场
  if (isDebugEnabled()) {
    const cut = src.length > SIGN_LOG_BODY_BYTES ? ` (前 ${SIGN_LOG_BODY_BYTES}B)` : ''
    logger.debug(
      `[sign req] ${cmd} seq=${seq} uin=${uin ?? 0} qua=${qua ?? ''} guid=${guidHex}` +
        ` deviceToken=${protocolToken12B ? '"' + protocolToken12B + '"' : '<empty>'}` +
        (device32Hex ? ` device32=${device32Hex}` : '') +
        ` body=${src.length}B${cut} hex=%h`,
      src.subarray(0, SIGN_LOG_BODY_BYTES),
    )
  }

  try {
    const r = await getNativeAddon().signRequest({
      cmd,
      bodyHex: src.toString('hex'),
      seq,
      guidHex,
      qua: qua ?? '',
      uin: uin ?? 0,
      protocolTokenHex: protocolToken12B
        ? Buffer.from(protocolToken12B, 'utf-8').toString('hex')
        : '',
      device32Hex,
    })
    if (isDebugEnabled()) {
      logger.debug(
        `[sign resp] ${cmd} seq=${seq} sign=${r.sign.length}B hex=%h token=${r.token.length}B hex=%h extra=${r.extra.length}B hex=%h`,
        r.sign,
        r.token,
        r.extra,
      )
    }
    return { sign: r.sign, token: r.token, extra: r.extra }
  } catch (e) {
    formatNativeSignError(cmd, qua, e as Error)
    return null
  }
}

/** native 没解析到 TTL 时返 0, 直接用就是立刻过期, 每 30s 打一次 ESK */
const DEFAULT_TOKEN_TTL_SECS = 24 * 60 * 60

/** macOS ESK result: token1 plus the channel keys that A2+SA2 reuse after login. */
export interface MacosEskState {
  /** 登录前的 deviceToken */
  token: string
  ttlSecs: number
  /** Epoch ms; 过期要重跑 ESK */
  expiresAt: number
}

export async function acquireSignToken(uin: number, qua: string, macosEsk?: MacosEskState | null): Promise<{ token: string; ttlSecs: number }> {
  if (!inited) throw new Error('sign not initialized')
  switch (getProtocol()) {
    case 'macos':
      // Given a live ESK only A2+SA2 run; without one (the client's ESK failed) all three steps run.
      return macosEsk ? acquireMacosA2Token(qua, macosEsk) : acquireMacosSignToken(qua)
    case 'linux':
      return acquireLinuxSignToken(uin, qua)
    // 别并进 linux 分支: 本地 ESK 真会往 QQ 发包, 会从别的端的连接上发出 Linux 形状的 ESK。watch 不会走到这里
    default:
      return acquireViaManager(uin, qua)
  }
}

/** 经 manager 组包 / 解包的老路 (manager /api/sign/token/{build-request,decrypt-response})。 */
async function acquireViaManager(uin: number, qua: string): Promise<{ token: string; ttlSecs: number }> {
  const r = await getNativeAddon().acquireSignToken({ uin, qua })
  return { token: r.token.toString('utf-8'), ttlSecs: DEFAULT_TOKEN_TTL_SECS }
}

let warnedStaleLinuxNode = false

/**
 * ESK -> SA 在原生模块本地组包解包, 省掉经 manager 的两趟 HTTP。device_pb 必须用 SDK 初始化时采的那份:
 * 服务端会交叉校验。老 .node 没有 getLinuxSAToken 时退回经 manager
 */
async function acquireLinuxSignToken(uin: number, qua: string): Promise<{ token: string; ttlSecs: number }> {
  const proxy = getNativeAddon()
  if (typeof proxy.getLinuxSAToken !== 'function') {
    if (!warnedStaleLinuxNode) {
      warnedStaleLinuxNode = true
      logger.warn('[SignToken] LuckyLillia.NTQQ.node 过旧 (缺 getLinuxSAToken), 暂退回经 manager 取 token; 请重新 build 并 sync-to-bot')
    }
    return acquireViaManager(uin, qua)
  }
  const r = await proxy.getLinuxSAToken({ qua })
  // 采样 ESK 内层的候选时间戳, 攒样本判断哪个是 token 到期 (不参与过期计算)
  const nowS = Math.floor(Date.now() / 1000)
  const f3 = r.eskInnerF3 ?? 0
  const f4Ts = r.eskInnerTokenTs ?? 0
  logger.info(
    `[esk-inner-sample] now=${nowS} outerTtl=${r.ttlSecs} f2=${r.eskInnerF2 ?? 0} ` +
      `f3=${f3} (f3-now=${f3 ? Math.round(f3 - nowS) : 0}) ` +
      `f4Ts=${f4Ts} (f4Ts-now=${f4Ts ? Math.round(f4Ts - nowS) : 0})`,
  )
  return { token: r.token, ttlSecs: r.ttlSecs || DEFAULT_TOKEN_TTL_SECS }
}

let warnedNoSsoReport = false

export async function startLinuxSsoReport(args: { qua: string; guidHex: string; uin: string }): Promise<void> {
  if (!inited) return
  const proxy = getNativeAddon()
  if (typeof proxy.startSsoReportLinux !== 'function') {
    if (!warnedNoSsoReport) {
      warnedNoSsoReport = true
      logger.warn('[SsoReport] LuckyLillia.NTQQ.node 过旧 (缺 startSsoReportLinux), 跳过 o3 遥测; 请重新 build 并 sync-to-bot')
    }
    return
  }
  try {
    await proxy.startSsoReportLinux({ qua: args.qua, guidHex: args.guidHex, uin: args.uin })
    logger.info('[SsoReport] Linux o3 遥测循环已启动')
  } catch (e) {
    logger.warn(`[SsoReport] 启动失败: ${(e as Error).message}`)
  }
}

export function stopLinuxSsoReport(): void {
  if (!inited) return
  const { stopSsoReport } = getNativeAddon()
  if (typeof stopSsoReport !== 'function') return
  try {
    stopSsoReport()
  } catch (e) {
    logger.warn(`[SsoReport] 停止失败: ${(e as Error).message}`)
  }
}

/** 老 .node 没有 buildXwidBody 时返 null */
export function buildLinuxXwidBody(qua: string, reportId?: string): Buffer | null {
  if (!inited) return null
  const proxy = getNativeAddon()
  if (typeof proxy.buildXwidBody !== 'function') return null
  try {
    return proxy.buildXwidBody(qua, reportId ?? null)
  } catch (e) {
    logger.warn(`[xwid-burst] buildXwidBody 失败: ${(e as Error).message}`)
    return null
  }
}

let warnedNoMacosSsoReport = false

export async function startMacosSsoReport(args: { guidHex: string; qimei36: string; uin: string; appDir?: string }): Promise<void> {
  if (!inited) return
  const proxy = getNativeAddon()
  if (typeof proxy.startSsoReportMacos !== 'function') {
    if (!warnedNoMacosSsoReport) {
      warnedNoMacosSsoReport = true
      logger.warn('[SsoReport] LuckyLillia.NTQQ.node 过旧 (缺 startSsoReportMacos), 跳过 macOS o3 遥测; 重新 build + sync-to-bot')
    }
    return
  }
  try {
    await proxy.startSsoReportMacos({ guidHex: args.guidHex, qimei36: args.qimei36, uin: args.uin, appDir: args.appDir })
  } catch (e) {
    logger.warn(`[SsoReport] macOS 启动失败: ${(e as Error).message}`)
  }
}

export interface MacosEasyLoginTickets {
  d2Hex: string
  d2KeyHex: string
  tgtHex: string
  a1106Hex: string
}

/** 失败或老 .node 返 null */
export async function macosEasyLogin(args: {
  uin: string; guidHex: string; a1106Hex: string; seedHex: string; qua: string; q36?: string
}): Promise<MacosEasyLoginTickets | null> {
  if (!inited) return null
  const proxy = getNativeAddon()
  if (typeof proxy.macosEasyLogin !== 'function') {
    logger.warn('[EasyLogin] LuckyLillia.NTQQ.node 过旧 (缺 macosEasyLogin), 回退直接恢复; 重新 build + sync-to-bot')
    return null
  }
  try {
    const r = await proxy.macosEasyLogin(args)
    if (!r.success) return null
    return { d2Hex: r.d2Hex, d2KeyHex: r.d2KeyHex, tgtHex: r.tgtHex, a1106Hex: r.a1106Hex }
  } catch (e) {
    logger.warn(`[EasyLogin] 失败: ${(e as Error).message}`)
    return null
  }
}

/** 老 .node 没有 signXwidBurst 时返 null */
export async function signLinuxXwidBurst(args: {
  cmd: string; bodyHex: string; seq: number; guidHex: string; qua: string; uin: number; protocolTokenHex: string
}, count: number): Promise<SignResult[] | null> {
  if (!inited || count <= 0) return null
  const proxy = getNativeAddon()
  if (typeof proxy.signXwidBurst !== 'function') return null
  try {
    const arr = await proxy.signXwidBurst(args, count)
    return arr.map((r) => ({ sign: r.sign, token: r.token, extra: r.extra }))
  } catch (e) {
    logger.warn(`[xwid-burst] signXwidBurst 失败: ${(e as Error).message}`)
    return null
  }
}

/**
 * 三步全跑的兜底路径, 正常是 acquireMacosEskOnly (登录前) + acquireMacosA2Token (登录后)。A2Establish 的 token
 * 为空就继续用 ESK 的通道; SA2 必须跟 A2Establish 传同一个 tsMs。拿不到 token 返空串而不是抛: sign 不依赖它
 */
async function acquireMacosSignToken(qua: string): Promise<{ token: string; ttlSecs: number }> {
  ensureMacosO3Exports()
  const proxy = getNativeAddon()
  const { devicePbHex } = await getMacosDevice(qua)
  const esk = await proxy.getMacosEskToken!({ devicePbHex, tsMs: Date.now() })
  logger.debug(`[SignToken][macos] ESK token=${esk.token ? esk.token.length + 'B' : '空'} ttl=${esk.ttlSecs}s`)
  const login = await proxy.getMacosLoginToken!({ devicePbHex, tsMs: Date.now() })
  const token = login.token || esk.token
  const ttlSecs = login.ttlSecs || esk.ttlSecs || DEFAULT_TOKEN_TTL_SECS
  if (!token) {
    logger.warn('[SignToken][macos] ESK + 业务 token 都没解出, 本轮用空 deviceToken')
  }
  return { token, ttlSecs }
}

function ensureMacosO3Exports(): void {
  const proxy = getNativeAddon()
  if (typeof proxy.getMacosEskToken !== 'function' || typeof proxy.getMacosLoginToken !== 'function') {
    throw new Error('LuckyLillia.NTQQ.node 过旧 (缺 macOS o3 token 方法), 请重新 build 并 sync-to-bot')
  }
}

/** Real clients send ESK once per connection, before trans_emp; it is re-run on a new connection or once the TTL lapses. */
export async function acquireMacosEskOnly(qua: string): Promise<MacosEskState> {
  if (!inited) throw new Error('sign not initialized')
  ensureMacosO3Exports()
  const { devicePbHex } = await getMacosDevice(qua)
  const esk = await getNativeAddon().getMacosEskToken!({ devicePbHex, tsMs: Date.now() })
  const ttlSecs = esk.ttlSecs || DEFAULT_TOKEN_TTL_SECS
  logger.debug(`[SignToken][macos] ESK token=${esk.token ? esk.token.length + 'B' : 'empty'} ttl=${ttlSecs}s`)
  return { token: esk.token, ttlSecs, expiresAt: Date.now() + ttlSecs * 1000 }
}

/** A2Establish 建成就切到新通道, 否则沿用 ESK 通道 */
async function acquireMacosA2Token(qua: string, esk: MacosEskState): Promise<{ token: string; ttlSecs: number }> {
  ensureMacosO3Exports()
  const { devicePbHex } = await getMacosDevice(qua)
  const login = await getNativeAddon().getMacosLoginToken!({ devicePbHex, tsMs: Date.now() })
  const token = login.token || esk.token
  const ttlSecs = login.ttlSecs || esk.ttlSecs || DEFAULT_TOKEN_TTL_SECS
  if (!token) {
    logger.warn('[SignToken][macos] A2+SA2 都没解出 token, 本轮用空 deviceToken')
  }
  return { token, ttlSecs }
}

/**
 * 跟 sign 链路同一个 base_url。Error = 无法判定 (网络 / 5xx), watcher 会定时重试; native 侧 401/403 返
 * 'invalid' 而不 exit。不依赖 sign init, 登录前也能用
 */
export async function validateAuthToken(token: string): Promise<'valid' | 'invalid' | number | Error> {
  const t = token.trim()
  if (!t) return 'invalid'
  const proxy = getNativeAddon()
  if (typeof proxy.validateAuthToken !== 'function') {
    // 老 .node: 当网络错处理, 别误判 invalid
    return new Error('LuckyLillia.NTQQ.node 过旧 (缺 validateAuthToken), 请重新 build 并 sync-to-bot')
  }
  try {
    const r = await proxy.validateAuthToken({ authToken: t, cdn: getCdn() })
    if (r === 'valid') return 'valid'
    if (r === 'invalid') return 'invalid'
    return new Error(r.startsWith('retry:') ? r.slice('retry:'.length) : r)
  } catch (e) {
    return e as Error
  }
}

function formatNativeSignError(cmd: string, qua: string | undefined, e: Error): void {
  const msg = e.message
  const m = /^http (\d+):\s*(.*)$/.exec(msg)
  if (m) {
    const code = Number(m[1])
    const detail = m[2]
    switch (code) {
      case 401:
        logger.error(`[Sign] Unauthorized (cmd=${cmd}): ${detail}. auth_token 无效或已撤销, 到 manager 重新生成`)
        return
      case 403:
        logger.error(`[Sign] Forbidden (cmd=${cmd}): ${detail}`)
        reportRefusal(detail || 'auth_token 无权限 (HTTP 403)')
        return
      case 502:
        logger.error(`[Sign] Bad Gateway (cmd=${cmd}): ${detail}. 上游 sign-service 进程不可用`)
        return
      case 503:
        logger.error(`[Sign] Service Unavailable (cmd=${cmd}): ${detail}. 没有匹配的 sign 后端 (qua=${qua ?? '<empty>'})`)
        return
      default:
        logger.error(`[Sign] HTTP ${code} (cmd=${cmd}): ${detail}`)
        return
    }
  }
  if (msg.startsWith('network:')) {
    logger.error(`[Sign] Network error (cmd=${cmd}): ${msg.slice('network: '.length)}`)
    return
  }
  if (msg === 'not initialized; call init() first') {
    logger.error(`[Sign] ${msg} (cmd=${cmd})`)
    return
  }
  if (msg.startsWith('malformed response:')) {
    logger.error(`[Sign] Failed to parse response (cmd=${cmd}): ${msg.slice('malformed response: '.length)}`)
    return
  }
  if (msg.startsWith('server returned non-zero code:')) {
    const code = msg.slice('server returned non-zero code: '.length)
    logger.error(`[Sign] Server returned non-zero code ${code} (cmd=${cmd})`)
    return
  }
  logger.error(`[Sign] ${msg} (cmd=${cmd})`)
}
