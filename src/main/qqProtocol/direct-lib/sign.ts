import { getLogger } from '@/common/logger'
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

export async function setupSign(opts: {
  botVersion: string
  authToken: string
  machineGuid: Buffer
  uin?: number
  sendPacket: (p: RelayPacket) => Promise<Buffer>
  logger?: (log: SignLog) => void
}): Promise<void> {
  if (opts.machineGuid.length !== 16) {
    throw new Error(`setupSign expected 16B machineGuid, got ${opts.machineGuid.length}B`)
  }
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

export function setSignMachineGuid(guid: Buffer): void {
  if (guid.length !== 16) {
    logger.warn(`[Sign] setSignMachineGuid expected 16B GUID, got ${guid.length}B -- skip`)
    return
  }
  if (!inited) return
  if (typeof nativeSetMachineGuid !== 'function') {
    logger.warn('[Sign] sign-proxy 未导出 setMachineGuid (老版 .node), GUID 切换不会生效.')
    return
  }
  try {
    nativeSetMachineGuid(guid.toString('hex'))
  } catch (e) {
    logger.warn(`[Sign] setMachineGuid failed: ${(e as Error).message}`)
  }
}

function defaultLogger(log: SignLog): void {
  const out = log.level === 'error' ? logger.error : logger.warn
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
    logger.error('[Sign] sign 未初始化 (auth_token 未配?); set data/auth_token.txt or AUTH_TOKEN env.')
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
    logger.debug(`${cmd} seq=${seq}: sign=${r.sign.length}B token=${r.token.length}B extra=${r.extra.length}B`)
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
