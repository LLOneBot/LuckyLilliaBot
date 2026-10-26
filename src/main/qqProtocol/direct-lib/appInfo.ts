import { createHash } from 'node:crypto'
import { getActiveProfile } from './profiles'
import { loadMachineGuidSync } from './machineGuid'

// 当前协议 profile 的扁平视图, 模块加载时解析一次 (协议在进程内不变)。要按 family 分支的直接用 getActiveProfile()
const p = getActiveProfile()

export const AppInfo = {
  os: p.os,
  kernel: p.kernel,
  vendorOs: p.vendorOs,
  currentVersion: p.currentVersion,
  buildVer: p.buildVer,
  miscBitmap: p.miscBitmap,
  ptVersion: p.ptVersion,
  ssoVersion: p.ssoVersion,
  packageName: p.packageName,
  wtLoginSdk: p.wtLoginSdk,
  appId: p.appId,
  subAppId: p.subAppId,
  appIdQrCode: p.appIdQrCode,
  mainSigMap: p.mainSigMap,
  subSigMap: p.subSigMap,
  ntLoginType: p.ntLoginType,
  appClientVersion: p.appClientVersion,
  qua: p.qua,
}

// SsoInfoSync device f1 / T16E / TlvD1 f1.f2 = 主机名。写死一个会让所有部署聚成一簇, 所以从 machine guid 派生,
// 形状取 Windows 装机默认名 `DESKTOP-` + 7 位大写字母数字 (WSL2 主机名继承 Windows 机器名, 跟 WSL2 内核串自洽)。
// 不能含 "docker": 真机拿 gethostname 做 strstr("docker") 判定容器。macOS 用 LLBOT_DEV_NAME 覆盖。改派生盐 = 换设备名
const DEV_NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function synthDevName(): string {
  const h = createHash('sha256').update('llbot-devname-v1').update(loadMachineGuidSync()).digest()
  let v = h.readBigUInt64BE(0)
  let suffix = ''
  for (let i = 0; i < 7; i++) {
    suffix += DEV_NAME_ALPHABET[Number(v % 36n)]
    v /= 36n
  }
  return `DESKTOP-${suffix}`
}

export const DeviceInfo = {
  devType: p.devType,
  get devName(): string {
    return process.env.LLBOT_DEV_NAME?.trim() || synthDevName()
  },
  osVer: p.osVer,
  vendorName: p.vendorName,
  vendorOsName: p.vendorOsName,
  systemKernel: p.systemKernel,
}
