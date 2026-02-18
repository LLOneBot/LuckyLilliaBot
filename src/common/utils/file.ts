import fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import path from 'node:path'
import * as fileType from 'file-type'
import { imageSizeFromFile } from '../image-size/lib/fromFile'
import { TEMP_DIR } from '../globalVars'
import { randomUUID, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Context } from 'cordis'

// 定义一个异步函数来检查文件是否存在
export function checkFileReceived(path: string, timeout: number = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    function check() {
      if (fs.existsSync(path)) {
        resolve()
      }
      else if (Date.now() - startTime > timeout) {
        reject(new Error(`文件不存在: ${path}`))
      }
      else {
        setTimeout(check, 200)
      }
    }

    check()
  })
}

export enum FileUriType {
  Unknown = 0,
  FileURL = 1,
  RemoteURL = 2,
  OneBotBase64 = 3,
  DataURL = 4,
  Path = 5
}

export function checkUriType(uri: string): { type: FileUriType } {
  if (uri.startsWith('base64://')) {
    return { type: FileUriType.OneBotBase64 }
  }
  if (uri.startsWith('data:')) {
    return { type: FileUriType.DataURL }
  }
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return { type: FileUriType.RemoteURL }
  }
  if (uri.startsWith('file://')) {
    return { type: FileUriType.FileURL }
  }
  try {
    if (fs.existsSync(uri)) return { type: FileUriType.Path }
  } catch {
  }
  return { type: FileUriType.Unknown }
}

interface FetchFileRes {
  data: Buffer
  url: string
}

export async function fetchFile(url: string, headersInit?: Record<string, string>): Promise<FetchFileRes> {
  const headers = new Headers({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Safari/537.36',
    'Host': new URL(url).hostname,
    ...headersInit,
  })
  let raw = await fetch(url, { headers }).catch((err) => {
    if (err.cause) {
      throw err.cause
    }
    throw err
  })
  if (raw.status === 403 && !headers.has('Referer')) {
    headers.set('Referer', url)
    raw = await fetch(url, { headers }).catch((err) => {
      if (err.cause) {
        throw err.cause
      }
      throw err
    })
  }
  if (!raw.ok) throw new Error(`statusText: ${raw.statusText}`)
  return {
    data: Buffer.from(await raw.arrayBuffer()),
    url: raw.url,
  }
}

type Uri2LocalRes = {
  success: boolean
  errMsg: string
  fileName: string
  path: string
  isLocal: boolean
}

export async function uri2local(ctx: Context, uri: string, needExt?: boolean): Promise<Uri2LocalRes> {
  const { type } = checkUriType(uri)

  if (type === FileUriType.FileURL) {
    const filePath = fileURLToPath(uri)
    if (!fs.existsSync(filePath)) {
      return { success: false, errMsg: '路径不存在', fileName: '', path: '', isLocal: false }
    }
    const fileName = path.basename(filePath)
    return { success: true, errMsg: '', fileName, path: filePath, isLocal: true }
  }

  if (type === FileUriType.Path) {
    const fileName = path.basename(uri)
    return { success: true, errMsg: '', fileName, path: uri, isLocal: true }
  }

  if (type === FileUriType.RemoteURL) {
    try {
      const res = await fetchFile(uri)
      let fileName = randomUUID()
      let filePath = path.join(TEMP_DIR, fileName)
      await fsPromise.writeFile(filePath, res.data)
      if (needExt) {
        const ext = (await ctx.ntFileApi.getFileType(filePath)).ext
        fileName += `.${ext}`
        const newPath = `${filePath}.${ext}`
        await fsPromise.rename(filePath, newPath)
        filePath = newPath
      }
      return { success: true, errMsg: '', fileName, path: filePath, isLocal: false }
    } catch (e) {
      const errMsg = `${uri} 下载失败, ${(e as Error).message}`
      return { success: false, errMsg, fileName: '', path: '', isLocal: false }
    }
  }

  if (type === FileUriType.OneBotBase64) {
    let filename = randomUUID()
    let filePath = path.join(TEMP_DIR, filename)
    const base64 = uri.replace(/^base64:\/\//, '')
    await fsPromise.writeFile(filePath, base64, 'base64')
    if (needExt) {
      const ext = (await ctx.ntFileApi.getFileType(filePath)).ext
      filename += `.${ext}`
      await fsPromise.rename(filePath, `${filePath}.${ext}`)
      filePath = `${filePath}.${ext}`
    }
    return { success: true, errMsg: '', fileName: filename, path: filePath, isLocal: false }
  }

  if (type === FileUriType.DataURL) {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
    const capture = /^data:([\w/.+-]+);base64,(.*)$/.exec(uri)
    if (capture) {
      let filename = randomUUID()
      const [, _type, base64] = capture
      let filePath = path.join(TEMP_DIR, filename)
      await fsPromise.writeFile(filePath, base64, 'base64')
      if (needExt) {
        const ext = (await ctx.ntFileApi.getFileType(filePath)).ext
        filename += `.${ext}`
        await fsPromise.rename(filePath, `${filePath}.${ext}`)
        filePath = `${filePath}.${ext}`
      }
      return { success: true, errMsg: '', fileName: filename, path: filePath, isLocal: false }
    }
  }

  if (type === FileUriType.Unknown) {
    // uri可能是文件名
    let fileCache = await ctx.store.getFileCacheById(uri)
    if (!fileCache?.length) {
      fileCache = await ctx.store.getFileCacheByName(uri)
    }
    if (fileCache?.length) {
      const downloadPath = await ctx.ntFileApi.downloadMedia(
        fileCache[0].msgId,
        fileCache[0].chatType,
        fileCache[0].peerUid,
        fileCache[0].elementId,
        '',
        '',
      )
      return { success: true, errMsg: '', fileName: fileCache[0].fileName, path: downloadPath, isLocal: true }
    }
  }

  return { success: false, errMsg: '未知文件类型或路径不存在', fileName: '', path: '', isLocal: false }
}


export async function getFileType(filePath: string) {
  try {
    const type = await fileType.fileTypeFromFile(filePath)

    if (!type) {
      return {
        mime: 'application/octet-stream',
        ext: path.extname(filePath).slice(0) || '',
      }
    }

    return {
      mime: type.mime,
      ext: type.ext,
    }
  } catch (error) {
    console.error('Error detecting file type:', error)
    return {
      mime: '',
      ext: '',
    }
  }
}

export async function getImageSize(path: string) {
  return await imageSizeFromFile(path)
}

export function getMd5HexFromBuffer(buf: Buffer) {
  return createHash('md5').update(buf).digest('hex')
}

export function getSha1HexFromBuffer(buf: Buffer) {
  return createHash('sha1').update(buf).digest('hex')
}

export async function getMd5HexFromFile(filePath: string) {
  const hash = createHash('md5')
  const stream = fs.createReadStream(filePath)
  for await (const chunk of stream) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

export async function getSha1HexFromFile(filePath: string) {
  const hash = createHash('sha1')
  const stream = fs.createReadStream(filePath)
  for await (const chunk of stream) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

export function getMd5BufferFromBuffer(buf: Buffer) {
  return createHash('md5').update(buf).digest()
}

export async function getMd5BufferFromFile(filePath: string) {
  const hash = createHash('md5')
  const stream = fs.createReadStream(filePath)
  for await (const chunk of stream) {
    hash.update(chunk)
  }
  return hash.digest()
}

export function getSha1BufferFromBuffer(buf: Buffer) {
  return createHash('sha1').update(buf).digest()
}

export async function getSha1BufferFromFile(filePath: string) {
  const hash = createHash('sha1')
  const stream = fs.createReadStream(filePath)
  for await (const chunk of stream) {
    hash.update(chunk)
  }
  return hash.digest()
}

export class Sha1Stream {
  private static readonly padding = new Uint8Array([
    0x80, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0
  ])

  private readonly _state: Uint32Array
  private readonly _count: Uint32Array
  private readonly _buffer: Uint8Array
  private readonly _w: Uint32Array

  constructor() {
    this._state = new Uint32Array(5)
    this._count = new Uint32Array(2)
    this._buffer = new Uint8Array(64)
    this._w = new Uint32Array(80)
    this.reset()
  }

  public reset() {
    this._state[0] = 0x67452301
    this._state[1] = 0xEFCDAB89
    this._state[2] = 0x98BADCFE
    this._state[3] = 0x10325476
    this._state[4] = 0xC3D2E1F0

    this._count[0] = 0
    this._count[1] = 0
  }

  private transform(chunk: Uint8Array) {
    const w = this._w

    // Load 16 words (big endian)
    for (let i = 0; i < 16; i++) {
      const j = i * 4
      w[i] =
        (chunk[j] << 24) |
        (chunk[j + 1] << 16) |
        (chunk[j + 2] << 8) |
        (chunk[j + 3])
    }

    // Extend to 80 words
    for (let i = 16; i < 80; i++) {
      const v = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]
      w[i] = (v << 1) | (v >>> 31)
    }

    let a = this._state[0]
    let b = this._state[1]
    let c = this._state[2]
    let d = this._state[3]
    let e = this._state[4]

    // Round constants
    const K1 = 0x5A827999
    const K2 = 0x6ED9EBA1
    const K3 = 0x8F1BBCDC
    const K4 = 0xCA62C1D6

    // 0–19
    for (let i = 0; i < 20; i++) {
      const t = (((a << 5) | (a >>> 27)) + ((b & c) | (~b & d)) + e + w[i] + K1) >>> 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = t
    }

    // 20–39
    for (let i = 20; i < 40; i++) {
      const t = (((a << 5) | (a >>> 27)) + (b ^ c ^ d) + e + w[i] + K2) >>> 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = t
    }

    // 40–59
    for (let i = 40; i < 60; i++) {
      const t = (((a << 5) | (a >>> 27)) + ((b & c) | (b & d) | (c & d)) + e + w[i] + K3) >>> 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = t
    }

    // 60–79
    for (let i = 60; i < 80; i++) {
      const t = (((a << 5) | (a >>> 27)) + (b ^ c ^ d) + e + w[i] + K4) >>> 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = t
    }

    this._state[0] = (this._state[0] + a) >>> 0
    this._state[1] = (this._state[1] + b) >>> 0
    this._state[2] = (this._state[2] + c) >>> 0
    this._state[3] = (this._state[3] + d) >>> 0
    this._state[4] = (this._state[4] + e) >>> 0
  }

  public update(data: Uint8Array) {
    if (!(data instanceof Uint8Array)) {
      data = new Uint8Array(data)
    }

    let len = data.length
    let index = (this._count[0] >>> 3) & 0x3F

    this._count[0] += len << 3
    if (this._count[0] < (len << 3)) this._count[1]++
    this._count[1] += len >>> 29

    let partLen = 64 - index
    let i = 0

    if (len >= partLen) {
      this._buffer.set(data.subarray(0, partLen), index)
      this.transform(this._buffer)

      for (i = partLen; i + 63 < len; i += 64) {
        this.transform(data.subarray(i, i + 64))
      }
      index = 0
    }

    this._buffer.set(data.subarray(i), index)
  }

  public hash(bigEnding = true) {
    const out = new Uint8Array(20)
    const st = this._state

    if (bigEnding) {
      // big endian
      out[0] = st[0] >>> 24
      out[1] = (st[0] >>> 16) & 0xff
      out[2] = (st[0] >>> 8) & 0xff
      out[3] = st[0] & 0xff

      out[4] = st[1] >>> 24
      out[5] = (st[1] >>> 16) & 0xff
      out[6] = (st[1] >>> 8) & 0xff
      out[7] = st[1] & 0xff

      out[8] = st[2] >>> 24
      out[9] = (st[2] >>> 16) & 0xff
      out[10] = (st[2] >>> 8) & 0xff
      out[11] = st[2] & 0xff

      out[12] = st[3] >>> 24
      out[13] = (st[3] >>> 16) & 0xff
      out[14] = (st[3] >>> 8) & 0xff
      out[15] = st[3] & 0xff

      out[16] = st[4] >>> 24
      out[17] = (st[4] >>> 16) & 0xff
      out[18] = (st[4] >>> 8) & 0xff
      out[19] = st[4] & 0xff
    } else {
      // little endian
      out[0] = st[0] & 0xff
      out[1] = (st[0] >>> 8) & 0xff
      out[2] = (st[0] >>> 16) & 0xff
      out[3] = st[0] >>> 24

      out[4] = st[1] & 0xff
      out[5] = (st[1] >>> 8) & 0xff
      out[6] = (st[1] >>> 16) & 0xff
      out[7] = st[1] >>> 24

      out[8] = st[2] & 0xff
      out[9] = (st[2] >>> 8) & 0xff
      out[10] = (st[2] >>> 16) & 0xff
      out[11] = st[2] >>> 24

      out[12] = st[3] & 0xff
      out[13] = (st[3] >>> 8) & 0xff
      out[14] = (st[3] >>> 16) & 0xff
      out[15] = st[3] >>> 24

      out[16] = st[4] & 0xff
      out[17] = (st[4] >>> 8) & 0xff
      out[18] = (st[4] >>> 16) & 0xff
      out[19] = st[4] >>> 24
    }

    return out
  }

  public final() {
    const digest = new Uint8Array(20)

    const bits = new Uint8Array(8)
    for (let i = 0; i < 8; i++) {
      const byteIndex = i >= 4 ? 0 : 1
      const shift = (3 - (i & 3)) * 8
      bits[i] = (this._count[byteIndex] >>> shift) & 0xff
    }

    const index = (this._count[0] >>> 3) & 0x3F
    const padLen = index < 56 ? 56 - index : 120 - index

    this.update(Sha1Stream.padding.subarray(0, padLen))
    this.update(bits)

    for (let i = 0; i < 20; i++) {
      const word = this._state[i >> 2]
      const shift = (3 - (i & 3)) * 8
      digest[i] = (word >>> shift) & 0xff
    }

    return digest
  }
}

export async function calculateSha1StreamBytes(filePath: string): Promise<Buffer[]> {
  const sha1 = new Sha1Stream()
  const blockSize = 1024 * 1024

  let tail: Buffer = Buffer.alloc(0)
  let bytesRead = 0
  let nextBlockBoundary = blockSize

  const byteArrayList: Buffer[] = []
  const readable = fs.createReadStream(filePath)

  for await (const chunk of readable) {
    let buf: Buffer

    if (tail.length > 0) {
      buf = Buffer.concat([tail, chunk])
      tail = Buffer.alloc(0)
    } else {
      buf = chunk
    }

    let offset = 0

    while (buf.length - offset >= 64) {
      sha1.update(buf.subarray(offset, offset + 64))
      offset += 64
      bytesRead += 64

      if (bytesRead >= nextBlockBoundary) {
        byteArrayList.push(Buffer.from(sha1.hash(false)))
        nextBlockBoundary += blockSize
      }
    }

    tail = buf.subarray(offset)
  }

  if (tail.length > 0) {
    sha1.update(tail)
  }

  byteArrayList.push(Buffer.from(sha1.final()))
  return byteArrayList
}

export async function readAndHash10M(filePath: string) {
  const maxSize = 10002432
  const fd = await fsPromise.open(filePath, 'r')
  const buffer = Buffer.allocUnsafe(maxSize)
  const { bytesRead } = await fd.read(buffer, 0, maxSize, 0)
  await fd.close()
  return getMd5BufferFromBuffer(buffer.subarray(0, bytesRead))
}

export class TriSha1 {
  private hasher = createHash('sha1')
  private offset = 0
  private fileSize: number
  private ranges: Array<[number, number]>

  constructor(fileSize: number) {
    this.fileSize = fileSize

    if (fileSize < 30 * 1024 * 1024) {
      // < 30M
      this.ranges = [[0, fileSize]]
    } else {
      // >= 30M
      this.ranges = [
        [0, 10 * 1024 * 1024 - 1], // 0..10485759
        [
          (fileSize >> 1) - 5 * 1024 * 1024,
          (fileSize >> 1) + 5 * 1024 * 1024 - 1
        ],
        [fileSize - 10 * 1024 * 1024, fileSize - 1]
      ]
    }
  }

  update(data: Buffer | Uint8Array) {
    const start = this.offset
    const end = start + data.length

    for (const [rs, re] of this.ranges) {
      const from = Math.max(start, rs)
      const to = Math.min(end, re + 1)

      if (from < to) {
        const slice = data.subarray(
          from - start,
          to - start
        )
        this.hasher.update(slice)
      }
    }

    this.offset = end
  }

  finalize() {
    const sizeBytes = Buffer.allocUnsafe(8)
    sizeBytes.writeBigUInt64LE(BigInt(this.fileSize))

    this.hasher.update(sizeBytes)
    return this.hasher.digest()
  }
}

export async function calculateTriSha1(filePath: string, fileSize: number) {
  const hash = new TriSha1(fileSize)
  const stream = fs.createReadStream(filePath)
  for await (const chunk of stream) {
    hash.update(chunk)
  }
  return hash.finalize()
}
