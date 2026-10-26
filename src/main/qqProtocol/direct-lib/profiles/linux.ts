import type { ProtocolProfile } from './types'

// Windows / macOS 同一把
const WTLOGIN_SERVER_PUB_192K1 = Buffer.from(
  '04928D8850673088B343264E0C6BACB8496D697799F37211DEB25BB73906CB089FEA9639B4E0260498B51A992D50813DA8',
  'hex',
)

// Linux QQNT 3.2.28-48517
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
  // SsoInfoSync device f3 = `uname -v`, not `uname -r`
  systemKernel: '#1 SMP Tue Nov 5 00:21:55 UTC 2024',
  vendorName: '',
  vendorOsName: 'linux',
  imPlat: 1,

  wtLoginCurve: 'secp192k1',
  wtLoginCipherSuite: 0x0102,
  wtLoginServerPub: WTLOGIN_SERVER_PUB_192K1,

  // 真机帧头 `1300 003374`: frameVer 是固定的 0x3374, 不是 appClientVersion
  wtLoginFrameByte: 19,
  wtLoginFrameVer: 13172,

  ssoProtocolVersion: 12,
  reserveVariant: 'linux',
}

export { WTLOGIN_SERVER_PUB_192K1 }
