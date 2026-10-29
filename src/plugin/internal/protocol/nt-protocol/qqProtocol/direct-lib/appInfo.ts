import { createHash } from 'node:crypto'
import { getActiveProfile } from './profiles'
import { loadMachineGuidSync } from './machineGuid'

// The current protocol profile, flat. Read on access: until the pure protocol has a client, the protocol follows
// the NT protocol plugin's settings. Branch on the family with getActiveProfile()
export const AppInfo = {
  get os() { return getActiveProfile().os },
  get kernel() { return getActiveProfile().kernel },
  get vendorOs() { return getActiveProfile().vendorOs },
  get currentVersion() { return getActiveProfile().currentVersion },
  get buildVer() { return getActiveProfile().buildVer },
  get miscBitmap() { return getActiveProfile().miscBitmap },
  get ptVersion() { return getActiveProfile().ptVersion },
  get ssoVersion() { return getActiveProfile().ssoVersion },
  get packageName() { return getActiveProfile().packageName },
  get wtLoginSdk() { return getActiveProfile().wtLoginSdk },
  get appId() { return getActiveProfile().appId },
  get subAppId() { return getActiveProfile().subAppId },
  get appIdQrCode() { return getActiveProfile().appIdQrCode },
  get mainSigMap() { return getActiveProfile().mainSigMap },
  get subSigMap() { return getActiveProfile().subSigMap },
  get ntLoginType() { return getActiveProfile().ntLoginType },
  get appClientVersion() { return getActiveProfile().appClientVersion },
  get qua() { return getActiveProfile().qua },
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
  get devType() { return getActiveProfile().devType },
  get devName(): string {
    return process.env.LLBOT_DEV_NAME?.trim() || synthDevName()
  },
  get osVer() { return getActiveProfile().osVer },
  get vendorName() { return getActiveProfile().vendorName },
  get vendorOsName() { return getActiveProfile().vendorOsName },
  get systemKernel() { return getActiveProfile().systemKernel },
}
