import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { Hono } from 'hono'

const run = promisify(execFile)

/** Entries past this many are left out of a listing, which says so */
const LIMIT = 2000

export interface FsEntry {
  name: string
  path: string
  dir: boolean
}

export interface FsListing {
  /** The directory listed: the one asked for, a file's directory, or the nearest one that exists */
  path: string
  parent: string | null
  entries: FsEntry[]
  truncated: boolean
  /** Drives on Windows, `/` elsewhere; only when asked for */
  roots?: { name: string; path: string }[]
  home: string
}

/**
 * The drive letters Windows has, without touching the drives: probing them from here would tie up libuv's few
 * file system threads for as long as a disconnected network drive takes to time out.
 */
async function roots(): Promise<NonNullable<FsListing['roots']>> {
  if (process.platform !== 'win32') return [{ name: '/', path: '/' }]
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[System.IO.Directory]::GetLogicalDrives()'],
      { windowsHide: true, timeout: 10_000 })
    const drives = stdout.split(/\r?\n/).map(line => line.trim()).filter(line => /^[A-Za-z]:\\$/.test(line))
    if (drives.length) return drives.map(drive => ({ name: drive.slice(0, 2), path: drive }))
  } catch {}
  const root = path.parse(process.cwd()).root
  return [{ name: root.slice(0, 2), path: root }]
}

async function directoryOf(requested: string): Promise<string> {
  // `C:` alone is the current directory on drive C, not its root
  let current = path.resolve(process.platform === 'win32' && /^[A-Za-z]:$/.test(requested) ? `${requested}\\` : requested)
  for (;;) {
    const info = await stat(current).catch(() => undefined)
    if (info?.isDirectory()) return current
    const parent = path.dirname(current)
    if (parent === current) return current
    current = parent
  }
}

/** Names only, never contents, of the machine the bot runs on: the WebUI's file picker, opened from anywhere */
export async function listDirectory(requested: string | undefined, withRoots = false): Promise<FsListing> {
  const dir = await directoryOf(requested?.trim() || os.homedir())
  const dirents = await readdir(dir, { withFileTypes: true })
  const entries = (await Promise.all(dirents.map(async (dirent): Promise<FsEntry | undefined> => {
    const full = path.join(dir, dirent.name)
    if (!dirent.isSymbolicLink()) return { name: dirent.name, path: full, dir: dirent.isDirectory() }
    // A link (or a Windows junction) counts as what it points to; one that leads nowhere readable is left out
    const target = await stat(full).catch(() => undefined)
    return target && { name: dirent.name, path: full, dir: target.isDirectory() }
  }))).filter(entry => entry !== undefined)
  entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  const parent = path.dirname(dir)
  return {
    path: dir,
    parent: parent === dir ? null : parent,
    entries: entries.slice(0, LIMIT),
    truncated: entries.length > LIMIT,
    ...withRoots && { roots: await roots() },
    home: os.homedir(),
  }
}

export function createFileRoutes(): Hono {
  const router = new Hono()

  // ?roots=1 adds the drives, which the picker asks for once as it opens
  router.get('/fs/list', async (c) => {
    try {
      return c.json({ success: true, data: await listDirectory(c.req.query('path'), c.req.query('roots') === '1') })
    } catch (e) {
      return c.json({ success: false, message: `打不开这个目录：${(e as Error).message}` }, 400)
    }
  })

  return router
}
