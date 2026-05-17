/**
 * TLV (Tag-Length-Value) packing and unpacking utilities
 * for QQ protocol login packets
 */

export class TlvWriter {
  private parts: Buffer[] = []
  private count = 0

  addTlv(tag: number, data: Buffer): void {
    const header = Buffer.alloc(4)
    header.writeUInt16BE(tag, 0)
    header.writeUInt16BE(data.length, 2)
    this.parts.push(header)
    this.parts.push(data)
    this.count++
  }

  addTlvUint8(tag: number, value: number): void {
    const buf = Buffer.alloc(1)
    buf.writeUInt8(value)
    this.addTlv(tag, buf)
  }

  addTlvUint16(tag: number, value: number): void {
    const buf = Buffer.alloc(2)
    buf.writeUInt16BE(value)
    this.addTlv(tag, buf)
  }

  addTlvUint32(tag: number, value: number): void {
    const buf = Buffer.alloc(4)
    buf.writeUInt32BE(value)
    this.addTlv(tag, buf)
  }

  build(): Buffer {
    const countBuf = Buffer.alloc(2)
    countBuf.writeUInt16BE(this.count)
    return Buffer.concat([countBuf, ...this.parts])
  }
}

export function tlvUnpack(data: Buffer): Map<number, Buffer> {
  const result = new Map<number, Buffer>()
  let offset = 0

  if (data.length < 2) return result
  const count = data.readUInt16BE(offset); offset += 2

  for (let i = 0; i < count && offset + 4 <= data.length; i++) {
    const tag = data.readUInt16BE(offset); offset += 2
    const len = data.readUInt16BE(offset); offset += 2
    if (offset + len > data.length) break
    result.set(tag, Buffer.from(data.subarray(offset, offset + len)))
    offset += len
  }

  return result
}

/**
 * Write a length-prefixed string (uint16 BE length + UTF-8 string)
 */
export function writeString16(str: string): Buffer {
  const strBuf = Buffer.from(str, 'utf-8')
  const header = Buffer.alloc(2)
  header.writeUInt16BE(strBuf.length)
  return Buffer.concat([header, strBuf])
}

/**
 * Write a length-prefixed buffer (uint16 BE length + data)
 */
export function writeBytes16(data: Buffer): Buffer {
  const header = Buffer.alloc(2)
  header.writeUInt16BE(data.length)
  return Buffer.concat([header, data])
}

/**
 * Write a length-prefixed buffer (uint32 BE length + data)
 */
export function writeBytes32(data: Buffer): Buffer {
  const header = Buffer.alloc(4)
  header.writeUInt32BE(data.length + 4)
  return Buffer.concat([header, data])
}
