import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import path from 'node:path'
import JSON5 from 'json5'

export interface JsonFileOptions<T> {
  /** Produce the value used when the file is missing or unreadable (and nothing good was read before). */
  defaultValue: () => T
  /** Validate / shape the parsed JSON into T. Throw to treat the file as broken. Identity by default. */
  normalize?: (raw: unknown) => T
  /** Cross-process lock file for update(). Defaults to `${file}.lock`. */
  lockFile?: string
  /** How long update() waits for the lock before giving up. */
  lockTimeoutMs?: number
}

export interface JsonReadResult<T> {
  data: T
  /** Set when the on-disk file could not be parsed; data is then the last good value (or the default). */
  error?: string
}

interface LockRecord {
  pid: number
  host: string
  ts: number
}

const HOST = hostname()

/**
 * One JSON file, read-tolerant and crash-safe.
 *
 * - read: JSON5 (comments / trailing commas tolerated). A broken file is NOT renamed or overwritten;
 *   the last good value (or the default) is returned together with an error string, and the next read
 *   retries the same file. This is deliberately different from the old PluginStore, which moved broken
 *   files aside -- that silently discarded a user's hand edit.
 * - write: pretty JSON (no comments) to `<file>.<pid>.<rand>.tmp`, then rename; on Windows the rename
 *   fails while another process holds the target open, so fall back to a direct overwrite. Writes from
 *   one process are serialized through an internal promise chain.
 * - update(mutator): re-read under a cross-process lock, apply the mutation, write atomically. For files
 *   that two processes on the same `data/` may touch at once (e.g. the global plugins file).
 *
 * `wasSelfWrite(raw)` lets a watcher ignore the change event caused by this instance's own write,
 * replacing the old `skipNextWatch` flag (which loses writes that land back-to-back).
 */
export class JsonFile<T> {
  private writing: Promise<void> = Promise.resolve()
  private lastGood: T | undefined
  private lastWrittenHash = ''
  private readonly lockFile: string
  private readonly lockTimeoutMs: number

  constructor(readonly file: string, private readonly options: JsonFileOptions<T>) {
    this.lockFile = options.lockFile ?? `${file}.lock`
    this.lockTimeoutMs = options.lockTimeoutMs ?? 10_000
  }

  private shape(raw: unknown): T {
    return this.options.normalize ? this.options.normalize(raw) : (raw as T)
  }

  async read(): Promise<JsonReadResult<T>> {
    if (!existsSync(this.file)) {
      const data = this.lastGood ?? this.options.defaultValue()
      return { data }
    }
    let raw: string
    try {
      raw = await readFile(this.file, 'utf8')
    } catch (e) {
      return { data: this.lastGood ?? this.options.defaultValue(), error: (e as Error).message }
    }
    return this.parse(raw)
  }

  private parse(raw: string): JsonReadResult<T> {
    try {
      const data = this.shape(JSON5.parse(raw))
      this.lastGood = data
      return { data }
    } catch (e) {
      // Keep the last good value in memory and leave the broken file in place for the user to fix.
      return { data: this.lastGood ?? this.options.defaultValue(), error: (e as Error).message }
    }
  }

  /** Synchronous twin of read(), for callers whose own API is synchronous (e.g. ConfigService.get()). */
  readSync(): JsonReadResult<T> {
    if (!existsSync(this.file)) return { data: this.lastGood ?? this.options.defaultValue() }
    let raw: string
    try {
      raw = readFileSync(this.file, 'utf8')
    } catch (e) {
      return { data: this.lastGood ?? this.options.defaultValue(), error: (e as Error).message }
    }
    return this.parse(raw)
  }

  /** Synchronous twin of write(). It skips the in-process queue, so do not interleave it with write(). */
  writeSync(data: T): void {
    const content = JSON.stringify(data, null, 2) + '\n'
    this.lastGood = data
    mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    writeFileSync(tmp, content, 'utf8')
    try {
      renameSync(tmp, this.file)
    } catch {
      // Windows refuses the rename while another process holds the target open.
      writeFileSync(this.file, content, 'utf8')
      try {
        unlinkSync(tmp)
      } catch {
        // the temp file is already gone
      }
    }
    this.lastWrittenHash = hash(content)
  }

  /** True when `raw` matches the exact bytes this instance last wrote (so a watcher can skip it). */
  wasSelfWrite(raw: string): boolean {
    return !!this.lastWrittenHash && hash(raw) === this.lastWrittenHash
  }

  /** The file's current text, or undefined when it cannot be read. */
  rawSync(): string | undefined {
    try {
      return readFileSync(this.file, 'utf8')
    } catch {
      return undefined
    }
  }

  /** True when what is on disk right now is exactly what this instance last wrote. */
  isSelfWriteOnDisk(): boolean {
    if (!this.lastWrittenHash) return false
    try {
      return hash(readFileSync(this.file, 'utf8')) === this.lastWrittenHash
    } catch {
      return false
    }
  }

  write(data: T): Promise<void> {
    const content = JSON.stringify(data, null, 2) + '\n'
    this.lastGood = data
    this.writing = this.writing.catch(() => {}).then(() => this.writeAtomic(content))
    return this.writing
  }

  private async writeAtomic(content: string) {
    await mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(tmp, content, 'utf8')
    try {
      await rename(tmp, this.file)
    } catch {
      // Windows refuses the rename while another process holds the target open.
      await writeFile(this.file, content, 'utf8')
      await unlink(tmp).catch(() => {})
    }
    this.lastWrittenHash = hash(content)
  }

  /**
   * Re-read under a cross-process lock, apply `mutator`, write the result atomically, return it.
   * The mutation must be replayable: a second process may have changed the file since the last read,
   * so `mutator` receives the freshly-read value, not a stale snapshot.
   */
  async update(mutator: (current: T) => T | Promise<T>): Promise<T> {
    const release = await this.acquireLock()
    try {
      const { data } = await this.read()
      const next = await mutator(data)
      await this.write(next)
      return next
    } finally {
      await release()
    }
  }

  private async acquireLock(): Promise<() => Promise<void>> {
    await mkdir(path.dirname(this.lockFile), { recursive: true })
    const record: LockRecord = { pid: process.pid, host: HOST, ts: Date.now() }
    const deadline = Date.now() + this.lockTimeoutMs
    for (;;) {
      try {
        const fh = await open(this.lockFile, 'wx')
        await fh.writeFile(JSON.stringify(record), 'utf8')
        await fh.close()
        let released = false
        return async () => {
          if (released) return
          released = true
          await unlink(this.lockFile).catch(() => {})
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
        if (await this.reclaimIfStale()) continue
        if (Date.now() >= deadline) throw new Error(`timed out acquiring lock ${path.basename(this.lockFile)}`)
        await delay(50)
      }
    }
  }

  /** Remove the lock only if its owner is a dead process on THIS host. Across hosts pid is meaningless, so wait. */
  private async reclaimIfStale(): Promise<boolean> {
    let held: LockRecord
    try {
      held = JSON.parse(await readFile(this.lockFile, 'utf8')) as LockRecord
    } catch {
      return false // mid-write or vanished; retry the open
    }
    if (held.host !== HOST) return false
    if (isAlive(held.pid)) return false
    await unlink(this.lockFile).catch(() => {})
    return true
  }
}

function hash(content: string): string {
  return createHash('sha1').update(content).digest('hex')
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    // ESRCH = no such process (dead); EPERM = exists but not ours (alive).
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
