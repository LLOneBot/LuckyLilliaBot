import {
  init as nativeInit,
  preflight as nativePreflight,
  signRequest as nativeSignRequest,
  acquireSignToken as nativeAcquireSignToken,
  setAuthToken as nativeSetAuthToken,
  setMachineGuid as nativeSetMachineGuid,
  type RelayPacket,
  type SignLog,
} from './sign-proxy'
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

export async function setupSign(opts: {
  botVersion: string
  authToken: string
  /** 16B device GUID. 跟 wtlogin client.guid 同源. */
  machineGuid: Buffer
  /** 当前账号 uin, 可选. */
  uin?: number
  sendPacket: (p: RelayPacket) => Promise<Buffer>
  logger?: (log: SignLog) => void
}): Promise<void> {
  if (opts.machineGuid.length !== 16) {
    throw new Error(`setupSign expected 16B machineGuid, got ${opts.machineGuid.length}B`)
  }
  // native init 是 async: 传了 uin 时它内部 await /api/bu bind 完成才 resolve, bind 失败 reject.
  // 注意: native init 幂等, 二次调 no-op, uin 无法通过 re-init 更新.
  await nativeInit(
    {
      botVersion: opts.botVersion,
      authToken: opts.authToken,
      machineGuidHex: opts.machineGuid.toString('hex'),
      uin: opts.uin,
    },
    opts.sendPacket,
    opts.logger ?? defaultLogger,
  )
  inited = true
}

/** 运行中切换 16B device GUID. 老版 .node 没这个 export 时 warn 并 noop. */
export function setSignMachineGuid(guid: Buffer): void {
  if (guid.length !== 16) {
    console.warn(`[Sign] setSignMachineGuid expected 16B GUID, got ${guid.length}B -- skip`)
    return
  }
  if (!inited) return
  if (typeof nativeSetMachineGuid !== 'function') {
    console.warn('[Sign] sign-proxy 未导出 setMachineGuid (老版 .node), GUID 切换不会生效.')
    return
  }
  try {
    nativeSetMachineGuid(guid.toString('hex'))
  } catch (e) {
    console.warn(`[Sign] setMachineGuid failed: ${(e as Error).message}`)
  }
}

function defaultLogger(log: SignLog): void {
  const out = log.level === 'error' ? console.error : console.warn
  out(`[Sign/${log.level}] ${log.message}`)
}

export async function updateAuthToken(authToken: string): Promise<void> {
  if (inited) await nativeSetAuthToken(authToken)
}

export async function preflightSign(
  logger: PreflightLogger = console,
): Promise<string | null> {
  if (!inited) return 'sign not initialized'

  let reason: string | null
  try {
    reason = await nativePreflight()
  } catch (e) {
    const msg = (e as Error).message
    logger.error(`[Sign Preflight] native call failed: ${msg}`)
    return `native: ${msg}`
  }
  if (!reason) return null
  // 401/403 不会到这里 -- SDK 内部 logger error + process.exit. 剩下的是 5xx/network/etc.
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
    console.error('[Sign] sign 未初始化 (auth_token 未配?); set data/auth_token.txt or AUTH_TOKEN env.')
    return null
  }

  try {
    const r = await nativeSignRequest({
      cmd,
      bodyHex: src.toString('hex'),
      seq,
      guidHex: guid?.toString('hex') ?? '',
      qua: qua ?? '',
      uin: uin ?? 0,
      protocolTokenHex: protocolToken12B
        ? Buffer.from(protocolToken12B, 'utf-8').toString('hex')
        : '',
    })
    if (process.env.DEBUG_SIGN) {
      console.log(`[Sign] ${cmd} seq=${seq}: sign=${r.sign.length}B token=${r.token.length}B extra=${r.extra.length}B`)
    }
    return { sign: r.sign, token: r.token, extra: r.extra }
  } catch (e) {
    formatNativeSignError(cmd, qua, e as Error)
    return null
  }
}

export async function acquireSignToken(uin: number, qua: string): Promise<{ token: string; ttlSecs: number }> {
  if (!inited) throw new Error('sign not initialized')
  const r = await nativeAcquireSignToken({ uin, qua })
  return { token: r.token.toString('utf-8'), ttlSecs: 24 * 60 * 60 }
}

function formatNativeSignError(cmd: string, qua: string | undefined, e: Error): void {
  const msg = e.message
  const m = /^http (\d+):\s*(.*)$/.exec(msg)
  if (m) {
    const code = Number(m[1])
    const detail = m[2]
    switch (code) {
      case 401:
        console.error(`[Sign] Unauthorized (cmd=${cmd}): ${detail}. auth_token 无效或已撤销, 到 manager 重新生成`)
        return
      case 403:
        // 理论到不了这里: native SDK 对 /api/sign/compute 的 403 会先 process.exit.
        // 真正拦"可用 QQ 数量上限"的是 completeDirectLogin 里的 getAllowedUins 预检. 这里仅兜底.
        console.error(`[Sign] Forbidden (cmd=${cmd}): ${detail}`)
        authTokenStatus.loginError = detail || 'auth_token 无权限 (HTTP 403)'
        return
      case 502:
        console.error(`[Sign] Bad Gateway (cmd=${cmd}): ${detail}. 上游 sign-service 进程不可用`)
        return
      case 503:
        console.error(`[Sign] Service Unavailable (cmd=${cmd}): ${detail}. 没有匹配的 sign 后端 (qua=${qua ?? '<empty>'})`)
        return
      default:
        console.error(`[Sign] HTTP ${code} (cmd=${cmd}): ${detail}`)
        return
    }
  }
  if (msg.startsWith('network:')) {
    console.error(`[Sign] Network error (cmd=${cmd}): ${msg.slice('network: '.length)}`)
    return
  }
  if (msg === 'not initialized; call init() first') {
    console.error(`[Sign] ${msg} (cmd=${cmd})`)
    return
  }
  if (msg.startsWith('malformed response:')) {
    console.error(`[Sign] Failed to parse response (cmd=${cmd}): ${msg.slice('malformed response: '.length)}`)
    return
  }
  if (msg.startsWith('server returned non-zero code:')) {
    const code = msg.slice('server returned non-zero code: '.length)
    console.error(`[Sign] Server returned non-zero code ${code} (cmd=${cmd})`)
    return
  }
  console.error(`[Sign] ${msg} (cmd=${cmd})`)
}
