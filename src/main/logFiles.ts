import { readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'

/** Log files older than this are deleted at startup and on every rotation. */
export const LOG_RETENTION_DAYS = 14

const LOG_FILE = /^llbot-.*\.log$/

/**
 * The pid keeps two processes sharing one data directory (or one restarting within the same second) from
 * appending to the same file.
 */
export function logFilename(now = new Date(), pid = process.pid): string {
  return `llbot-${now.toLocaleString('zh-CN')}-${pid}.log`.replace(/\//g, '-').replace(/:/g, '-')
}

/** Only `llbot-*.log`. Age alone decides, so a file another process is writing is never old. */
export async function pruneOldLogs(dir: string, now = Date.now(), retentionDays = LOG_RETENTION_DAYS): Promise<string[]> {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000
  const removed: string[] = []
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (!LOG_FILE.test(name)) continue
    const file = path.join(dir, name)
    const info = await stat(file).catch(() => undefined)
    if (!info?.isFile() || info.mtimeMs >= cutoff) continue
    await unlink(file).then(() => removed.push(name), () => {})
  }
  return removed
}
