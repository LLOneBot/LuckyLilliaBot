import type { SignResult } from './sign'

const HEX_CHARS = '0123456789abcdef'

function randomHex(len: number): string {
  let result = ''
  for (let i = 0; i < len; i++) {
    result += HEX_CHARS[Math.floor(Math.random() * 16)]
  }
  return result
}

export function generateTraceParent(): string {
  return `01-${randomHex(32)}-${randomHex(16)}-01`
}

function encodeVarint(value: number): Buffer {
  const bytes: number[] = []
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80)
    value >>>= 7
  }
  bytes.push(value & 0x7f)
  return Buffer.from(bytes)
}

function encodeTag(fieldNumber: number, wireType: number): Buffer {
  return encodeVarint((fieldNumber << 3) | wireType)
}

function encodeLengthDelimited(fieldNumber: number, data: Buffer): Buffer {
  const tag = encodeTag(fieldNumber, 2)
  const len = encodeVarint(data.length)
  return Buffer.concat([tag, len, data])
}

function encodeString(fieldNumber: number, value: string): Buffer {
  return encodeLengthDelimited(fieldNumber, Buffer.from(value, 'utf-8'))
}

export function buildSsoReservedField(uid?: string, signResult?: SignResult | null): Buffer {
  const parts: Buffer[] = []

  // SecInfo must be written before traceParent (protocol ordering requirement)
  if (signResult) {
    const secParts: Buffer[] = []
    if (signResult.sign.length > 0) secParts.push(encodeLengthDelimited(1, signResult.sign))
    if (signResult.token.length > 0) secParts.push(encodeLengthDelimited(2, signResult.token))
    else secParts.push(encodeLengthDelimited(2, Buffer.alloc(0)))
    if (signResult.extra.length > 0) secParts.push(encodeLengthDelimited(3, signResult.extra))
    parts.push(encodeLengthDelimited(24, Buffer.concat(secParts)))
  }

  parts.push(encodeString(15, generateTraceParent()))

  if (uid) {
    parts.push(encodeString(16, uid))
  }

  return Buffer.concat(parts)
}
