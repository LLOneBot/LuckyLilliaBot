import type { ProtocolProfile } from './types'

// wtlogin P-256 服务器公钥 (65B uncompressed, watch 专属, 与桌面 secp192k1 不同)。
const WTLOGIN_SERVER_PUB_P256 = Buffer.from(
  '04EBCA94D733E399B2DB96EACDD3F69A8BB0F74224E2B44E3357812211D2E62EFBC91BB553098E25E33A799ADC7F76FEB208DA7C6522CDB0719A305180CC54A82E',
  'hex',
)

// Android watch (轻聊) 9.0.5.2533。值溯源: LuckyLillia.Sign/src/Android/watch/poc/src/main.rs
// (真机 logcat + exe A8A4xx + base.apk DEX)。Android-NT 变体: 同 trans_emp QR 流程 + NT 风格 SSO head,
// 但 P-256 wtlogin ECDH / 21 TLV / inner protocol 10 / head version 'testrevision' / watch reserve。
export const WATCH_PROFILE: ProtocolProfile = {
  name: 'watch',
  family: 'watch',

  appId: 16,               // 世代号 (login appId), 不是 16xx 路由值
  subAppId: 537258298,     // 版本 subid (SSO head field8 + T100)
  appIdQrCode: 16,
  mainSigMap: 16252796,    // T1D (exe A8A418 0xF7FF7C); 注: T100 用 16724722 (watch tlv 模块内硬编码)
  subSigMap: 0x10400,      // base.apk DEX 确认
  miscBitmap: 0x7FFC,      // 死字段, 仅 shape
  miscBitmapT116: 150470524, // T116 (exe bitmap)
  ssoVersion: 22,          // T100 (版本 gate)
  ssoVersionTransEmp: 8,   // T35/T66 (exe A8A440 device-risk 值, 不是 ssoVersion)
  appClientVersion: 0,     // watch client_ver 固定 0
  qua: 'V1_WAT_SQ_9.0.3_0_IDC_B',
  packageName: 'com.tencent.qqlite',
  ptVersion: '8.2.8',
  wtLoginSdk: '6.0.0.2564',
  ntLoginType: 0,          // watch 老 wtlogin 无此字段
  currentVersion: '9.0.5.2533',
  buildVer: '9.0.5.2533',
  sdkBuildTime: 1724730201, // T177

  os: 'android',
  kernel: 'android',
  vendorOs: 'android',
  devType: 'Watch',
  osVer: 'Android 10',
  systemKernel: '5.10.101',
  vendorName: '',
  vendorOsName: 'android',
  imPlat: 1,

  wtLoginCurve: 'secp256r1',
  wtLoginCipherSuite: 0x0131,
  wtLoginServerPub: WTLOGIN_SERVER_PUB_P256,
  wtLoginFrameByte: 0,     // watch 有独立 frame builder, 这两个字段不用
  wtLoginFrameVer: 0,

  ssoProtocolVersion: 10,      // inner frame 版本字节
  ssoHeadVersion: 'testrevision',
  reserveVariant: 'watch',

  watch: {
    headAppId: 537065138,   // 老 classic head 路由 appid (NT head 不用, 记录备查)
    loginAppId: 16,
    apkSignMd5: Buffer.from('a6b745bf24a2c277527716f6f36eb68d', 'hex'),
    deviceType: 8,
    qimeiInstanceId: '0S200MNJT807V3GE',
    appKey: '0S200MNJT807V3GE',
    fekitVer: '8.208.537',
  },
}

export { WTLOGIN_SERVER_PUB_P256 }
