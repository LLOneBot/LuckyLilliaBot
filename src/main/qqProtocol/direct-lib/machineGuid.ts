// data/machine_guid.bin: wtlogin / SSO 和 sign 都从这里读 guid, 对外才是同一台设备

import { randomBytes } from 'node:crypto'
import { promises as fs, readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs'
import * as path from 'node:path'
import { getLogger } from '@/common/logger'

const logger = getLogger('machine-guid')

const DEFAULT_FILE = path.resolve('data/machine_guid.bin')

const cache = new Map<string, Buffer>()

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

/** session 恢复时同步 persisted.guid */
export function overwriteMachineGuid(guid: Buffer, filePath: string = DEFAULT_FILE): void {
  if (guid.length !== 16) throw new Error(`overwriteMachineGuid expected 16B, got ${guid.length}`)
  const resolved = path.resolve(filePath)
  try { mkdirSync(path.dirname(resolved), { recursive: true }) } catch {}
  writeFileSync(resolved, guid)
  cache.set(resolved, guid)
}

/** 等于换一台设备。目前没有调用方: 异地顶号只删 session, 设备指纹不变 */
export function deleteMachineGuid(filePath: string = DEFAULT_FILE): void {
  const resolved = path.resolve(filePath)
  try { unlinkSync(resolved) } catch {}
  cache.delete(resolved)
}
