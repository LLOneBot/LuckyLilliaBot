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

  // 按 protobuf field number 升序：15 (TraceParent), 16 (Uid), 24 (SecInfo)
  // SsoReserveFields 用 protobuf-net 默认按字段顺序序列化

  // field 15: TraceParent
  parts.push(encodeString(15, generateTraceParent()))

  // field 16: Uid
  if (uid) {
    parts.push(encodeString(16, uid))
  }

  // field 24: SecInfo (SsoSecureInfo)
  // SsoSecureInfo: 1=SecSign, 2=SecDeviceToken, 3=SecExtra
  // 注意：仅在非空时编码（protobuf-net 不编码 default empty bytes）
  if (signResult) {
    const secParts: Buffer[] = []
    if (signResult.sign.length > 0) secParts.push(encodeLengthDelimited(1, signResult.sign))
    if (signResult.token.length > 0) secParts.push(encodeLengthDelimited(2, signResult.token))
    if (signResult.extra.length > 0) secParts.push(encodeLengthDelimited(3, signResult.extra))
    parts.push(encodeLengthDelimited(24, Buffer.concat(secParts)))
  }

  return Buffer.concat(parts)
}
