// 持久化 16B device GUID. data/machine_guid.bin 是 device identity 的 single source
// of truth -- DirectProtocolClient.guid 跟 setupSign 都从这里读, 保证 wtlogin/SSO
// 通路和 sign 通路对外是同一台设备. 文件不存在时随机生成 + 落盘 (跨重启稳定靠这个).

import { randomBytes } from 'node:crypto'
import { promises as fs, readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import * as path from 'node:path'
import { getLogger } from '@/common/logger'

const logger = getLogger('machine-guid')

const DEFAULT_FILE = path.resolve('data/machine_guid.bin')

const cache = new Map<string, Buffer>()

/**
 * 加载或生成 16B device GUID. 第一次没文件就 random + 写盘, 后续读盘.
 * 同一进程内多次调用复用 cache; 多个并发调用是 race-safe (单进程不会并发写).
 */
export async function loadMachineGuid(filePath: string = DEFAULT_FILE): Promise<Buffer> {
  const resolved = path.resolve(filePath)
  const cached = cache.get(resolved)
  if (cached) return cached
  try {
    const buf = await fs.readFile(resolved)
    if (buf.length === 16) {
      cache.set(resolved, buf)
      return buf
    }
    const backup = `${resolved}.bad-${Date.now()}`
    await fs.rename(resolved, backup).catch(() => {})
    logger.warn(`[MachineGuid] ${resolved} length=${buf.length} (expect 16), backed up to ${backup}, regenerating`)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw e
    }
  }
  const guid = randomBytes(16)
  await fs.mkdir(path.dirname(resolved), { recursive: true }).catch(() => {})
  await fs.writeFile(resolved, guid)
  logger.info(`[MachineGuid] generated new 16B GUID -> ${resolved}`)
  cache.set(resolved, guid)
  return guid
}

/** 同步版 loadMachineGuid; 跟 async 版共用 cache. */
export function loadMachineGuidSync(filePath: string = DEFAULT_FILE): Buffer {
  const resolved = path.resolve(filePath)
  const cached = cache.get(resolved)
  if (cached) return cached
  if (existsSync(resolved)) {
    const buf = readFileSync(resolved)
    if (buf.length === 16) {
      cache.set(resolved, buf)
      return buf
    }
    const backup = `${resolved}.bad-${Date.now()}`
    try { renameSync(resolved, backup) } catch {}
    logger.warn(`[MachineGuid] ${resolved} length=${buf.length} (expect 16), backed up to ${backup}, regenerating`)
  }
  const guid = randomBytes(16)
  try { mkdirSync(path.dirname(resolved), { recursive: true }) } catch {}
  writeFileSync(resolved, guid)
  logger.info(`[MachineGuid] generated new 16B GUID -> ${resolved}`)
  cache.set(resolved, guid)
  return guid
}

/** 覆盖 machine_guid.bin -- session 恢复时把 persisted.guid 同步过来. */
export function overwriteMachineGuid(guid: Buffer, filePath: string = DEFAULT_FILE): void {
  if (guid.length !== 16) throw new Error(`overwriteMachineGuid expected 16B, got ${guid.length}`)
  const resolved = path.resolve(filePath)
  try { mkdirSync(path.dirname(resolved), { recursive: true }) } catch {}
  writeFileSync(resolved, guid)
  cache.set(resolved, guid)
}
