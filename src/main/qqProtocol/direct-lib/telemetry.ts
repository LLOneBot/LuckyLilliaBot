// Post-login telemetry, byte-aligned to a real QQ 3.2.28 capture: after SsoInfoSync a real client sends
// getNewFlag + ClientReport + 0x102a_0 every ~316s, and a connection with only heartbeats gets invalidated
// (KickNT 1001). Only uin and timestamps are substituted; the other constants are specific to 3.2.28.

import { createHash, randomBytes } from 'node:crypto'
import { AppInfo } from './appInfo'

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
// ClientReport uses the full "3.2.28-48517". Read when sent, once the profile is settled.
const versionFull = () => AppInfo.buildVer
const versionShort = () => versionFull().split('-')[0]

// Client build numbers of 3.2.28-48517, from the capture
const BUILD_A = '140163'
const BUILD_B = '140148'
// f2 appset id, constant in real getNewFlag/ClientReport.
const APPSET = 1031

export const TELEMETRY_CMDS = {
  getNewFlag: 'QQClubComm.getNewFlag',
  clientReport: 'RedTouchSvc.ClientReport',
  psKey: 'OidbSvcTrpcTcp.0x102a_0',
} as const

// Only f4 (uin) is account-specific. Not signed
export function buildGetNewFlag(uin: number): Buffer {
  return Buffer.concat([
    protoVarintField(1, 1),
    protoVarintField(2, APPSET),
    protoStringField(3, versionShort()),
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

// 0x102a_0, signed (on the whitelist). Always ret=0, so it is the safe backbone of a round
export function buildPsKey(domain = 'mail.qq.com'): Buffer {
  return Buffer.concat([
    protoVarintField(1, 0x102a),
    protoVarintField(2, 0),
    protoMessageField(4, protoStringField(1, domain)),
    protoVarintField(12, 1),
  ])
}

// Red-dot report replayed from the capture; only uin (f1, the f8 trace_id) and the timestamps change. Not signed
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
    protoStringField(3, versionFull()),
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

// Aux telemetry from the login capture: real QQ sends it every 26-30 min, so it has its own slow loop

export const AUX_TELEMETRY_CMDS = {
  psKey102a1: 'OidbSvcTrpcTcp.0x102a_1',
  oidb116d1: 'OidbSvcTrpcTcp.0x116d_1',
  oidb9067202: 'OidbSvcTrpcTcp.0x9067_202',
  ssoGetConfig: 'trpc.group_pro.configdistribution.ConfigDistributionSvr.SsoGetConfig',
} as const

// 0x102a_1: psKey with an empty domain, all constant. Signed on real, and on the whitelist
export function buildPsKey102a1(): Buffer {
  return Buffer.concat([
    protoVarintField(1, 0x102a),
    protoVarintField(2, 1),
    protoMessageField(4, Buffer.alloc(0)),
    protoVarintField(12, 0),
  ])
}

// Unsigned on real, but in the 532-entry superset, so it gets signed (see cmd.ts EFFECTIVE_SIGN)
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

// Fully constant on real, unsigned
export function build9067202(): Buffer {
  return Buffer.from(
    '08e7a00210ca0122230a190a05080610ca01120ca80602b00601b80600c00c001a0208022206080a081410006001',
    'hex',
  )
}

// SsoGetConfig (UnitedConfig, from wrapper.node united_config_worker): "send config groups 10006 / 10020 newer
// than my cached versions". Unsigned; the ids are not checked against the device. Values for a fresh client:
//   f3.f3.2: kernel release (uname -r); f7 x2: keys 10006 / 10020; f5.f6/f7: cached versions = 0 (no cache);
//   f5.f4 / f5.f5: per-request nonce / trace id; f11: per-install client id = md5(guid).
// The returned config is ignored; the point is the pull.
const KERNEL_RELEASE = process.env.LLBOT_KERNEL_RELEASE?.trim() || '5.15.167.4-microsoft-standard-WSL2'

function md5hex(s: string): string {
  return createHash('md5').update(s).digest('hex')
}

export function buildSsoGetConfig(guidHex: string): Buffer {
  const nonce = randomBytes(8).readBigUInt64BE() & 0x7fffffffffffffffn
  const traceId = randomBytes(16).toString('hex')
  const clientId = md5hex(guidHex)
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
    protoMessageField(10, protoStringField(2, versionFull())),
    protoStringField(11, clientId),
  ])
}
