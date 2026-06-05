export const AppInfo = {
  os: 'Linux',
  kernel: 'Linux',
  vendorOs: 'linux',
  // 必须跟 QSign server 用的版本一致，否则 server 看到 sign 的 client version
  // 跟请求 head 的不匹配（sign 通过但消息行为异常，比如视频过期）
  currentVersion: '3.2.28-48517',
  buildVer: '3.2.28-48517',
  miscBitmap: 32764,
  ptVersion: '2.0.0',
  ssoVersion: 19,
  packageName: 'com.tencent.qq',
  wtLoginSdk: 'nt.wtlogin.0.0.1',
  appId: 1600001615,
  subAppId: 537352510,
  appIdQrCode: 0x200000013,
  mainSigMap: 169742560,
  subSigMap: 0x10400,
  ntLoginType: 1,
  appClientVersion: 48517,
  // QUA: 客户端版本指纹, 让 manager-server 路由到对应 sign-service 后端.
  // 格式: V1_<plat>_NQ_<ver>_<build>_GW_B. plat: LNX(Linux) / WIN(Windows) / MAC(Mac).
  // 升级 NTQQ 时改 currentVersion / buildVer / appClientVersion 后这里跟着更新.
  qua: 'V1_LNX_NQ_3.2.28_48517_GW_B',
}

export const DeviceInfo = {
  devType: 'Linux',
  devName: 'LLBot',
  osVer: 'Ubuntu 22.04 LTS',
  vendorName: '',
  vendorOsName: 'linux',
  systemKernel: '5.15.0',
}
