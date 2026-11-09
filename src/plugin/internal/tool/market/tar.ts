import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isInside } from '../../../host/manifest'

export interface TarEntry {
  /** As stored, e.g. `package/lib/index.js` */
  path: string
  type: 'file' | 'directory'
  data: Buffer
}

export interface TarStreamEntry {
  path: string
  type: TarEntry['type']
  /** Consume while this entry is yielded; advancing to the next entry drains any remaining bytes. */
  data: AsyncIterable<Buffer>
}

const BLOCK = 512

/**
 * The files and directories of an uncompressed tarball (ustar, with pax and GNU long names). Links and devices are
 * dropped: a package has no business pointing outside itself.
 */
export function* readTar(tar: Buffer): Generator<TarEntry> {
  let offset = 0
  let longName: string | undefined
  let paxSize: number | undefined
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK)
    if (header.every(byte => byte === 0)) return
    if (checksum(header) !== octal(header, 148, 8)) throw new Error(`corrupt tarball: bad header at ${offset}`)
    const type = header[156] === 0 ? '0' : String.fromCharCode(header[156])
    const size = paxSize ?? numeric(header, 124, 12)
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('corrupt tarball: invalid entry size')
    const start = offset + BLOCK
    if (start + Math.ceil(size / BLOCK) * BLOCK > tar.length) throw new Error('corrupt tarball: truncated entry')
    const data = tar.subarray(start, start + size)
    offset = start + Math.ceil(size / BLOCK) * BLOCK
    if (type === 'x') {
      const pax = parsePax(data)
      longName = pax.path ?? longName
      paxSize = pax.size === undefined ? undefined : Number(pax.size)
      continue
    }
    if (type === 'L') {
      longName = text(data, 0, data.length)
      continue
    }
    paxSize = undefined
    if (type === 'g' || type === 'K') continue
    const name = longName ?? joinName(header)
    longName = undefined
    if (type === '0' || type === '7') yield { path: name, type: 'file', data }
    else if (type === '5') yield { path: name, type: 'directory', data }
  }
}

/** Incremental tar reader for local archives, including the end markers and trailing gzip integrity check. */
export async function* readTarStream(stream: AsyncIterable<Buffer>): AsyncGenerator<TarStreamEntry> {
  const reader = new TarReader(stream)
  let longName: string | undefined
  let paxSize: number | undefined
  try {
    while (true) {
      const header = await reader.bytes(BLOCK)
      if (header.every(byte => byte === 0)) {
        let padding = BLOCK
        // Read to EOF, so a truncated or corrupt gzip footer also fails before installation.
        for await (const chunk of reader.rest()) {
          if (!chunk.every(byte => byte === 0)) throw new Error('corrupt tarball: data after end marker')
          padding += chunk.length
        }
        if (padding < 2 * BLOCK || padding % BLOCK) throw new Error('corrupt tarball: incomplete end markers')
        return
      }
      if (checksum(header) !== octal(header, 148, 8)) throw new Error('corrupt tarball: bad header')
      const type = header[156] === 0 ? '0' : String.fromCharCode(header[156])
      const metadata = ['x', 'g', 'L', 'K'].includes(type)
      const size = (!metadata ? paxSize : undefined) ?? numeric(header, 124, 12)
      if (!Number.isSafeInteger(size) || size < 0) throw new Error('corrupt tarball: invalid entry size')
      const start = reader.offset
      if (type === 'x') {
        const pax = await readPaxStream(reader.take(size), size)
        longName = pax.path ?? longName
        paxSize = pax.size === undefined ? undefined : Number(pax.size)
      } else if (type === 'L') {
        const data = await reader.bytes(size)
        longName = text(data, 0, data.length)
      } else if (!metadata) {
        const name = longName ?? joinName(header)
        longName = undefined
        paxSize = undefined
        if (type === '0' || type === '7') yield { path: name, type: 'file', data: reader.take(size) }
        else if (type === '5') yield { path: name, type: 'directory', data: reader.take(size) }
      }
      await reader.skip(size - (reader.offset - start))
      await reader.skip((BLOCK - size % BLOCK) % BLOCK)
    }
  } finally {
    await reader.close()
  }
}

/** A single input chunk is retained; only headers and required path metadata are assembled. */
class TarReader {
  offset = 0
  private chunk: Buffer = Buffer.alloc(0)
  private readonly iterator: AsyncIterator<Buffer>

  constructor(stream: AsyncIterable<Buffer>) {
    this.iterator = stream[Symbol.asyncIterator]()
  }

  private async more(): Promise<boolean> {
    while (!this.chunk.length) {
      const next = await this.iterator.next()
      if (next.done) return false
      this.chunk = next.value
    }
    return true
  }

  async *take(size: number): AsyncGenerator<Buffer> {
    while (size > 0) {
      if (!await this.more()) throw new Error('corrupt tarball: truncated entry or end markers')
      const length = Math.min(size, this.chunk.length)
      const data = this.chunk.subarray(0, length)
      this.chunk = this.chunk.subarray(length)
      this.offset += length
      size -= length
      yield data
    }
  }

  async bytes(size: number): Promise<Buffer> {
    const chunks: Buffer[] = []
    for await (const chunk of this.take(size)) chunks.push(chunk)
    return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, size)
  }

  async skip(size: number): Promise<void> {
    for await (const _ of this.take(size)) { /* drain without buffering */ }
  }

  async *rest(): AsyncGenerator<Buffer> {
    while (await this.more()) {
      const data = this.chunk
      this.chunk = Buffer.alloc(0)
      this.offset += data.length
      yield data
    }
  }

  async close(): Promise<void> {
    await this.iterator.return?.()
  }
}

/** Unknown pax values (such as extended attributes) are skipped without retaining them in memory. */
async function readPaxStream(data: AsyncIterable<Buffer>, size: number): Promise<{ path?: string; size?: string }> {
  const reader = new TarReader(data)
  const values: { path?: string; size?: string } = {}
  while (reader.offset < size) {
    const start = reader.offset
    let length = 0
    while (true) {
      const byte = (await reader.bytes(1))[0]
      if (byte === 0x20) break
      if (byte < 0x30 || byte > 0x39) throw new Error('corrupt tarball: invalid pax length')
      length = length * 10 + byte - 0x30
      if (!Number.isSafeInteger(length) || length > size - start) throw new Error('corrupt tarball: invalid pax length')
    }
    const contentSize = length - (reader.offset - start) - 1
    if (contentSize < 0 || start + length > size) throw new Error('corrupt tarball: invalid pax record')
    const prefix = await reader.bytes(Math.min(5, contentSize))
    const key = prefix.toString('ascii')
    if (key === 'path=' || key === 'size=') values[key === 'path=' ? 'path' : 'size'] = (await reader.bytes(contentSize - prefix.length)).toString('utf8')
    else await reader.skip(contentSize - prefix.length)
    if ((await reader.bytes(1))[0] !== 0x0a) throw new Error('corrupt tarball: invalid pax record')
  }
  return values
}

/** Writes a package tarball's entries under `dest`, without the directory they are packed in (`package/`). */
export async function extractPackage(tar: Buffer, dest: string): Promise<void> {
  function* entries() {
    for (const entry of readTar(tar)) {
      const relative = entry.path.split('/').slice(1).join('/')
      if (relative) yield { ...entry, path: relative }
    }
  }
  await extractEntries(entries(), dest)
}

/** Writes regular files and directories whose paths are already relative to the package root. */
export async function extractEntries(entries: Iterable<TarEntry>, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })
  for (const entry of entries) {
    const target = path.resolve(dest, entry.path)
    if (!isInside(dest, target)) throw new Error(`unsafe path in tarball: ${entry.path}`)
    if (entry.type === 'directory') {
      await mkdir(target, { recursive: true })
    } else {
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, entry.data)
    }
  }
}

function joinName(header: Buffer): string {
  const name = text(header, 0, 100)
  const prefix = header.toString('latin1', 257, 262) === 'ustar' ? text(header, 345, 155) : ''
  return prefix ? `${prefix}/${name}` : name
}

function text(buffer: Buffer, start: number, length: number): string {
  const end = buffer.indexOf(0, start)
  return buffer.toString('utf8', start, end < 0 || end > start + length ? start + length : end)
}

function octal(buffer: Buffer, start: number, length: number): number {
  const value = text(buffer, start, length).trim()
  return value ? parseInt(value, 8) : 0
}

/** Octal, or base-256 for sizes past 8 GiB (first byte's top bit set) */
function numeric(buffer: Buffer, start: number, length: number): number {
  if (!(buffer[start] & 0x80)) return octal(buffer, start, length)
  let value = buffer[start] & 0x7f
  for (let i = start + 1; i < start + length; i++) value = value * 256 + buffer[i]
  return value
}

function checksum(header: Buffer): number {
  let sum = 0
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : header[i]
  return sum
}

/** Records of `<length> <key>=<value>\n` */
function parsePax(data: Buffer): Record<string, string> {
  const records: Record<string, string> = {}
  let offset = 0
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset)
    if (space < 0) break
    const length = parseInt(data.toString('latin1', offset, space), 10)
    if (!(length > 0)) break
    const record = data.toString('utf8', space + 1, offset + length - 1)
    const equals = record.indexOf('=')
    if (equals > 0) records[record.slice(0, equals)] = record.slice(equals + 1)
    offset += length
  }
  return records
}
