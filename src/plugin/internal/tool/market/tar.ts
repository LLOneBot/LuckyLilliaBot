import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isInside } from '../../../host/manifest'

export interface TarEntry {
  /** As stored, e.g. `package/lib/index.js` */
  path: string
  type: 'file' | 'directory'
  data: Buffer
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
    const start = offset + BLOCK
    if (start + size > tar.length) throw new Error('corrupt tarball: truncated entry')
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

/** Writes a package tarball's entries under `dest`, without the directory they are packed in (`package/`). */
export async function extractPackage(tar: Buffer, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })
  for (const entry of readTar(tar)) {
    const relative = entry.path.split('/').slice(1).join('/')
    if (!relative) continue
    const target = path.resolve(dest, relative)
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
