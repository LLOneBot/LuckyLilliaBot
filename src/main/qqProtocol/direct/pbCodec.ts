// Minimal protobuf wire encoder shared across the direct protocol layer.
// 我们手解 PB 而不引 prost-codegen 是为了保留 wire-level control (跟 wrapper.node
// 反编译路径对照看更顺); 但相同的 5 行 helper 散落在多个文件不方便, 这里集中.
//
// Wire types covered: 0 (varint), 2 (length-delimited).
// 1 (fixed64) / 5 (fixed32) 协议层用不到, 故意不实装.

export function writeVarint(value: number | bigint): Buffer {
  let v = typeof value === 'bigint' ? value : BigInt(value)
  if (v < 0n) {
    throw new Error(`writeVarint: negative ${v}`)
  }
  const bytes: number[] = []
  while (v > 0x7fn) {
    bytes.push(Number((v & 0x7fn) | 0x80n))
    v >>= 7n
  }
  bytes.push(Number(v & 0x7fn))
  return Buffer.from(bytes)
}

export function pbVarint(field: number, value: number | bigint): Buffer {
  const tag = (field << 3) | 0
  return Buffer.concat([writeVarint(tag), writeVarint(value)])
}

export function pbBytes(field: number, data: Buffer): Buffer {
  const tag = (field << 3) | 2
  return Buffer.concat([writeVarint(tag), writeVarint(data.length), data])
}

export function pbString(field: number, s: string): Buffer {
  return pbBytes(field, Buffer.from(s, 'utf-8'))
}

export interface PbField {
  field: number
  wire: 0 | 2
  data: Buffer | bigint
}

/**
 * Top-level decode for length-delimited + varint fields. Wire 1/5 are skipped
 * (跳过未知 fixed-size 字段 -- 防止协议加 reserved 字段把我们卡住).
 * 同 field 多次出现保留最后一个 (跟 sign-token-protocol Rust 一致).
 */
export function pbDecode(buf: Buffer): Map<number, PbField> {
  const out = new Map<number, PbField>()
  let i = 0
  while (i < buf.length) {
    const [tag, after] = readVarintAt(buf, i)
    i = after
    const wire = Number(tag & 7n)
    const field = Number(tag >> 3n)
    if (wire === 0) {
      const [v, j] = readVarintAt(buf, i)
      i = j
      out.set(field, { field, wire: 0, data: v })
    } else if (wire === 2) {
      const [ln, j] = readVarintAt(buf, i)
      i = j
      const len = Number(ln)
      if (i + len > buf.length) {
        throw new Error(`pbDecode: truncated len-delimited field ${field}`)
      }
      out.set(field, { field, wire: 2, data: buf.subarray(i, i + len) })
      i += len
    } else if (wire === 1) {
      i += 8
    } else if (wire === 5) {
      i += 4
    } else {
      throw new Error(`pbDecode: unsupported wire ${wire} at offset ${i - 1}`)
    }
  }
  return out
}

function readVarintAt(buf: Buffer, start: number): [bigint, number] {
  let v = 0n
  let shift = 0n
  for (let i = start; i < buf.length; i++) {
    const b = buf[i]!
    v |= BigInt(b & 0x7f) << shift
    if ((b & 0x80) === 0) return [v, i + 1]
    shift += 7n
    if (shift > 63n) throw new Error('pbDecode: varint overflow')
  }
  throw new Error('pbDecode: varint truncated')
}
