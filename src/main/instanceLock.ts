import net from 'node:net'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import path from 'node:path'
import { DATA_DIR, STATE_DIR } from '@/common/globalVars'

export class InstanceLockedError extends Error {}

interface Holder {
  pid: number
  host: string
  since: number
}

// sun_path is 104 bytes on macOS, 108 on Linux
const MAX_SOCKET_PATH = 100

/**
 * Keeps a second process off an instance (config-storage §4). An OS endpoint rather than a pid file, since it
 * goes away however the process ends: node as pid 1 in docker dies on SIGKILL without running exit handlers.
 * Windows: a named pipe. Elsewhere a unix socket in data/state/, which also catches a second container on the
 * same volume, or in the temp dir when that path is too long or the filesystem refuses sockets.
 */
export async function lockInstance(name: string): Promise<() => void> {
  const dir = path.join(STATE_DIR, 'instances')
  mkdirSync(dir, { recursive: true })
  const holderFile = path.join(dir, `${name}.json`)
  for (const endpoint of endpointsFor(name)) {
    const server = await listen(endpoint)
    if (server === 'held') throw new InstanceLockedError(lockedMessage(name, holderFile))
    if (server === 'unsupported') continue
    const holder: Holder = { pid: process.pid, host: hostname(), since: Date.now() }
    try {
      writeFileSync(holderFile, JSON.stringify(holder))
    } catch {
      // Only feeds the message a second process prints
    }
    let released = false
    const release = () => {
      if (released) return
      released = true
      process.off('exit', release)
      server.close()
      if (process.platform !== 'win32') removeFile(endpoint)
      removeFile(holderFile)
    }
    process.on('exit', release)
    return release
  }
  throw new Error(`没法为实例 ${name} 建立实例锁`)
}

function endpointsFor(name: string): string[] {
  const id = createHash('sha1')
    .update(process.platform === 'win32' ? DATA_DIR.toLowerCase() : DATA_DIR)
    .digest('hex')
    .slice(0, 12)
  if (process.platform === 'win32') return [`\\\\.\\pipe\\llbot-${id}-${name}`]
  const local = path.join(STATE_DIR, 'instances', `${name}.sock`)
  const fallback = path.join(tmpdir(), `llbot-${id}-${name}.sock`)
  return Buffer.byteLength(local) <= MAX_SOCKET_PATH ? [local, fallback] : [fallback]
}

async function listen(endpoint: string, retried = false): Promise<net.Server | 'held' | 'unsupported'> {
  const server = net.createServer(socket => socket.end())
  const error = await new Promise<NodeJS.ErrnoException | undefined>(resolve => {
    server.once('error', resolve)
    server.listen(endpoint, () => resolve(undefined))
  })
  if (!error) {
    server.unref()
    return server
  }
  if (error.code !== 'EADDRINUSE') return 'unsupported'
  if (process.platform === 'win32') return 'held'
  // A socket file outlives a killed process: it is only held if something still answers on it
  if (await answers(endpoint)) return 'held'
  if (retried) return 'held'
  removeFile(endpoint)
  return listen(endpoint, true)
}

function answers(endpoint: string): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect(endpoint)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

function lockedMessage(name: string, holderFile: string): string {
  let who = ''
  try {
    const holder = JSON.parse(readFileSync(holderFile, 'utf8')) as Holder
    who = holder.host === hostname() ? `（pid ${holder.pid}）` : `（${holder.host} 上的 pid ${holder.pid}）`
  } catch {
    // The message works without it
  }
  return `实例 ${name} 已经在运行${who}：一个实例同一时间只能由一个进程使用。` +
    `要同时再运行一个，请用 --instance <名字> 指定另一个实例`
}

function removeFile(file: string) {
  try {
    unlinkSync(file)
  } catch {
    // Already gone
  }
}
