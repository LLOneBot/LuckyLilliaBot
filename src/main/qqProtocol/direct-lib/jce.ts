// Minimal JCE (TARS/TAF) codec for the legacy MSF services QQ NT still carries (ConfigPushSvc).
// Only the field types that appear in ConfigPushSvc.PushReq/PushResp are handled. JCE head byte =
// (tag<<4)|type; tag 15 escapes to a following byte. See docs/Linux (ConfigPush reverse, 2026-10-06).

export const enum JceType {
  INT1 = 0, INT2 = 1, INT4 = 2, INT8 = 3, FLOAT = 4, DOUBLE = 5,
  STR1 = 6, STR4 = 7, MAP = 8, LIST = 9, STRUCT = 10, STRUCT_END = 11,
  ZERO = 12, SIMPLE_LIST = 13,
}

export class JceReader {
  private p = 0
  constructor(private readonly b: Buffer) {}

  get eof(): boolean { return this.p >= this.b.length }

  private head(): { tag: number; type: number } {
    const h = this.b[this.p++]
    let tag = h >> 4
    const type = h & 0x0f
    if (tag === 15) tag = this.b[this.p++]
    return { tag, type }
  }

  private int(type: number): number {
    switch (type) {
      case JceType.ZERO: return 0
      case JceType.INT1: { const v = this.b.readInt8(this.p); this.p += 1; return v }
      case JceType.INT2: { const v = this.b.readInt16BE(this.p); this.p += 2; return v }
      case JceType.INT4: { const v = this.b.readInt32BE(this.p); this.p += 4; return v }
      case JceType.INT8: { const v = Number(this.b.readBigInt64BE(this.p)); this.p += 8; return v }
      default: throw new Error(`jce: not an int type ${type}`)
    }
  }

  // Read one value of the given type (enough subset for ConfigPush). Returns number | string |
  // Buffer (SIMPLE_LIST) | Map (MAP/UniAttribute) | Record (STRUCT).
  private value(type: number): unknown {
    switch (type) {
      case JceType.ZERO: case JceType.INT1: case JceType.INT2:
      case JceType.INT4: case JceType.INT8:
        return this.int(type)
      case JceType.STR1: { const n = this.b[this.p++]; const s = this.b.toString('utf-8', this.p, this.p + n); this.p += n; return s }
      case JceType.STR4: { const n = this.b.readUInt32BE(this.p); this.p += 4; const s = this.b.toString('utf-8', this.p, this.p + n); this.p += n; return s }
      case JceType.SIMPLE_LIST: {
        this.head() // element-type head (tag0 type0=BYTE)
        const n = this.readInt() // length as a JCE int field
        const buf = this.b.subarray(this.p, this.p + n); this.p += n
        return buf
      }
      case JceType.MAP: {
        const size = this.readInt()
        const m = new Map<unknown, unknown>()
        for (let i = 0; i < size; i++) {
          const k = this.readField().value
          const v = this.readField().value
          m.set(k, v)
        }
        return m
      }
      case JceType.STRUCT: {
        const o: Record<number, unknown> = {}
        for (;;) {
          const { tag, type: t } = this.head()
          if (t === JceType.STRUCT_END) break
          o[tag] = this.value(t)
        }
        return o
      }
      default: throw new Error(`jce: unhandled type ${type}`)
    }
  }

  /** Read the next field (any tag); returns its tag + decoded value. */
  readField(): { tag: number; value: unknown } {
    const { tag, type } = this.head()
    return { tag, value: this.value(type) }
  }

  /** Read an int field regardless of its int width (helper for lengths/sizes). */
  readInt(): number {
    const { type } = this.head()
    return this.int(type)
  }

  /** Decode the whole buffer as a tag->value record (top-level fields). */
  decodeAll(): Record<number, unknown> {
    const o: Record<number, unknown> = {}
    while (!this.eof) {
      const { tag, value } = this.readField()
      o[tag] = value
    }
    return o
  }
}

// --- JCE writer (only what PushResp needs) ---

function head(tag: number, type: number): Buffer {
  if (tag < 15) return Buffer.from([(tag << 4) | type])
  return Buffer.from([(15 << 4) | type, tag])
}

export function jceByte(tag: number, v: number): Buffer {
  if (v === 0) return head(tag, JceType.ZERO)
  return Buffer.concat([head(tag, JceType.INT1), Buffer.from([v & 0xff])])
}

export function jceZero(tag: number): Buffer { return head(tag, JceType.ZERO) }

export function jceLong(tag: number, v: number | bigint): Buffer {
  const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(v)); return Buffer.concat([head(tag, JceType.INT8), b])
}

export function jceString(tag: number, s: string): Buffer {
  const data = Buffer.from(s, 'utf-8')
  if (data.length <= 0xff) return Buffer.concat([head(tag, JceType.STR1), Buffer.from([data.length]), data])
  const n = Buffer.alloc(4); n.writeUInt32BE(data.length); return Buffer.concat([head(tag, JceType.STR4), n, data])
}

export function jceSimpleList(tag: number, data: Buffer): Buffer {
  // SIMPLE_LIST = head | elem-type head(tag0 BYTE) | length(JCE int) | bytes
  return Buffer.concat([head(tag, JceType.SIMPLE_LIST), head(0, JceType.INT1), jceByteRaw(data.length), data])
}

// A bare JCE int field at tag 0 used as a length prefix inside SIMPLE_LIST.
function jceByteRaw(v: number): Buffer {
  if (v === 0) return head(0, JceType.ZERO)
  if (v <= 0x7f) return Buffer.concat([head(0, JceType.INT1), Buffer.from([v])])
  if (v <= 0x7fff) { const b = Buffer.alloc(2); b.writeInt16BE(v); return Buffer.concat([head(0, JceType.INT2), b]) }
  const b = Buffer.alloc(4); b.writeInt32BE(v); return Buffer.concat([head(0, JceType.INT4), b])
}

export function jceStruct(tag: number, inner: Buffer): Buffer {
  return Buffer.concat([head(tag, JceType.STRUCT), inner, head(0, JceType.STRUCT_END)])
}

export function jceMap(tag: number, entries: Array<[Buffer, Buffer]>): Buffer {
  const parts: Buffer[] = [head(tag, JceType.MAP), jceByteRaw(entries.length)]
  for (const [k, v] of entries) { parts.push(k, v) }
  return Buffer.concat(parts)
}
