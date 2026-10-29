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

// version: NT / watch '01', macOS '00'。flags: wtlogin.* '01', 其它命令 '00' (真机 Linux 3.2.28)
export function generateTraceParent(version: string = '01', flags: string = '01'): string {
  return `${version}-${randomHex(32)}-${randomHex(16)}-${flags}`
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

function encodeVarintField(fieldNumber: number, value: number): Buffer {
  return Buffer.concat([encodeTag(fieldNumber, 0), encodeVarint(value)])
}

// SecInfo (field 24): { 1=SecSign, 2=SecDeviceToken, 3=SecExtra }, 只编码非空的
function encodeSecInfo(signResult: SignResult): Buffer {
  const secParts: Buffer[] = []
  if (signResult.sign.length > 0) secParts.push(encodeLengthDelimited(1, signResult.sign))
  if (signResult.token.length > 0) secParts.push(encodeLengthDelimited(2, signResult.token))
  if (signResult.extra.length > 0) secParts.push(encodeLengthDelimited(3, signResult.extra))
  return encodeLengthDelimited(24, Buffer.concat(secParts))
}

// Windows NT reserve (真机逐字段), 升序 12/13/15/16/23/24/26: f12=guid(32hex) f13=`6a 01 00` (wire-type 2, 不是 varint)
// f15=TraceParent(00-前缀) f16=uid f23={1:"client_conn_seq",2:ts} f24=SecInfo(签名命令才有) f26=`d0 01 65`(=101)。
// 只给 Windows 用, Linux 见 buildLinuxReservedField
export function buildSsoReservedField(
  uid?: string,
  signResult?: SignResult | null,
  guidHex?: string,
): Buffer {
  const parts: Buffer[] = []
  if (guidHex) parts.push(encodeString(12, guidHex))
  parts.push(encodeLengthDelimited(13, Buffer.from([0x00])))
  parts.push(encodeString(15, generateTraceParent('00')))
  if (uid) parts.push(encodeString(16, uid))
  const ccs = Buffer.concat([
    encodeString(1, 'client_conn_seq'),
    encodeString(2, Math.floor(Date.now() / 1000).toString()),
  ])
  parts.push(encodeLengthDelimited(23, ccs))
  if (signResult) parts.push(encodeSecInfo(signResult))
  parts.push(encodeVarintField(26, 101))
  return Buffer.concat(parts)
}

// Linux NT reserve (真机 3.2.28 D2Key 解密抓包, 见 docs/Linux/o3-traffic-live-capture.md):
//   f13+f15 (TraceParent) 除 o3 (trpc.o3.*) 外都带; f16 (uid) 登录后都带, ESK 除外; f24 (SecInfo) 要签名的命令才有。
//   trans_emp/login [12,13,15,23,24,26] | ESK [12,23,24,26] | SA·SsoReport [12,16,23,24,26] | SsoInfoSync·多数Oidb [12,13,15,16,23,26]
export function buildLinuxReservedField(
  uid?: string,
  signResult?: SignResult | null,
  guidHex?: string,
  isWtlogin = false,
  isEsk = false,
  isO3 = false,
): Buffer {
  const parts: Buffer[] = []
  if (guidHex) parts.push(encodeString(12, guidHex))
  if (!isO3) {
    parts.push(encodeLengthDelimited(13, Buffer.from([0x00])))
    parts.push(encodeString(15, generateTraceParent('00', isWtlogin ? '01' : '00')))
  }
  // 真机 ESK 不带 uid, 哪怕 login 已经返回了 uid
  if (uid && !isEsk) parts.push(encodeString(16, uid))
  const ccs = Buffer.concat([
    encodeString(1, 'client_conn_seq'),
    encodeString(2, Math.floor(Date.now() / 1000).toString()),
  ])
  parts.push(encodeLengthDelimited(23, ccs))
  if (signResult) parts.push(encodeSecInfo(signResult))
  parts.push(encodeVarintField(26, 101))
  return Buffer.concat(parts)
}

// macOS reserve (真机 trans_emp 逐字段):
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

// watch reserve (Android NT): [f12=qimei36 若有] f15=TraceParent(01-) [f16=uid] f21=32 f24=SecInfo f26=100
// f21/f26 是 Android NT 的标记, 缺了 NT 登录命令回 -10122
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

export function buildReservedFieldForVariant(
  variant: ReserveVariant,
  uid?: string,
  signResult?: SignResult | null,
  opts: { guidHex?: string; qimei36?: string; cmd?: string } = {},
): Buffer {
  switch (variant) {
    case 'macos':
      return buildMacosReservedField(opts.guidHex ?? '', uid, signResult)
    case 'watch':
      return buildWatchReservedField(uid, signResult, opts.qimei36 ?? '')
    case 'linux': {
      const cmd = opts.cmd ?? ''
      // PushResp has no TraceParent either, like o3 cmds (checked against a real capture)
      const noTraceParent = cmd.includes('.o3.') || cmd === 'ConfigPushSvc.PushResp'
      return buildLinuxReservedField(
        uid,
        signResult,
        opts.guidHex,
        cmd.startsWith('wtlogin.'),
        cmd.includes('SsoEstablishShareKey'),
        noTraceParent,
      )
    }
    case 'nt':
    default:
      return buildSsoReservedField(uid, signResult, opts.guidHex)
  }
}
