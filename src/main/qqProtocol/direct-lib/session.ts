import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { execSync } from 'node:child_process'
import { DATA_DIR } from '@/common/globalVars'
import { isDockerEnvironment, getSpecifiedUin, getProtocol, type ProtocolId } from '@/common/utils/environment'
import { loadMachineGuidSync } from './machineGuid'
import type { SessionInfo } from './client'

export { getSpecifiedUin }

export interface PersistedSession {
  uin: string
  uid: string
  guid: string      // hex, 明文存储, 不能当加密密钥
  nick?: string
  savedAt: number
  // 凭证只以加密形式落盘
  enc?: string      // base64(iv[12] + tag[16] + AES-256-GCM ciphertext)
  // 以下不落盘, loadSession 解密 enc 后填充
  d2?: string       // hex
  d2Key?: string    // hex
  tgt?: string      // hex
  tempPassword?: string // hex
  tgtgtKey?: string // hex
}

// 凭证密钥取自 OS machine id (不随 session 文件走), 不能用明文存着的 session.guid。容器的 /etc/machine-id
// 随重建而变, 改用 data 卷里的 machine_guid.bin: 代价是它与 guid 同值, 防线实际是整个 data 卷的访问权限
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
  _machineKey = createHash('sha256').update('luckylillia-session-v1|' + machineId).digest()
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

/** 凭证不跨协议通用, 所以按协议分文件; linux 不带后缀是为了兼容老文件 */
export function getSessionFilePathForUin(uin: string, protocol: ProtocolId = getProtocol()): string {
  const suffix = protocol === 'linux' ? '' : `-${protocol}`
  return join(DATA_DIR, `qq-session-${uin}${suffix}.json`)
}

/** uin / uid / guid / nick 保持明文, 快速登录列表要展示 */
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

/** 没指定 uin (参数或 -q)、文件不存在、解不开 (换了机器) 都返回 null, 调用方走扫码 */
export function loadSession(uinArg?: string): PersistedSession | null {
  const specifiedUin = uinArg || getSpecifiedUin()
  if (!specifiedUin) return null
  const path = getSessionFilePathForUin(specifiedUin)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf-8')
    const data = JSON.parse(raw) as PersistedSession
    // 只认加密格式, 旧的明文 session 也当无效
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

/** 只列有 enc 的 session, 不试解密: 换了机器的也会列出来, 选了再失败退回扫码 */
export function listAvailableSessions(): Array<{ uin: string; uid: string; nick: string; savedAt: number; protocol: ProtocolId }> {
  let entries: string[]
  try {
    entries = readdirSync(DATA_DIR)
  } catch {
    return []
  }
  // 只能快速登录当前协议的账号
  const active = getProtocol()
  const out: Array<{ uin: string; uid: string; nick: string; savedAt: number; protocol: ProtocolId }> = []
  for (const name of entries) {
    // 无后缀 = linux; 带后缀 = 对应协议
    const m = /^qq-session-(\d+)(?:-(linux|windows|macos|watch))?\.json$/.exec(name)
    if (!m) continue
    const fileProtocol = (m[2] as ProtocolId) || 'linux'
    if (fileProtocol !== active) continue
    try {
      const raw = readFileSync(join(DATA_DIR, name), 'utf-8')
      const data = JSON.parse(raw) as PersistedSession
      if (!data.enc || !data.uin) continue
      out.push({
        uin: data.uin,
        uid: data.uid || '',
        nick: data.nick || '',
        savedAt: data.savedAt || 0,
        protocol: fileProtocol,
      })
    } catch {
      // skip malformed
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt)
}

export function deleteSession(uin: string): void {
  try { unlinkSync(getSessionFilePathForUin(uin)) } catch {}
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
