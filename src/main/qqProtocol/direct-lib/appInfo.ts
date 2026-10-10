import { createHash } from 'node:crypto'
import { getActiveProfile } from './profiles'
import { loadMachineGuidSync } from './machineGuid'

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

// SsoInfoSync device f1 / 登录 T16E / TlvD1 f1.f2 = 主机名 (`uname -n`)。
//
// 真机 3.2.28 抓包是采集者本机名, 一度直接写死它 -> 所有部署上报同一个主机名, machine guid
// 的随机性被这一个常量抵掉, 服务端按 (devName, systemKernel) 一聚类就是同一簇。改回 guid 派生,
// 但形状对齐真实默认机器名, 不是旧的 sha256[:6] 六位 hex 串 (那个形状本身是指纹尾巴)。
//
// 形状取 Windows 装机默认名 `DESKTOP-` + 7 位大写字母数字: WSL2 的 Linux 主机名默认继承 Windows
// 机器名, 跟本 profile 的 WSL2 内核串 (telemetry.ts KERNEL_RELEASE) 自洽; 36^7 组合不聚簇;
// 不含 "docker" -- 真机 thread#4 拿 gethostname 做 strstr("docker") 容器判定
// (LuckyLillia.Sign/docs/Linux/anti-detection.md)。
//
// macOS 真实默认名是 `<Name>s-MacBook-Pro` 形状, 跟这里不一样, 真跑 macOS 端用 LLBOT_DEV_NAME 覆盖。
// 派生盐改了就是换设备名 (guid 不变, 服务端看到的是"用户给机器改了个名")。
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
