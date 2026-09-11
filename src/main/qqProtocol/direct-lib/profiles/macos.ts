import type { ProtocolProfile } from './types'
import { WTLOGIN_SERVER_PUB_192K1 } from './linux'

// macOS SSO head 专属固定常量 (真机 trans_emp 明文对拍实证, macOS/PoC/src/main.rs:429-437):
//   [off8]=0x2007C26B 替代 subAppId 槽, [off12]=0x20027635 替代 2052 槽,
//   FIXED_HEADER 首字节 0x01 (非桌面 0x02), 第 11 字节 0x01。
const MACOS_HEAD_FIELD8 = 0x2007c26b
const MACOS_HEAD_FIELD12 = 0x20027635
const MACOS_FIXED_HEADER = Buffer.from([0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0])

// macOS QQNT 7.0.0-52194。值溯源: LuckyLillia.Sign/src/macOS/PoC/src/appinfo.rs
// + docs/Linux/appinfo-cross-platform.md §6。与 Windows 同 NT 流程/曲线, SSO head 结构性不同。
export const MACOS_PROFILE: ProtocolProfile = {
  name: 'macos',
  family: 'nt',

  appId: 1600001602,       // sub_6654E8 硬编码 (变体 1600001627 按登录类型, 这里用发码分支)
  subAppId: 537296002,     // wtlogin 登录用 (不是 UA/o3 的 537379435)
  appIdQrCode: 1600001602,
  mainSigMap: 169742560,
  subSigMap: 0,
  miscBitmap: 0x7FFC,      // T1D +12 硬编码 (macOS MISC_BIT_MAP)
  miscBitmapT116: 12058620,
  ssoVersion: 23,
  ssoVersionTransEmp: 23,  // trans_emp T35/T66 (sub_61D788)
  appClientVersion: 52194,
  qua: 'V1_MAC_NQ_7.0.0_52194_GW_B',
  packageName: 'com.tencent.qq',
  ptVersion: '2.0.0',
  wtLoginSdk: 'nt.wtlogin.0.0.1',
  ntLoginType: 1,
  currentVersion: '7.0.0-52194',
  buildVer: '7.0.0-52194',
  sdkBuildTime: 0,

  os: 'Mac',
  kernel: 'Darwin',
  vendorOs: 'mac',
  devType: 'Mac',
  osVer: 'macOS 14.6',     // TODO 真机采集核实 (非登录关键)
  systemKernel: '23.6.0',  // TODO 真机采集核实 (SsoInfoSync field3, Darwin kernel ver)
  vendorName: '',
  vendorOsName: 'mac',
  imPlat: 1,

  wtLoginCurve: 'secp192k1',
  wtLoginCipherSuite: 0x0102,
  wtLoginServerPub: WTLOGIN_SERVER_PUB_192K1,
  wtLoginFrameByte: 23,
  wtLoginFrameVer: 0x3374,

  ssoProtocolVersion: 12,
  // ★ SSO head 结构性差异: 三个 override + macOS reserve 字段序
  ssoHeadField8: MACOS_HEAD_FIELD8,
  ssoHeadField12: MACOS_HEAD_FIELD12,
  ssoFixedHeader: MACOS_FIXED_HEADER,
  reserveVariant: 'macos',
}
