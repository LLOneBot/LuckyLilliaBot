/**
 * SsoReservedField protobuf encoding
 *
 * Proto definition (partial, only fields we need):
 *   field 15: TraceParent (string) - "01-{32hex}-{16hex}-01"
 *   field 16: Uid (string) - user UID
 *
 * Uses manual protobuf encoding (varint + length-delimited)
 */

const HEX_CHARS = '0123456789abcdef'

function randomHex(len: number): string {
  let result = ''
  for (let i = 0; i < len; i++) {
    result += HEX_CHARS[Math.floor(Math.random() * 16)]
  }
  return result
}

/**
 * Generate traceParent string: "01-{32hex}-{16hex}-01"
 */
export function generateTraceParent(): string {
  return `01-${randomHex(32)}-${randomHex(16)}-01`
}

/**
 * Encode a protobuf varint
 */
function encodeVarint(value: number): Buffer {
  const bytes: number[] = []
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80)
    value >>>= 7
  }
  bytes.push(value & 0x7f)
  return Buffer.from(bytes)
}

/**
 * Encode a protobuf field tag
 * wire type 2 = length-delimited (strings, bytes)
 */
function encodeTag(fieldNumber: number, wireType: number): Buffer {
  return encodeVarint((fieldNumber << 3) | wireType)
}

/**
 * Encode a length-delimited protobuf field (string or bytes)
 */
function encodeLengthDelimited(fieldNumber: number, data: Buffer): Buffer {
  const tag = encodeTag(fieldNumber, 2)
  const len = encodeVarint(data.length)
  return Buffer.concat([tag, len, data])
}

/**
 * Encode a string protobuf field
 */
function encodeString(fieldNumber: number, value: string): Buffer {
  return encodeLengthDelimited(fieldNumber, Buffer.from(value, 'utf-8'))
}

/**
 * Build SsoReservedField protobuf bytes
 */
export function buildSsoReservedField(uid?: string): Buffer {
  const parts: Buffer[] = []

  // Field 15: TraceParent (string)
  parts.push(encodeString(15, generateTraceParent()))

  // Field 16: Uid (string) - only if logged in
  if (uid) {
    parts.push(encodeString(16, uid))
  }

  return Buffer.concat(parts)
}
