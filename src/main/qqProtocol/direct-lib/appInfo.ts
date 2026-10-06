import { getActiveProfile } from './profiles'

// 兼容 shim: AppInfo/DeviceInfo 现在是"当前激活协议 profile 的扁平视图"。
// 协议进程级不变, 故模块加载时解析一次。只读常量的叶子消费者 (highway/message/dashboard...)
// 无需改动; 有 family 分支/结构性字段的文件 (login/packet/online/client) 直接吃 getActiveProfile()。
// profile 定义见 ./profiles/。
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

export const DeviceInfo = {
  devType: p.devType,
  // SsoInfoSync device f1 = 主机名 (`uname -n`). 真机 3.2.28 发 "linyuchen"; 旧的
  // sha256(machineGuid)[:6]="295781" 是合成的 6-hex 串 = 指纹尾巴。env LLBOT_DEV_NAME 可覆盖,
  // 默认对齐真机设备名 (aligned 2026-10-06)。
  get devName(): string {
    return process.env.LLBOT_DEV_NAME?.trim() || 'linyuchen'
  },
  osVer: p.osVer,
  vendorName: p.vendorName,
  vendorOsName: p.vendorOsName,
  systemKernel: p.systemKernel,
}
