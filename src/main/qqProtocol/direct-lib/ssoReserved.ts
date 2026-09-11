import type { SignResult } from './sign'
import type { ReserveVariant } from './profiles/types'

const HEX_CHARS = '0123456789abcdef'

function randomHex(len: number): string {
  let result = ''
  for (let i = 0; i < len; i++) {
    result += HEX_CHARS[Math.floor(Math.random() * 16)]
  }
  return result
}

// version 前缀各端不同 (真机实测): NT/watch = '01', macOS = '00'。
export function generateTraceParent(version: string = '01'): string {
  return `${version}-${randomHex(32)}-${randomHex(16)}-01`
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

// wiretype 0 (varint) 字段
function encodeVarintField(fieldNumber: number, value: number): Buffer {
  return Buffer.concat([encodeTag(fieldNumber, 0), encodeVarint(value)])
}

// SecInfo (field 24): { 1=SecSign, 2=SecDeviceToken, 3=SecExtra }; 仅非空编码 (protobuf-net 默认)
function encodeSecInfo(signResult: SignResult): Buffer {
  const secParts: Buffer[] = []
  if (signResult.sign.length > 0) secParts.push(encodeLengthDelimited(1, signResult.sign))
  if (signResult.token.length > 0) secParts.push(encodeLengthDelimited(2, signResult.token))
  if (signResult.extra.length > 0) secParts.push(encodeLengthDelimited(3, signResult.extra))
  return encodeLengthDelimited(24, Buffer.concat(secParts))
}

// NT 最小 reserve (Linux/Windows): field 15 (TraceParent) / 16 (Uid) / 24 (SecInfo), 升序。
export function buildSsoReservedField(uid?: string, signResult?: SignResult | null): Buffer {
  const parts: Buffer[] = []
  parts.push(encodeString(15, generateTraceParent()))
  if (uid) parts.push(encodeString(16, uid))
  if (signResult) parts.push(encodeSecInfo(signResult))
  return Buffer.concat(parts)
}

// macOS reserve (真机 trans_emp 逐字段实测, macOS/PoC/src/main.rs build_reserve):
//   f9=1 f12=guid f14=1 f15=TraceParent(00-前缀) [f16=uid] f18=0 f19=1 f20=1 f21=2
//   f23={1:"client_conn_seq",2:ts} f24=SecInfo f26=100 f28=3 f34=1
export function buildMacosReservedField(guidHex: string, uid?: string, signResult?: SignResult | null): Buffer {
  const parts: Buffer[] = []
  parts.push(encodeVarintField(9, 1))
  parts.push(encodeString(12, guidHex))
  parts.push(encodeVarintField(14, 1))
  parts.push(encodeString(15, generateTraceParent('00')))
  if (uid) parts.push(encodeString(16, uid))
  parts.push(encodeVarintField(18, 0))
  parts.push(encodeVarintField(19, 1))
  parts.push(encodeVarintField(20, 1))
  parts.push(encodeVarintField(21, 2))
  const ccs = Buffer.concat([
    encodeString(1, 'client_conn_seq'),
    encodeString(2, Math.floor(Date.now() / 1000).toString()),
  ])
  parts.push(encodeLengthDelimited(23, ccs))
  if (signResult) parts.push(encodeSecInfo(signResult))
  parts.push(encodeVarintField(26, 100))
  parts.push(encodeVarintField(28, 3))
  parts.push(encodeVarintField(34, 1))
  return Buffer.concat(parts)
}

// watch reserve (Android-NT, watch/poc/src/main.rs build_watch_reserve):
//   [f12=qimei36 若有] f15=TraceParent(01-) [f16=uid] f21=32 f24=SecInfo f26=100
// f21/f26 是 Android NT marker (缺则 NT 登录命令 -10122)。qimei36 为空时省 f12 (pre-qimei trans_emp)。
export function buildWatchReservedField(uid?: string, signResult?: SignResult | null, qimei36: string = ''): Buffer {
  const parts: Buffer[] = []
  if (qimei36) parts.push(encodeString(12, qimei36))
  parts.push(encodeString(15, generateTraceParent('01')))
  if (uid) parts.push(encodeString(16, uid))
  parts.push(encodeVarintField(21, 32))
  if (signResult) parts.push(encodeSecInfo(signResult))
  parts.push(encodeVarintField(26, 100))
  return Buffer.concat(parts)
}

/** 按 profile.reserveVariant 选 reserve 构造器。guidHex/qimei36 仅部分变体用到。 */
export function buildReservedFieldForVariant(
  variant: ReserveVariant,
  uid?: string,
  signResult?: SignResult | null,
  opts: { guidHex?: string; qimei36?: string } = {},
): Buffer {
  switch (variant) {
    case 'macos':
      return buildMacosReservedField(opts.guidHex ?? '', uid, signResult)
    case 'watch':
      return buildWatchReservedField(uid, signResult, opts.qimei36 ?? '')
    case 'nt':
    default:
      return buildSsoReservedField(uid, signResult)
  }
}
