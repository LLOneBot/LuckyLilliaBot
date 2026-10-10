// Post-login telemetry bodies, byte-aligned to the real QQ 3.2.28 steady-state capture
// (2026-10-05). A real client, after SsoInfoSync, keeps emitting these every ~316s:
// QQClubComm.getNewFlag + RedTouchSvc.ClientReport + OidbSvcTrpcTcp.0x102a_0 (psKey). The Bot
// used to send nothing but heartbeats after login = a silent connection, the strongest
// "non-genuine client" signal for server-side risk invalidation (KickNT 1001 "登录已失效").
// These builders reproduce the real wire bodies with only uin + timestamps substituted; the
// campaign/build constants are carried verbatim from the capture (version-specific to 3.2.28).

import { createHash, randomBytes } from 'node:crypto'
import { AppInfo } from './appInfo'

// --- Protobuf encoding helpers (same shape as online.ts; kept local so this file is self-contained) ---

function encodeVarint(value: number | bigint): Buffer {
  const bytes: number[] = []
  let v = typeof value === 'bigint' ? value : BigInt(value)
  if (v === 0n) {
    bytes.push(0)
  } else {
    while (v > 0n) {
      const b = Number(v & 0x7fn)
      v >>= 7n
      bytes.push(v > 0n ? b | 0x80 : b)
    }
  }
  return Buffer.from(bytes)
}

function protoTag(field: number, wireType: number): Buffer {
  return encodeVarint((field << 3) | wireType)
}

function protoVarintField(field: number, value: number | bigint): Buffer {
  return Buffer.concat([protoTag(field, 0), encodeVarint(value)])
}

function protoStringField(field: number, value: string): Buffer {
  const data = Buffer.from(value, 'utf-8')
  return Buffer.concat([protoTag(field, 2), encodeVarint(data.length), data])
}

function protoMessageField(field: number, content: Buffer): Buffer {
  return Buffer.concat([protoTag(field, 2), encodeVarint(content.length), content])
}

// Version strings as the real client splits them: getNewFlag uses the short "3.2.28",
// ClientReport uses the full "3.2.28-48517".
const VERSION_FULL = AppInfo.buildVer // "3.2.28-48517"
const VERSION_SHORT = VERSION_FULL.split('-')[0] // "3.2.28"

// Internal QQ client build numbers, constant for 3.2.28-48517 (verbatim from real capture).
const BUILD_A = '140163'
const BUILD_B = '140148'
// f2 appset id, constant in real getNewFlag/ClientReport.
const APPSET = 1031

export const TELEMETRY_CMDS = {
  getNewFlag: 'QQClubComm.getNewFlag',
  clientReport: 'RedTouchSvc.ClientReport',
  psKey: 'OidbSvcTrpcTcp.0x102a_0',
} as const

// QQClubComm.getNewFlag — 68B on real. Only f4=uin is account-specific; the rest are static
// client constants. Not signed (on neither sign list -- see cmd.ts SIGN_REQUIRED).
export function buildGetNewFlag(uin: number): Buffer {
  return Buffer.concat([
    protoVarintField(1, 1),
    protoVarintField(2, APPSET),
    protoStringField(3, VERSION_SHORT),
    protoVarintField(4, uin),
    protoStringField(7, BUILD_A),
    protoStringField(7, BUILD_B),
    protoVarintField(9, 0),
    protoVarintField(10, 0),
    protoStringField(11, ''),
    protoVarintField(12, 103),
    protoVarintField(14, 0),
    protoVarintField(15, 1),
    protoVarintField(16, 0),
    protoStringField(17, ''),
    protoVarintField(18, 0),
    protoVarintField(19, 1),
    protoVarintField(21, 1),
    protoVarintField(23, 0),
    protoStringField(24, ''),
  ])
}

// OidbSvcTrpcTcp.0x102a_0 — psKey fetch for a domain (real: "mail.qq.com"), 22B. Signed
// (0x102a_0 is on the whitelist; sendCommand signs it automatically). Genuinely useful +
// always ret=0, so it is the safe backbone of the telemetry round.
export function buildPsKey(domain = 'mail.qq.com'): Buffer {
  return Buffer.concat([
    protoVarintField(1, 0x102a),
    protoVarintField(2, 0),
    protoMessageField(4, protoStringField(1, domain)),
    protoVarintField(12, 1),
  ])
}

// RedTouchSvc.ClientReport — red-dot telemetry, ~571B. Faithful replay of the real body with
// uin (f1 + the f8 trace_id) and the two timestamps refreshed; campaign ids / hash / policy are
// carried verbatim (the server just logs the red-dot "show" event, returns ret=0). Not signed.
export function buildClientReport(uin: number, nowMs = Date.now()): Buffer {
  const epochSec = Math.floor(nowMs / 1000)
  const showJson =
    `{"_show_mission":"2810203","ad_id":2810203,"parent_appset":1002,` +
    `"parent_exist":1,"pos_id":1506,"trace_id":"vab_red-140148-0-${epochSec}","trace_num":1}`
  const ctrJson =
    `{"as_ts":17.23,"busi_id":"\${pc_small_reddot}$","p_ctr":1.1111798286437988,` +
    `"p_size":1,"pack_time":0,"policy_id":12959027,"prc_size":2,"rc_size":2,` +
    `"red_level":1,"tianshu_footageid":1341787}`
  const kv = (k: string, v: string) =>
    protoMessageField(8, Buffer.concat([protoStringField(1, k), protoStringField(2, v)]))
  return Buffer.concat([
    protoVarintField(1, uin),
    protoVarintField(2, APPSET),
    protoStringField(3, VERSION_FULL),
    protoStringField(4, ''),
    protoVarintField(5, Number(BUILD_B)),
    protoStringField(6, '2810203'),
    protoStringField(7, showJson),
    kv('trace_id', `${uin}_${nowMs}`),
    kv('position_id', '1002_0'),
    kv('num', '0'),
    kv('version', '0'),
    kv('hash', '9ab91ddbd95b6e4b4c05257d24964bef'),
    kv('redType', '0'),
    kv('qimei', ''),
    kv('path', BUILD_B),
    kv('exp_remain', '998'),
    protoVarintField(10, 30),
    protoVarintField(11, 0),
    protoStringField(12, ctrJson),
  ])
}

// --- Low-frequency aux telemetry, byte-aligned to the real QQ 3.2.28 LOGIN capture (2026-10-06).
// Real 691 emits these sporadically (~once per 26-30 min), not every main round; the Bot never sent
// them. Same "genuine-client completeness" surface as the main round. Sent from a separate slow loop.

export const AUX_TELEMETRY_CMDS = {
  psKey102a1: 'OidbSvcTrpcTcp.0x102a_1',
  oidb116d1: 'OidbSvcTrpcTcp.0x116d_1',
  oidb9067202: 'OidbSvcTrpcTcp.0x9067_202',
  ssoGetConfig: 'trpc.group_pro.configdistribution.ConfigDistributionSvr.SsoGetConfig',
} as const

// OidbSvcTrpcTcp.0x102a_1 — psKey variant (empty-domain query), 9B, all-constant. Signed on real
// (f24 present); 0x102a_1 is on the sign whitelist so sendCommand signs it automatically.
export function buildPsKey102a1(): Buffer {
  return Buffer.concat([
    protoVarintField(1, 0x102a),
    protoVarintField(2, 1),
    protoMessageField(4, Buffer.alloc(0)),
    protoVarintField(12, 0),
  ])
}

// OidbSvcTrpcTcp.0x116d_1 — 46B, carries the account uid. Unsigned on real (no f24), but it IS
// in the restored 532-entry superset, so sendCommand signs it -- a known deviation from the
// capture (see cmd.ts SIGN_REQUIRED).
export function build116d1(uid: string): Buffer {
  const inner = Buffer.concat([
    protoStringField(1, uid),
    protoVarintField(5, 1),
    protoVarintField(7, 0),
    protoVarintField(100, 0),
    protoVarintField(101, 400),
  ])
  return Buffer.concat([
    protoVarintField(1, 0x116d),
    protoVarintField(2, 1),
    protoMessageField(4, inner),
    protoVarintField(12, 0),
  ])
}

// OidbSvcTrpcTcp.0x9067_202 — rkey-ish fetch, 46B, fully constant on real (no device/session
// fields). Unsigned. Replayed verbatim from the capture.
export function build9067202(): Buffer {
  return Buffer.from(
    '08e7a00210ca0122230a190a05080610ca01120ca80602b00601b80600c00c001a0208022206080a081410006001',
    'hex',
  )
}

// trpc.group_pro.configdistribution.ConfigDistributionSvr.SsoGetConfig = UnitedConfig login config
// fetch (reversed from wrapper.node united_config_worker, 2026-10-06): "send me config groups
// 10006/10020 newer than the versions I have cached". Unsigned; the server consumes keys+versions and
// does NOT validate the ids against device identity. Correct values for a FRESH client (no cache):
//   f1/f9/f10 + f3.f3.1=5 (fetch type) : static client head, verbatim
//   f3.f3.2                            : kernel release = uname -r (this WSL host, matches real 691)
//   f7 x2                              : requested config-group keys 10006 / 10020
//   f5.f6/f7 {1:version}               : cached version per key -> 0 (a fresh client has none; real
//                                        691's 102511 would falsely claim a cache we do not have)
//   f5.f4 (64b) / f5.f5 (16B hex)      : per-request nonce / trace id -> fresh random each call
//   f11 (16B hex)                      : stable-per-install client id -> md5(guid)
// The Bot ignores the returned config (dispatcher no-ops config pushes); the point is the pull.
const KERNEL_RELEASE = process.env.LLBOT_KERNEL_RELEASE?.trim() || '5.15.167.4-microsoft-standard-WSL2'

function md5hex(s: string): string {
  return createHash('md5').update(s).digest('hex')
}

export function buildSsoGetConfig(guidHex: string): Buffer {
  const nonce = randomBytes(8).readBigUInt64BE() & 0x7fffffffffffffffn // per-request
  const traceId = randomBytes(16).toString('hex') // per-request
  const clientId = md5hex(guidHex) // stable per install
  const f1 = protoMessageField(1, Buffer.concat([
    protoVarintField(1, 2),
    protoVarintField(2, 1),
    protoVarintField(3, 3),
    protoVarintField(4, 1282),
  ]))
  const f3 = protoMessageField(3, Buffer.concat([
    protoStringField(1, ''),
    protoStringField(2, ''),
    protoMessageField(3, Buffer.concat([protoVarintField(1, 5), protoStringField(2, KERNEL_RELEASE)])),
  ]))
  // f5.f6/f7 = cached version per requested key; 0 because a fresh client has no cached config.
  const f5 = protoMessageField(5, Buffer.concat([
    protoStringField(3, ''),
    protoVarintField(4, nonce),
    protoStringField(5, traceId),
    protoMessageField(6, protoVarintField(1, 0)),
    protoMessageField(7, protoVarintField(1, 0)),
  ]))
  return Buffer.concat([
    f1,
    f3,
    f5,
    protoMessageField(7, protoStringField(1, '10006')),
    protoMessageField(7, protoStringField(1, '10020')),
    protoVarintField(9, 8),
    protoMessageField(10, protoStringField(2, VERSION_FULL)),
    protoStringField(11, clientId),
  ])
}
