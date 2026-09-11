// 协议 profile 抽象: 把原来硬编码在 appInfo.ts 的 Linux 常量, 抽成"每端一份 profile"。
// 协议是进程级选择 (跟着 --protocol 启动, 运行中不变), 由 profiles/index.ts 的 getActiveProfile()
// 解析一次。字段值溯源见 LuckyLillia.Sign/docs/Linux/appinfo-cross-platform.md。

export type ProtocolName = 'linux' | 'windows' | 'macos' | 'watch'

// nt: Linux/Windows/macOS 共用 trans_emp 二维码登录 + NT SSO head + secp192k1。
// watch: Android-NT 变体 (P-256 wtlogin + watch reserve + 21 TLV + qimei36)。
export type ProtocolFamily = 'nt' | 'watch'

// SSO reserve field 组合:
//   nt    = 现有最小集 f15(TraceParent)/16(Uid)/24(SecInfo), Linux/Windows 用
//   macos = f9,f12,f14,f15,f16,f18-21,f23,f24,f26,f28,f34 (macOS/PoC/src/main.rs)
//   watch = nt + f12(qimei36)/21(=32)/26(=100) (Android NT marker)
export type ReserveVariant = 'nt' | 'macos' | 'watch'

export type WtLoginCurve = 'secp192k1' | 'secp256r1'

// watch 专属字段 (family==='watch' 才有)。
export interface WatchProfileExtra {
  headAppId: number       // SSO head 路由 appid (537065138), 与身份 appId(16)/subAppId 不同
  loginAppId: number      // 老 wtlogin 登录 appId (世代号 16)
  apkSignMd5: Buffer      // T16 str3 / T144 用的 APK 签名 MD5
  deviceType: number      // T521 device_type (=8, Watch)
  qimeiInstanceId: string // qimei 取号 instance_id / app_key
  appKey: string
  fekitVer: string
}

export interface ProtocolProfile {
  name: ProtocolName
  family: ProtocolFamily

  // ---- 身份 / 版本 (原 AppInfo) ----
  appId: number
  subAppId: number
  appIdQrCode: number   // 原 AppInfo.appIdQrCode (当前无人读, 保留 shape)
  mainSigMap: number
  subSigMap: number     // Windows=0, Linux/macOS/Watch=0x10400
  miscBitmap: number    // 原 AppInfo.miscBitmap (死字段 0x7FFC, 仅保留 shape)
  miscBitmapT116: number // buildTlv116 实际发的值 (Linux/Windows 12058620)
  ssoVersion: number         // wtlogin.login 侧 (NT=19, Watch=22)
  ssoVersionTransEmp: number // trans_emp T35/T66 侧 (Linux=19, Win/Mac=23, Watch=8)
  appClientVersion: number
  qua: string
  packageName: string
  ptVersion: string
  wtLoginSdk: string
  ntLoginType: number   // 原 AppInfo.ntLoginType (Watch 无此概念)
  currentVersion: string
  buildVer: string
  sdkBuildTime: number  // buildTlv177 第二字段 (桌面 0, Watch 1724730201)

  // ---- 设备 / OS (原 DeviceInfo + AppInfo 的 os 字段) ----
  os: string
  kernel: string
  vendorOs: string
  devType: string
  osVer: string
  systemKernel: string  // online.ts SsoInfoSync 内核串 (原硬编码 '5.15.0')
  vendorName: string
  vendorOsName: string
  imPlat: number        // message comm.imPlat (桌面 1)

  // ---- wtlogin ECDH ----
  wtLoginCurve: WtLoginCurve
  wtLoginCipherSuite: number // 桌面 0x0102 / watch 0x0131
  wtLoginServerPub: Buffer

  // ---- wtlogin frame header 两个"平台固定值" (真机 TEA-DUMP 实证, 见 POC build_wtlogin_frame) ----
  // 服务器对这两位较宽松 (POC: "非根因"), 但为"发对包"仍按各端真机值填。
  wtLoginFrameByte: number   // Linux 19 / Windows,macOS 23
  wtLoginFrameVer: number    // Linux appClientVersion(48517) / Windows,macOS 固定 0x3374 (非 appClientVersion)

  // ---- SSO head 形状 (buildSsoHead12 profile 驱动) ----
  ssoProtocolVersion: number  // inner frame 版本字节: NT=12, Watch=10
  ssoHeadField8?: number      // 覆盖 subAppId 槽 (macOS 0x2007C26B); undefined=用 subAppId
  ssoHeadField12?: number     // 覆盖 2052 槽 (macOS 0x20027635); undefined=用 2052
  ssoFixedHeader?: Buffer     // 覆盖 FIXED_HEADER (macOS); undefined=用默认
  ssoHeadVersion?: string     // 覆盖 head i16 version 槽 (Watch 'testrevision'); undefined=用 ctx.buildVer
  reserveVariant: ReserveVariant

  // ---- watch 专属 ----
  watch?: WatchProfileExtra
}
