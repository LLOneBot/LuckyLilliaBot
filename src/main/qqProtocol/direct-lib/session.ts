import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { execSync } from 'node:child_process'
import { DATA_DIR } from '@/common/globalVars'
import { isDockerEnvironment } from '@/common/utils/environment'
import { loadMachineGuidSync } from './machineGuid'
import type { SessionInfo } from './client'

export interface PersistedSession {
  uin: string
  uid: string
  guid: string      // hex (设备 guid, 明文; 注意: 不能用它当加密密钥)
  nick?: string     // 自己的昵称（来自登录响应 TLV 0x11A）
  savedAt: number   // timestamp
  // 敏感登录凭证加密进 enc; 持久化只写 enc, 不写明文
  enc?: string      // base64(iv[12] + tag[16] + AES-256-GCM ciphertext)
  // 下面几个不落盘, 仅 loadSession 解密 enc 后在内存里填充, 供 persistedToSessionInfo 使用
  d2?: string       // hex
  d2Key?: string    // hex
  tgt?: string      // hex
  tempPassword?: string // hex
  tgtgtKey?: string // hex
}

// ---- session 敏感字段加密 (机器绑定) ----
// 密钥来自 OS machine id (不随 session 文件走), 所以 session 拷到别的机器无法解密。
// 注意: 不能用 session.guid (它明文存在文件里, 等于密钥泄露)。
// 容器例外: /etc/machine-id 随容器重建而变 (session 解不开, 被迫重新扫码),
// 改用 data 卷里的 machine_guid.bin 派生 -- 随 volume 持久化, 重建/迁移卷后 session 仍可解。
// 代价 (有意取舍): 它与 session 文件里明文的 guid 同值, 容器场景防线实为整个 data 卷的访问边界。
let _machineKey: Buffer | null = null
function getMachineKey(): Buffer {
  if (_machineKey) return _machineKey
  let machineId = ''
  try {
    if (isDockerEnvironment()) {
      machineId = loadMachineGuidSync().toString('hex')
    } else if (process.platform === 'win32') {
      const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { encoding: 'utf-8', windowsHide: true })
      const m = out.match(/MachineGuid\s+REG_SZ\s+([^\s]+)/)
      machineId = m ? m[1].trim() : ''
    } else if (process.platform === 'linux') {
      machineId = readFileSync('/etc/machine-id', 'utf-8').trim()
    } else if (process.platform === 'darwin') {
      const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice', { encoding: 'utf-8' })
      const m = out.match(/IOPlatformUUID"\s*=\s*"([^"]+)"/)
      machineId = m ? m[1].trim() : ''
    }
  } catch {
    // 取不到 machine id 时降级到主机名 (弱, 但仍非明文)
  }
  if (!machineId) machineId = process.env.COMPUTERNAME || process.env.HOSTNAME || 'luckylillia-fallback'
  _machineKey = createHash('sha256').update('luckylillia-session-v1|' + machineId).digest() // 32 bytes
  return _machineKey
}

type SensitiveFields = { d2: string; d2Key: string; tgt: string; tempPassword: string; tgtgtKey: string }

function encryptSensitive(fields: SensitiveFields): string {
  const key = getMachineKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(JSON.stringify(fields), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

function decryptSensitive(b64: string): SensitiveFields {
  const key = getMachineKey()
  const data = Buffer.from(b64, 'base64')
  const iv = data.subarray(0, 12)
  const tag = data.subarray(12, 28)
  const enc = data.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  return JSON.parse(plain) as SensitiveFields
}

/**
 * 从 process.argv 里解析指定 uin. 支持 4 种写法:
 *   -q <uin> / -q=<uin> / --qq <uin> / --qq=<uin>
 * 用于多账号场景: 指定一个 uin 后会读写对应的 qq-session-<uin>.json。
 */
export function getSpecifiedUin(argv: string[] = process.argv): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if ((a === '-q' || a === '--qq') && i + 1 < argv.length) return argv[i + 1]
    if (a.startsWith('-q=')) return a.slice('-q='.length)
    if (a.startsWith('--qq=')) return a.slice('--qq='.length)
  }
  return undefined
}

/** session 文件统一按 uin 命名为 qq-session-<uin>.json。 */
export function getSessionFilePathForUin(uin: string): string {
  return join(DATA_DIR, `qq-session-${uin}.json`)
}

/**
 * 把 session 写入 qq-session-<uin>.json（按 session 自身的 uin）。
 * 敏感登录凭证加密进 enc, uin/uid/guid/nick 保持明文 (供外部展示快速登录列表)。
 */
export function saveSession(
  session: SessionInfo,
  tgtgtKey: Buffer,
  guid: Buffer,
  tempPassword: Buffer,
  nick: string = '',
): void {
  const sensitive: SensitiveFields = {
    d2: session.d2.toString('hex'),
    d2Key: session.d2Key.toString('hex'),
    tgt: session.tgt.toString('hex'),
    tempPassword: tempPassword.toString('hex'),
    tgtgtKey: tgtgtKey.toString('hex'),
  }
  const data: PersistedSession = {
    uin: session.uin,
    uid: session.uid,
    guid: guid.toString('hex'),
    nick,
    savedAt: Date.now(),
    enc: encryptSensitive(sensitive),
  }
  const path = getSessionFilePathForUin(session.uin)
  writeFileSync(path, JSON.stringify(data, null, 2))
}

/**
 * 加载 session:
 * - 传了 uin (WebUI 快速登录) 或 argv 里有 -q <uin> → 尝试对应 qq-session-<uin>.json
 * - 两者都没有 → 返回 null, 调用方走扫码登录
 * - 文件不存在 / 解析失败 / 解密失败 (换机器) → 返回 null
 */
export function loadSession(uinArg?: string): PersistedSession | null {
  const specifiedUin = uinArg || getSpecifiedUin()
  if (!specifiedUin) return null
  const path = getSessionFilePathForUin(specifiedUin)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf-8')
    const data = JSON.parse(raw) as PersistedSession
    // 新格式: enc 加密 -> 解密还原敏感字段; 解密失败 (换机器/损坏) 当作无效 session
    // 只认加密格式: 无 enc (旧明文/损坏) 或解密失败 (换机器) 一律当无效, 调用方走扫码重新登录
    if (!data.enc) return null
    try {
      const s = decryptSensitive(data.enc)
      data.d2 = s.d2
      data.d2Key = s.d2Key
      data.tgt = s.tgt
      data.tempPassword = s.tempPassword
      data.tgtgtKey = s.tgtgtKey
    } catch {
      return null
    }
    if (!data.uin || !data.d2 || !data.d2Key) return null
    return data
  } catch {
    return null
  }
}

/**
 * 扫 data/qq-session-*.json, 返回可用快速登录账号的明文元数据 (uin/uid/nick).
 * 只列**有 enc** 的 session (旧明文/无凭证的一律跳过, 快速登录用不上); 不做实际解密,
 * 换机后不能 quick-login 但会展示 -- 用户选到后 registerOnline 阶段会失败并 fallback 扫码.
 */
export function listAvailableSessions(): Array<{ uin: string; uid: string; nick: string; savedAt: number }> {
  let entries: string[]
  try {
    entries = readdirSync(DATA_DIR)
  } catch {
    return []
  }
  const out: Array<{ uin: string; uid: string; nick: string; savedAt: number }> = []
  for (const name of entries) {
    const m = /^qq-session-(\d+)\.json$/.exec(name)
    if (!m) continue
    try {
      const raw = readFileSync(join(DATA_DIR, name), 'utf-8')
      const data = JSON.parse(raw) as PersistedSession
      if (!data.enc || !data.uin) continue
      out.push({
        uin: data.uin,
        uid: data.uid || '',
        nick: data.nick || '',
        savedAt: data.savedAt || 0,
      })
    } catch {
      // skip malformed
    }
  }
  // 按 savedAt 倒序 (最近登过的在前)
  return out.sort((a, b) => b.savedAt - a.savedAt)
}

export function persistedToSessionInfo(persisted: PersistedSession): SessionInfo {
  return {
    uin: persisted.uin,
    uid: persisted.uid,
    d2: Buffer.from(persisted.d2 ?? '', 'hex'),
    d2Key: Buffer.from(persisted.d2Key ?? '', 'hex'),
    tgt: Buffer.from(persisted.tgt ?? '', 'hex'),
    a2: Buffer.from(persisted.tgt ?? '', 'hex'),
    a2Key: Buffer.alloc(16),
    sKey: Buffer.alloc(0),
  }
}
