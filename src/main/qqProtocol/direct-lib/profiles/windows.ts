import type { ProtocolProfile } from './types'
import { WTLOGIN_SERVER_PUB_192K1 } from './linux'

// Windows QQNT 9.9.33-51728。值溯源: LuckyLillia.Sign/src/Windows/poc/src/appinfo.rs
// + docs/Linux/appinfo-cross-platform.md。与 Linux 同 NT 流程/曲线, 差异见各字段。
export const WINDOWS_PROFILE: ProtocolProfile = {
  name: 'windows',
  family: 'nt',

  appId: 1600001604,
  subAppId: 537376767,
  appIdQrCode: 1600001604,
  mainSigMap: 169742560,
  subSigMap: 0,          // ★ IDA 实证 = 0 (不是照抄 Linux 的 0x10400)
  miscBitmap: 0x7FFC,    // 死字段 (T1D legacy), 仅保留 shape
  miscBitmapT116: 12058620,
  ssoVersion: 19,            // login 侧 (vestigial)
  ssoVersionTransEmp: 23,    // trans_emp T35/T66 (POC 实测)
  appClientVersion: 51728,
  qua: 'V1_WIN_NQ_9.9.33_51728_GW_B',
  packageName: 'com.tencent.qq',
  ptVersion: '2.0.0',
  wtLoginSdk: 'nt.wtlogin.0.0.1',
  ntLoginType: 1,
  currentVersion: '9.9.33-51728',
  buildVer: '9.9.33-51728',
  sdkBuildTime: 0,

  os: 'Windows',
  kernel: 'Windows_NT',
  vendorOs: 'win32',
  devType: 'Windows',
  osVer: 'Windows 10.0.19045',   // TODO 真机采集核实 (非登录关键, 仅设备列表/收藏表情 comm 显示)
  systemKernel: '10.0.19045',    // TODO 真机采集核实 (SsoInfoSync field3)
  vendorName: '',
  vendorOsName: 'windows',
  imPlat: 1,

  wtLoginCurve: 'secp192k1',
  wtLoginCipherSuite: 0x0102,
  wtLoginServerPub: WTLOGIN_SERVER_PUB_192K1,
  wtLoginFrameByte: 23,
  wtLoginFrameVer: 0x3374,   // ★ 真机固定值, 不是 appClientVersion

  ssoProtocolVersion: 12,
  reserveVariant: 'nt',
}
