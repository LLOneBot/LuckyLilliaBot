import type { ProtocolProfile } from './types'

// wtlogin secp192k1 服务器公钥 (与 ecdh.ts 内联值一致; Windows/macOS 同一把)。
const WTLOGIN_SERVER_PUB_192K1 = Buffer.from(
  '04928D8850673088B343264E0C6BACB8496D697799F37211DEB25BB73906CB089FEA9639B4E0260498B51A992D50813DA8',
  'hex',
)

// Linux QQNT 3.2.28-48517。值 = 原 appInfo.ts 的 AppInfo/DeviceInfo, 保持逐字节一致。
export const LINUX_PROFILE: ProtocolProfile = {
  name: 'linux',
  family: 'nt',

  appId: 1600001615,
  subAppId: 537352510,
  appIdQrCode: 0x200000013,
  mainSigMap: 169742560,
  subSigMap: 0x10400,
  miscBitmap: 32764,
  miscBitmapT116: 12058620,
  ssoVersion: 19,
  ssoVersionTransEmp: 19,
  appClientVersion: 48517,
  qua: 'V1_LNX_NQ_3.2.28_48517_GW_B',
  packageName: 'com.tencent.qq',
  ptVersion: '2.0.0',
  wtLoginSdk: 'nt.wtlogin.0.0.1',
  ntLoginType: 1,
  currentVersion: '3.2.28-48517',
  buildVer: '3.2.28-48517',
  sdkBuildTime: 0,

  os: 'Linux',
  kernel: 'Linux',
  vendorOs: 'linux',
  devType: 'Linux',
  osVer: 'Ubuntu 22.04 LTS',
  systemKernel: '5.15.0',
  vendorName: '',
  vendorOsName: 'linux',
  imPlat: 1,

  wtLoginCurve: 'secp192k1',
  wtLoginCipherSuite: 0x0102,
  wtLoginServerPub: WTLOGIN_SERVER_PUB_192K1,

  // 保持与原 login.ts 硬编码一致 (19 / appClientVersion) -> Linux 帧逐字节不变
  wtLoginFrameByte: 19,
  wtLoginFrameVer: 48517,

  ssoProtocolVersion: 12,
  reserveVariant: 'nt',
}

export { WTLOGIN_SERVER_PUB_192K1 }
