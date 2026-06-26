import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from '@/common/globalVars'
import type { SessionInfo } from './client'

export interface PersistedSession {
  uin: string
  uid: string
  d2: string        // hex
  d2Key: string     // hex
  tgt: string       // hex
  tempPassword: string // hex
  tgtgtKey: string  // hex
  guid: string      // hex
  nick?: string     // 自己的昵称（来自登录响应 TLV 0x11A）
  savedAt: number   // timestamp
}

/**
 * 从 process.argv 里解析 `-q <uin>` 或 `--qq=<uin>`。
 * 用于多账号场景：指定一个 uin 后会读写对应的 qq-session-<uin>.json。
 */
export function getSpecifiedUin(argv: string[] = process.argv): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-q' && i + 1 < argv.length) return argv[i + 1]
    if (a.startsWith('--qq=')) return a.slice('--qq='.length)
  }
  return undefined
}

/**
 * 从 process.argv 里解析 `--sign-host <url>` 或 `--sign-host=<url>`。
 * 优先级高于 `QQ_SIGN_URL` 环境变量, 用于本地起 sign-service (e.g. http://localhost:8080) 调试.
 */
export function getSpecifiedSignHost(argv: string[] = process.argv): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--sign-host' && i + 1 < argv.length) return argv[i + 1]
    if (a.startsWith('--sign-host=')) return a.slice('--sign-host='.length)
  }
  return undefined
}

/** session 文件统一按 uin 命名为 qq-session-<uin>.json。 */
export function getSessionFilePathForUin(uin: string): string {
  return join(DATA_DIR, `qq-session-${uin}.json`)
}

/**
 * 把 session 写入 qq-session-<uin>.json（按 session 自身的 uin）。
 */
export function saveSession(
  session: SessionInfo,
  tgtgtKey: Buffer,
  guid: Buffer,
  tempPassword: Buffer,
  nick: string = '',
): void {
  const data: PersistedSession = {
    uin: session.uin,
    uid: session.uid,
    d2: session.d2.toString('hex'),
    d2Key: session.d2Key.toString('hex'),
    tgt: session.tgt.toString('hex'),
    tempPassword: tempPassword.toString('hex'),
    tgtgtKey: tgtgtKey.toString('hex'),
    guid: guid.toString('hex'),
    nick,
    savedAt: Date.now(),
  }
  const path = getSessionFilePathForUin(session.uin)
  writeFileSync(path, JSON.stringify(data, null, 2))
}

/**
 * 加载 session：
 * - 没传 `-q` → 返回 null，调用方走扫码登录
 * - 传了 `-q <uin>` 且 qq-session-<uin>.json 存在 → 返回该 session
 * - 传了 `-q <uin>` 但文件不存在/解析失败 → 返回 null，调用方走扫码登录
 */
export function loadSession(): PersistedSession | null {
  const specifiedUin = getSpecifiedUin()
  if (!specifiedUin) return null
  const path = getSessionFilePathForUin(specifiedUin)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf-8')
    const data = JSON.parse(raw) as PersistedSession
    if (!data.uin || !data.d2 || !data.d2Key) return null
    return data
  } catch {
    return null
  }
}

export function persistedToSessionInfo(persisted: PersistedSession): SessionInfo {
  return {
    uin: persisted.uin,
    uid: persisted.uid,
    d2: Buffer.from(persisted.d2, 'hex'),
    d2Key: Buffer.from(persisted.d2Key, 'hex'),
    tgt: Buffer.from(persisted.tgt, 'hex'),
    a2: Buffer.from(persisted.tgt, 'hex'),
    a2Key: Buffer.alloc(16),
    sKey: Buffer.alloc(0),
  }
}
