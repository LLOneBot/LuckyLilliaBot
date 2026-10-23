import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { logFilename, pruneOldLogs } from '@/main/logFiles'

const DAY = 24 * 60 * 60 * 1000

describe('log files', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'llbot-logs-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('puts the pid in the name so two processes started in the same second do not share a file', () => {
    const now = new Date(2026, 9, 23, 13, 28, 45)
    const a = logFilename(now, 100)
    const b = logFilename(now, 200)
    expect(a).not.toBe(b)
    expect(a).toMatch(/^llbot-.*-100\.log$/)
    expect(a).not.toMatch(/[/:]/)
  })

  it('deletes only our own log files older than the retention period', async () => {
    const now = Date.now()
    const file = (name: string, ageDays: number) => {
      const target = path.join(dir, name)
      writeFileSync(target, 'x')
      const time = new Date(now - ageDays * DAY)
      utimesSync(target, time, time)
      return target
    }
    const old = file('llbot-2026-1-1 00-00-00-1.log', 30)
    const recent = file('llbot-2026-10-20 00-00-00-2.log', 3)
    const access = file('webui_access.log', 30)
    const other = file('notes.txt', 30)

    expect(await pruneOldLogs(dir, now, 14)).toEqual(['llbot-2026-1-1 00-00-00-1.log'])
    expect(existsSync(old)).toBe(false)
    expect(existsSync(recent)).toBe(true)
    expect(existsSync(access)).toBe(true)
    expect(existsSync(other)).toBe(true)
  })

  it('does nothing for a missing directory', async () => {
    expect(await pruneOldLogs(path.join(dir, 'missing'))).toEqual([])
  })
})
