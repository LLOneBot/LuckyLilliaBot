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
 * - read: JSON5. A broken file is left in place, since it may be a hand edit; the last good value (or the
 *   default) comes back with an error, and the next read retries.
 * - write: to a temp file, then rename. Writes within one process are serialized.
 * - update(): read-modify-write under a cross-process lock, for files two processes may touch at once.
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
      return { data: this.lastGood ?? this.options.defaultValue(), error: (e as Error).message }
    }
  }

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

  /** Skips the write queue: do not interleave with write(). */
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

  wasSelfWrite(raw: string): boolean {
    return !!this.lastWrittenHash && hash(raw) === this.lastWrittenHash
  }

  rawSync(): string | undefined {
    try {
      return readFileSync(this.file, 'utf8')
    } catch {
      return undefined
    }
  }

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

  /** `mutator` gets the value read under the lock, which another process may have changed since. */
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
