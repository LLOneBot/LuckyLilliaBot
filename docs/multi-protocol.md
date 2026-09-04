# 多协议支持 (Linux / Windows / macOS / Watch)

Bot 的直连协议层 (`src/main/qqProtocol/direct-lib/`) 支持四端 QQ 协议, 用 CLI 参数
`--protocol` 选择, 进程级不可变。默认 `linux` (不带参数时, 向后兼容)。

## 用法

```
tsx watch src/main/main.ts --protocol windows -q 12345
# 或 -p win / --protocol=macos / 环境变量 PROTOCOL=watch
# 别名: win|windows / mac|macos|darwin / wat|watch / (其余) linux
```

解析在 `src/common/utils/environment.ts` 的 `getProtocol()` (零依赖, 对齐 `getCdn` 风格)。

## 架构: profile 抽象

协议常量集中在 `direct-lib/profiles/`:

| 文件 | 内容 |
|------|------|
| `profiles/types.ts` | `ProtocolProfile` 接口 (身份/版本 + 设备 + wtlogin ECDH + SSO head 形状 + reserve 变体 + watch 专属) |
| `profiles/{linux,windows,macos,watch}.ts` | 各端 profile 常量 (值溯源见文件内注释 + `LuckyLillia.Sign/docs/Linux/appinfo-cross-platform.md`) |
| `profiles/index.ts` | `PROFILES` 注册表 + `getActiveProfile()` (读 `--protocol`, 缓存一次) |

`appInfo.ts` 降级为**兼容 shim**: `AppInfo`/`DeviceInfo` = 当前激活 profile 的扁平视图。
只读常量的叶子消费者 (highway / message / dashboard...) 无需改动; 有分支逻辑的
`login.ts` / `packet.ts` / `client.ts` / `online.ts` 直接吃 `getActiveProfile()`。

## 两个协议族

- **NT (linux/windows/macos)**: 共用 `trans_emp` 二维码登录 / TLV 集 / secp192k1 曲线。
  端间差异 = profile 常量 + 少数结构性字段 (下表)。桌面 login/frame/head 全在 `login.ts` + `packet.ts`。
- **Watch (Android-NT 变体)**: 同 trans_emp 流程 + NT 风格 SSO head, 但独立的 P-256 wtlogin ECDH /
  21 TLV / inner protocol 10 / head version `testrevision` / watch reserve / qimei36。
  实现在 `direct-lib/watch/` (ecdh / tlv / frame / request / qimei), 由 `login.ts` 按 `family` 分派。
  底层 `tea.ts` / `tlv.ts` / 响应 parser 与桌面共用。

## 关键差异 (profile 已编码, 改版本时对照)

| 项 | Linux | Windows | macOS | Watch |
|----|-------|---------|-------|-------|
| appId / subAppId | 1600001615 / 537352510 | 1600001604 / 537376767 | 1600001602 / 537296002 | 16 / 537258298 |
| QUA | V1_LNX_NQ_3.2.28_48517 | V1_WIN_NQ_9.9.33_51728 | V1_MAC_NQ_7.0.0_52194 | V1_WAT_SQ_9.0.3_0 |
| subSigMap (T116) | 0x10400 | **0** | **0** | 0x10400 |
| ssoVersion: transEmp / T100 | 19 / — | 23 / — | 23 / — | **8 / 22** |
| wtlogin 曲线 / cipher | secp192k1 / 0x0102 | 同 | 同 | **P-256 / 0x0131** |
| SSO head field8/field12 | subAppId / 2052 | 同 | **0x2007C26B / 0x20027635** | subAppId / 2052 |
| SSO head fixedHeader | 0x02.. | 同 | **0x01..0x01** | 0x02.. |
| inner protocol ver | 12 | 12 | 12 | **10** |
| head version 槽 | buildVer | buildVer | buildVer | **testrevision** |
| reserve 变体 | nt (f15/16/24) | nt | **macos** (f9..f34) | **watch** (+f12/21/26) |
| frame 固定值 byte/ver | 19 / 48517 | 23 / 0x3374 | 23 / 0x3374 | (独立 frame) |

## session 隔离

登录凭证按协议分文件 (换协议凭证不通用), 逻辑集中在 `session.ts`:
- Linux 无后缀 `qq-session-<uin>.json` (零迁移); 其余 `qq-session-<uin>-<protocol>.json`。
- `listAvailableSessions()` 只列当前协议的 session。
- `machine_guid.bin` / `auth_token.txt` / `config_<uin>.json` **按账号共享** (与协议无关)。

## 端到端阻塞项 (本期 Bot 侧只完成"发对包 + 传对 QUA")

1. **sign 后端**: Bot 把 QUA 转发给 manager-server 按 `qua_pattern` 路由。当前只有 Linux VM sign
   后端; **Windows(MSFSign) / macOS(白盒AES) / Watch(FEKit) 需在 manager 注册对应 backend**,
   否则登录到第一条 signed 命令报 503 `no sign backend matches qua`。
2. **Watch qimei36**: `watch/qimei.ts` 现按 guid 确定性合成占位值 (够拉码, 但登录 T545/reserve-f12
   真机风控大概率拒)。真取号要打 `/ola/android` snowflake (参考 `LuckyLillia.Sign/src/Windows/qimei/`)。
3. **Watch 扫码拉码 (trans_emp) 不签名不需 qimei**, 是唯一可脱离后端单测的一步 (`sendCommand` skipSign=true)。
4. **跨 repo**: `LuckyLillia.Desktop.Avalonia` 的 session 扫目录 (`HomeViewModel.cs`) 需同步剥离
   `-<protocol>` 后缀并把 protocol 传成 `--protocol` 给 Bot。

## 升级某端 QQ 版本

改对应 `profiles/<name>.ts` 的 currentVersion/buildVer/appClientVersion/qua/subAppId 等,
对照 `LuckyLillia.Sign/docs/Linux/appinfo-cross-platform.md` §7 checklist 重抓变化的常量。
Watch 的 TLV 专属常量 (T100 mainSigMap 16724722 / buildTime / sdkver 等) 在 `watch/tlv.ts` 内。
