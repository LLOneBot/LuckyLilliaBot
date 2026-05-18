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

const SESSION_FILE = join(DATA_DIR, 'qq-session.json')

export function saveSession(
  session: SessionInfo,
  tgtgtKey: Buffer,
  guid: Buffer,
  tempPassword: Buffer,
  nick: string = '',
  path: string = SESSION_FILE,
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
  writeFileSync(path, JSON.stringify(data, null, 2))
}

export function loadSession(path: string = SESSION_FILE): PersistedSession | null {
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
