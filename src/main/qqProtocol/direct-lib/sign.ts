import { getLogger } from '@/common/logger'
import { getActiveProfile } from './profiles'
import { getCdn, getProtocol } from '@/common/utils/environment'
import { loadMachineGuidSync } from './machineGuid'
import { device32FromGuid } from './watch/device32'
import { getMacosDevice } from './macosDevice'
import {
  getSignProxy,
  type RelayPacket,
  type SignLog,
} from './sign-proxy'

const logger = getLogger('sign')
import { authTokenStatus } from '@/common/globalVars'

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

export async function setupSign(opts: {
  botVersion: string
  authToken: string
  machineGuid: Buffer
  uin?: number
  cdn?: string
  sendPacket: (p: RelayPacket) => Promise<Buffer>
  logger?: (log: SignLog) => void
}): Promise<void> {
  if (opts.machineGuid.length !== 16) {
    throw new Error(`setupSign expected 16B machineGuid, got ${opts.machineGuid.length}B`)
  }
  try {
    await getSignProxy().init(
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
  const { setMachineGuid } = getSignProxy()
  if (typeof setMachineGuid !== 'function') {
    logger.warn('[Sign] sign-proxy 未导出 setMachineGuid (老版 .node), GUID 切换不会生效.')
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
  if (inited) await getSignProxy().setAuthToken(authToken)
}

export async function preflightSign(
  logger: PreflightLogger = console,
): Promise<string | null> {
  if (!inited) return 'sign not initialized'

  let reason: string | null
  try {
    reason = await getSignProxy().preflight()
  } catch (e) {
    const msg = (e as Error).message
    logger.error(`[Sign Preflight] native call failed: ${msg}`)
    return `native: ${msg}`
  }
  if (!reason) return null
  logger.error(`[Sign Preflight] ${reason}`)
  return reason
}

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

  try {
    const r = await getSignProxy().signRequest({
      cmd,
      bodyHex: src.toString('hex'),
      seq,
      guidHex: guid?.toString('hex') ?? '',
      qua: qua ?? '',
      uin: uin ?? 0,
      protocolTokenHex: protocolToken12B
        ? Buffer.from(protocolToken12B, 'utf-8').toString('hex')
        : '',
      // watch sign 是设备绑定的: 后端拿 device32 派生 device_blob。不传 = 空 blob =
      // 模拟器身份, 真机会拒。从持久化 machine guid 派生, 跟 wtlogin 用的是同一台设备。
      device32Hex: getActiveProfile().family === 'watch'
        ? device32FromGuid(loadMachineGuidSync()).toString('hex')
        : undefined,
    })
    logger.debug(`${cmd} seq=${seq}: sign=${r.sign.length}B token=${r.token.length}B extra=${r.extra.length}B`)
    return { sign: r.sign, token: r.token, extra: r.extra }
  } catch (e) {
    formatNativeSignError(cmd, qua, e as Error)
    return null
  }
}

/** native 没解析到 TTL (返 0) 时的兜底。0 不能直接用: expiresAt = now + 0 等于立刻过期,
 *  ensureSignTokenFresh 只剩 30s 最小重试间隔兜着, 每个 bot 每 30 秒就打一次 ESK。 */
const DEFAULT_TOKEN_TTL_SECS = 24 * 60 * 60

/** macOS ESK result: token1 plus the channel keys that A2+SA2 reuse after login. */
export interface MacosEskState {
  token: string
  aesKey: string
  shareId: string
  devicePbHex: string
  ttlSecs: number
  /** Epoch ms. Past this the channel is stale and ESK has to run again. */
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
    // windows / watch 维持原样。**别并进 linux 分支**: 本地 ESK 是真往 QQ 发包, 并进去 watch 就会
    // 从手表连接上发一个 Linux 形状的 ESK; 现在经 manager 只是路由到 watch 后端 404, 无害。
    default:
      return acquireViaManager(uin, qua)
  }
}

/** 经 manager 组包 / 解包的老路 (manager /api/sign/token/{build-request,decrypt-response})。 */
async function acquireViaManager(uin: number, qua: string): Promise<{ token: string; ttlSecs: number }> {
  const r = await getSignProxy().acquireSignToken({ uin, qua })
  return { token: r.token.toString('utf-8'), ttlSecs: DEFAULT_TOKEN_TTL_SECS }
}

let warnedStaleLinuxNode = false

/**
 * Linux ESK 在 SignProxy 本地做: 组包 / 解包都不经 manager, 省掉每次取 token 的两趟 HTTP。
 * device_pb 用的是 SDK 初始化时采的那份设备事实 (服务端会交叉校验自洽性, 不能另采)。
 *
 * 老 .node 没 getLinuxEskToken 时退回经 manager 的老路 —— manager 那两个端点为老版本保留着,
 * 退回去照样能用, 不至于因为 .node 没同步就拿不到 token。
 */
async function acquireLinuxSignToken(uin: number, qua: string): Promise<{ token: string; ttlSecs: number }> {
  const proxy = getSignProxy()
  if (typeof proxy.getLinuxEskToken !== 'function') {
    if (!warnedStaleLinuxNode) {
      warnedStaleLinuxNode = true
      logger.warn('[SignToken] sign-proxy .node 过旧 (缺 getLinuxEskToken), 暂退回经 manager 取 token; 请重新 build 并 sync-to-bot')
    }
    return acquireViaManager(uin, qua)
  }
  const r = await proxy.getLinuxEskToken({ qua })
  return { token: r.token, ttlSecs: r.ttlSecs || DEFAULT_TOKEN_TTL_SECS }
}

/**
 * macOS deviceToken: ESK -> A2Establish -> SA2, 三步共用同一份 device_pb。
 *
 * - ESK 先建一条通道并给出引导 token1。
 * - A2Establish 试着建业务通道; **token 非空才算建成**, 空就继续用 ESK 那套 aesKey/shareId
 *   (napi 层就是这么约定的, 空 = 回退)。
 * - SA2 复用选中的通道拿业务 token。它跟 A2Establish **必须传同一个 tsMs**, 否则 server 对不上。
 *
 * 任何一步拿不到 token 就返空串 —— 上层 ensureSignTokenFresh 拿空 token 也能继续 (sign 本身
 * 不依赖它, 只是 deviceToken 字段为空), 不要在这里抛异常把发包链打断。
 *
 * 这是三步全跑的兜底路径; 正常流程走两步: acquireMacosEskOnly (登录前) + acquireMacosA2Token (登录后)。
 */
async function acquireMacosSignToken(qua: string): Promise<{ token: string; ttlSecs: number }> {
  const proxy = getSignProxy()
  if (
    typeof proxy.getMacosEskToken !== 'function' ||
    typeof proxy.getMacosA2EstablishToken !== 'function' ||
    typeof proxy.getMacosSa2Token !== 'function'
  ) {
    throw new Error('sign-proxy .node 过旧 (缺 macOS o3 token 方法), 请重新 build 并 sync-to-bot')
  }

  const { devicePbHex } = await getMacosDevice(qua)
  const tsMs = Date.now()

  const esk = await proxy.getMacosEskToken({ devicePbHex, tsMs })
  logger.debug(`[SignToken][macos] ESK token=${esk.token ? esk.token.length + 'B' : '空'} ttl=${esk.ttlSecs}s`)

  const a2 = await proxy.getMacosA2EstablishToken({ devicePbHex, tsMs })
  const channel = a2.token ? a2 : esk
  logger.debug(`[SignToken][macos] A2Establish ${a2.token ? '建成, 用新通道' : '空, 回退 ESK 通道'}`)

  const sa2 = await proxy.getMacosSa2Token({
    devicePbHex,
    aesKey: channel.aesKey,
    shareId: channel.shareId,
    currentToken: esk.token,
    tsMs,
  })

  // SA2 拿到业务 token 就用它; 拿不到退回引导 token1 (总比空好)。
  const token = sa2.token || channel.token || esk.token
  const ttlSecs = sa2.ttlSecs || channel.ttlSecs || esk.ttlSecs || DEFAULT_TOKEN_TTL_SECS
  if (!token) {
    logger.warn('[SignToken][macos] 三步都没解出 token, 本轮用空 deviceToken')
  }
  return { token, ttlSecs }
}

function ensureMacosO3Exports(): void {
  const proxy = getSignProxy()
  if (
    typeof proxy.getMacosEskToken !== 'function' ||
    typeof proxy.getMacosA2EstablishToken !== 'function' ||
    typeof proxy.getMacosSa2Token !== 'function'
  ) {
    throw new Error('sign-proxy .node 过旧 (缺 macOS o3 token 方法), 请重新 build 并 sync-to-bot')
  }
}

/**
 * macOS ESK (SsoEstablishShareKey): token1 plus channel keys. Real clients send it once per
 * connection, before trans_emp (PoC main.rs 1322-1362); the client re-runs it on a new
 * connection or once the TTL lapses. The result feeds the A2+SA2 step of acquireSignToken.
 */
export async function acquireMacosEskOnly(qua: string): Promise<MacosEskState> {
  if (!inited) throw new Error('sign not initialized')
  ensureMacosO3Exports()
  const { devicePbHex } = await getMacosDevice(qua)
  const esk = await getSignProxy().getMacosEskToken!({ devicePbHex, tsMs: Date.now() })
  const ttlSecs = esk.ttlSecs || DEFAULT_TOKEN_TTL_SECS
  logger.debug(`[SignToken][macos] ESK token=${esk.token ? esk.token.length + 'B' : 'empty'} ttl=${ttlSecs}s`)
  return {
    token: esk.token,
    aesKey: esk.aesKey,
    shareId: esk.shareId,
    devicePbHex,
    ttlSecs,
    expiresAt: Date.now() + ttlSecs * 1000,
  }
}

/**
 * macOS 登录后 A2+SA2: 用 ESK 阶段保存的通道密钥跑 SsoSecureA2Establish + SsoSecureA2Access,
 * 拿登录态业务 token。A2Establish 建成则切新通道, 否则回退 ESK 通道 (PoC line 1482-1497)。
 */
async function acquireMacosA2Token(qua: string, esk: MacosEskState): Promise<{ token: string; ttlSecs: number }> {
  ensureMacosO3Exports()
  const proxy = getSignProxy()
  const tsMs = Date.now()

  const a2 = await proxy.getMacosA2EstablishToken!({ devicePbHex: esk.devicePbHex, tsMs })
  const channel = a2.token ? a2 : { aesKey: esk.aesKey, shareId: esk.shareId, token: esk.token, ttlSecs: esk.ttlSecs }
  logger.debug(`[SignToken][macos] A2Establish ${a2.token ? '建成, 用 A2 通道' : '空, 回退 ESK 通道'}`)

  const sa2 = await proxy.getMacosSa2Token!({
    devicePbHex: esk.devicePbHex,
    aesKey: channel.aesKey,
    shareId: channel.shareId,
    currentToken: esk.token,
    tsMs,
  })

  const token = sa2.token || channel.token || esk.token
  const ttlSecs = sa2.ttlSecs || channel.ttlSecs || esk.ttlSecs || DEFAULT_TOKEN_TTL_SECS
  if (!token) {
    logger.warn('[SignToken][macos] A2+SA2 都没解出 token, 本轮用空 deviceToken')
  }
  return { token, ttlSecs }
}

/**
 * 校验 auth token 是否有效 (登录前预检)。走 SignProxy 的 validateAuthToken (native), 跟 sign
 * 链路**同一个 base_url** (--features dev / cdn 一处决定) —— 校验和签名永远指向同一个 manager,
 * 不再像旧的独立 fetch(AUTH_VALIDATE_API) 那样可能一个连生产一个连本地而割裂。
 *
 * 返回 'valid' / 'invalid' / Error。Error = 无法判定 (网络 / 5xx), authTokenWatcher 当网络错
 * 定时重试, 不误判 invalid。native 侧 401/403 返 'invalid' 而**不 exit**, 无效 token 只"停下等
 * 重录", 不崩进程。不依赖 sign init (SignProxy 那侧临时建 client), 登录前也能用。
 */
export async function validateAuthToken(token: string): Promise<'valid' | 'invalid' | number | Error> {
  const t = token.trim()
  if (!t) return 'invalid'
  const proxy = getSignProxy()
  if (typeof proxy.validateAuthToken !== 'function') {
    // 老 .node 缺这 export: 别崩也别误判 invalid, 当网络错让 watcher 重试 (提示重新 build+sync)
    return new Error('sign-proxy .node 过旧 (缺 validateAuthToken), 请重新 build 并 sync-to-bot')
  }
  try {
    const r = await proxy.validateAuthToken({ authToken: t, cdn: getCdn() })
    if (r === 'valid') return 'valid'
    if (r === 'invalid') return 'invalid'
    // "retry:<reason>": 网络 / 5xx, 无法判定 -> 交 watcher 定时重试
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
        authTokenStatus.loginError = detail || 'auth_token 无权限 (HTTP 403)'
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
