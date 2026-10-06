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
// flags 后缀 (真机 Linux 3.2.28 实测): wtlogin.* = '01' (sampled), 其它业务命令 = '00'。
// 默认 '01' 保持 nt/macos/watch 各端旧行为不变。
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

// Windows NT reserve, 升序 field 12/13/15/16/23/24/26 (真机 Windows 逐字段, poc-vs-linux-packet-structure.md):
//   f12=guid(32hex) f13=`6a 01 00`(wire-type2, 1B=0x00; 非 varint!) f15=TraceParent(00-前缀)
//   f16=uid f23={1:"client_conn_seq",2:ts} f24=SecInfo(签名命令才有) f26=`d0 01 65`(=101)
// ★ 仅 Windows: 真机 Linux reserve 没有 f13/f15(见 buildLinuxReservedField), 别让 Linux 共用本函数。
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

// Linux NT reserve (真机 QQ 3.2.28 全量 D2Key 解密抓包逐命令实证, 2026-10-05):
//   f13+f15 (TraceParent): 真机**几乎所有命令都带**, 唯独 o3 (ESK/SA/SsoReport, 即 trpc.o3.*) 不带。
//     f15 flags 后缀: wtlogin.* = '01', 其它业务 (SsoInfoSync/SsoHeartBeat/Oidb) = '00'。
//   f16 (uid): 登录后所有命令都带, 唯 ESK 例外不带。
//   f24 (SecInfo/sign): 看命令是否在 SIGN_REQUIRED (trans_emp/login/ESK/SA/SsoReport + 部分 Oidb 带;
//     SsoInfoSync / 多数 Oidb 不签 = 无 f24)。
//   实测形状 (reserve 升序 12/13/15/16/23/24/26):
//     trans_emp/login [12,13,15,23,24,26]{sign,extra} | ESK [12,23,24,26]{sign,extra} |
//     SA·SsoReport [12,16,23,24,26]{sign,token,extra} | SsoInfoSync·多数Oidb [12,13,15,16,23,26] 无 f24。
// 溯源 docs/Linux/o3-traffic-live-capture.md。
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
  // f13+f15 真机在所有**非 o3** 命令上都带 (不只 wtlogin); o3 (ESK/SA/SsoReport) 不带。
  // flags: wtlogin='01' (sampled), 其它业务='00' (真机 3.2.28 实测)。
  if (!isO3) {
    parts.push(encodeLengthDelimited(13, Buffer.from([0x00])))
    parts.push(encodeString(15, generateTraceParent('00', isWtlogin ? '01' : '00')))
  }
  // ESK 例外: 真机 ESK reserve 不带 uid(f16), 哪怕此时 login 已返回 uid (scan.pcap+qq.pcap 两次
  // 实测 ESK reserve=171 字段 [12,23,24,26])。带上会比真机多 27B/多一字段 = 可被服务端指纹区分;
  // SA 及 trpc.* 业务命令才带 f16。
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
  opts: { guidHex?: string; qimei36?: string; cmd?: string } = {},
): Buffer {
  switch (variant) {
    case 'macos':
      return buildMacosReservedField(opts.guidHex ?? '', uid, signResult)
    case 'watch':
      return buildWatchReservedField(uid, signResult, opts.qimei36 ?? '')
    case 'linux': {
      const cmd = opts.cmd ?? ''
      // ConfigPushSvc.PushResp uses the minimal reserve [12,16,23,26] (no TraceParent, unsigned) -
      // same f13/f15-less shape as o3 cmds; byte-verified vs the real capture (2026-10-06).
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
