import { createHash } from 'node:crypto'
import { TlvWriter, writeString16, writeBytes16 } from '../tlv'
import { teaEncrypt } from '../tea'
import { WATCH_PROFILE as P } from '../profiles/watch'

// 所有 watch TLV 逐字节移植自 LuckyLillia.Sign/src/Android/watch/poc/src/main.rs。
// 常量出处见 profile watch.ts + 各 fn 注释。tlv_pack 格式 == Bot TlvWriter (u16 count + [tag,len,data])。

const APK_SIG_MD5 = P.watch!.apkSignMd5
const DEV_OS = 'android'          // T128 os
const DEV_NAME = 'LuckyLillia-Watch'
const T100_MAIN_SIG_MAP = 16724722 // T100 专用 (exe A8A434); 与 T1D 的 P.mainSigMap(16252796) 不同
const BUILD_TIME = P.sdkBuildTime  // T177 = 1724730201
const T116_MISC = P.miscBitmapT116 // 150470524
const DOMAINS = [
  'tenpay.com', 'openmobile.qq.com', 'docs.qq.com', 'connect.qq.com',
  'qzone.qq.com', 'vip.qq.com', 'gamecenter.qq.com', 'qun.qq.com',
  'game.qq.com', 'qqweb.qq.com', 'office.qq.com', 'ti.qq.com',
  'mail.qq.com', 'mma.qq.com',
]

const md5 = (data: Buffer): Buffer => createHash('md5').update(data).digest()
const u32 = (v: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b }
const u16 = (v: number): Buffer => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b }

// ---- trans_emp fetch TLVs ----

// T16: u32(5) + u32(appId=16) + u32(routing headAppId) + guid + str1=pkg + str2=ptVer + str3=APK sig MD5
function tlv16(guid: Buffer): Buffer {
  return Buffer.concat([
    u32(5), u32(P.appId), u32(P.watch!.headAppId), guid,
    writeString16(P.packageName), writeString16(P.ptVersion), writeBytes16(APK_SIG_MD5),
  ])
}
function tlv1b(): Buffer {
  return Buffer.concat([u32(0), u32(0), u32(3), u32(4), u32(72), u32(2), u32(2), u16(0)])
}
function tlv1d(): Buffer {
  return Buffer.concat([Buffer.from([1]), u32(P.mainSigMap), u32(0), Buffer.from([0])])
}
// T1F device/os report: u8(isRoot) + i16(osType) + i16(osVer) + u16(net) + i16(sim) + i16(reserved) + i16(apn)
function tlv1f(): Buffer {
  return Buffer.concat([
    Buffer.from([0]),
    writeBytes16(Buffer.from('android')), writeBytes16(Buffer.from('10')),
    u16(2),
    writeBytes16(Buffer.alloc(0)), writeBytes16(Buffer.alloc(0)), writeBytes16(Buffer.from('wifi')),
  ])
}
// TD1 proto { 1: { 1: devType="Watch", 2: devName }, 4: bytes(30 01) }
function tlvD1(devName: string): Buffer {
  const pbStr = (field: number, s: Buffer): Buffer =>
    Buffer.concat([Buffer.from([(field << 3) | 2, s.length]), s])
  const inner = Buffer.concat([pbStr(1, Buffer.from('Watch')), pbStr(2, Buffer.from(devName))])
  return Buffer.concat([pbStr(1, inner), pbStr(4, Buffer.from([0x30, 0x01]))])
}

/** trans_emp 0x31 fetch 的 TLV pack (8 个)。*/
export function buildWatchFetchTlvs(guid: Buffer): Buffer {
  const w = new TlvWriter()
  w.addTlv(0x16, tlv16(guid))
  w.addTlv(0x1B, tlv1b())
  w.addTlv(0x1D, tlv1d())
  w.addTlv(0x1F, tlv1f())
  w.addTlv(0x33, guid)
  w.addTlvUint32(0x35, P.ssoVersionTransEmp) // = 8 (device-risk 值)
  w.addTlvUint32(0x66, P.ssoVersionTransEmp)
  w.addTlv(0xD1, tlvD1(DEV_NAME))
  return w.build()
}

// ---- wtlogin.login TLVs (21 个) ----

function tlv147(): Buffer {
  return Buffer.concat([u32(P.watch!.loginAppId), writeString16(P.ptVersion), writeBytes16(APK_SIG_MD5)])
}
function tlv128(guid: Buffer): Buffer {
  return Buffer.concat([
    u16(0), Buffer.from([0, 1, 0]), u32(0),
    writeString16(DEV_OS), writeBytes16(guid), writeString16(''),
  ])
}
function tlv116(): Buffer {
  return Buffer.concat([Buffer.from([0]), u32(T116_MISC), u32(P.subSigMap), Buffer.from([0])])
}
function tlv18(uin: number): Buffer {
  return Buffer.concat([u16(0), u32(5), u32(0), u32(8001), u32(uin), u16(0), u16(0)])
}
function tlv141(): Buffer {
  const unknown = Buffer.from('Unknown')
  return Buffer.concat([u32(unknown.length), unknown, u16(0), writeString16('')])
}
function tlv177(): Buffer {
  return Buffer.concat([Buffer.from([1]), u32(BUILD_TIME), writeString16(P.wtLoginSdk)])
}
function tlv100(): Buffer {
  return Buffer.concat([
    u16(1), u32(P.ssoVersion), u32(P.watch!.loginAppId), u32(P.subAppId),
    u32(P.appClientVersion), u32(T100_MAIN_SIG_MAP),
  ])
}
function tlv8(): Buffer {
  return Buffer.concat([u16(0), u32(2052), u16(0)])
}
function tlv511(): Buffer {
  const parts: Buffer[] = [u16(DOMAINS.length)]
  for (const d of DOMAINS) parts.push(Buffer.concat([Buffer.from([0x01]), u16(d.length), Buffer.from(d)]))
  return Buffer.concat(parts)
}

export interface WatchLoginInputs {
  uin: number
  guid: Buffer
  tgtgtKey: Buffer
  tempPassword: Buffer
  noPicSig: Buffer
  q16: string
  androidId: string
}

/** wtlogin.login body: u16(0x09) + tlv_pack([21 TLV])。*/
export function buildWatchLoginBody(i: WatchLoginInputs): Buffer {
  // 内层 T144 = TEA(tgtgtKey, tlv_pack([16E devName, 147, 128, 124]))
  const inner = new TlvWriter()
  inner.addTlv(0x16E, Buffer.from(DEV_NAME))
  inner.addTlv(0x147, tlv147())
  inner.addTlv(0x128, tlv128(i.guid))
  inner.addTlv(0x124, Buffer.alloc(12))
  const enc144 = Buffer.from(teaEncrypt(inner.build(), i.tgtgtKey))

  const mac = Buffer.from([0x02, 0, 0, 0, 0, 0]) // md5 进 T187; 非版本 gate
  const t142 = Buffer.concat([u16(0), writeString16(P.packageName)])
  const t107 = Buffer.concat([u16(1), Buffer.from([0]), u16(0x0d), Buffer.from([1])])
  const t521 = Buffer.concat([u32(P.watch!.deviceType), u16(0)]) // device_type=8, 空串

  const w = new TlvWriter()
  w.addTlv(0x018, tlv18(i.uin))
  w.addTlv(0x106, i.tempPassword)
  w.addTlv(0x116, tlv116())
  w.addTlv(0x100, tlv100())
  w.addTlv(0x107, t107)
  w.addTlv(0x142, t142)
  w.addTlv(0x144, enc144)
  w.addTlv(0x145, i.guid)
  w.addTlv(0x147, tlv147())
  w.addTlv(0x154, u32(1))
  w.addTlv(0x141, tlv141())
  w.addTlv(0x008, tlv8())
  w.addTlv(0x511, tlv511())
  w.addTlv(0x187, md5(mac))
  w.addTlv(0x188, md5(Buffer.from(i.androidId)))
  w.addTlvUint8(0x191, 0)
  w.addTlv(0x177, tlv177())
  w.addTlv(0x516, u32(0))
  w.addTlv(0x521, t521)
  w.addTlv(0x16A, i.noPicSig)
  w.addTlv(0x545, Buffer.from(i.q16))

  return Buffer.concat([u16(0x09), w.build()])
}
