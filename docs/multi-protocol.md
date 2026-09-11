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

## 能力差异: 一律走 -10122, 不在上层判协议端

各端 appid 对应服务端不同产品线, 能访问的 cmd 不是一套 (手表尤其窄)。请求没授权的 cmd,
服务端回 `retCode=-10122` "Product does not have permission to access cmd"。

**这类判断只有一个入口**: `client.toCommandError()` 认码 -> `CmdNotPermittedError`
(`src/common/protocolErrors.ts`)。业务层**不要**写 `if (getProtocol() === 'watch')` 来决定
要不要调某个 API —— 那种清单必须列全才有用, 漏一个就退回运行时探测, 且清单跟调用点分离,
加新功能时必然失同步。

调用方按性质分两类处理:

| 场景 | 做法 | 例 |
|------|------|-----|
| 内部链路 (消息转换等) | 降级, 用手头信息凑合, 别让整条事件丢掉 | `getGroupMemberOrFromMessage()` 用消息自带的发送者信息 |
| 用户主动请求的 API | 让错误冒上去原样展示 —— message 已是人话 | WebUI 翻历史 / OneBot action |

`protocolErrors.ts` 里的 `CMD_LABELS` **只影响提示措辞**: 登记了给"手表协议不支持获取群成员列表",
没登记给通用文案 + cmd 名。功能行为不依赖它完整, 撞到哪个提示不顺眼再补哪个 —— 别把它长成
"能力清单"。

已实测不支持 (watch):

| cmd | 功能 |
|-----|------|
| `OidbSvcTrpcTcp.0xfe7_3` | 拉群成员列表 |
| `trpc.msg.register_proxy.RegisterProxy.SsoGetC2cMsg` | 拉私聊历史消息 |

### 什么**不**走这条路

profile 里的东西是**发包内容**, 不是"能不能发", 跟 -10122 无关, 该判还得判:
wtlogin 帧字节 / TLV 集 / ECDH 曲线 / `ssoProtocolVersion` / `imPlat` / systemKernel /
watch 才传的 `device32Hex` / watch 的 uin 从 poll confirm 取 (`direct.ts` completeDirectLogin)。
这些都在 `direct-lib/` 内, 登录期还没有 cmd 可撞。

## sign token (device token) 各端取法

即签名请求里的 `protocolTokenHex` (进 reserve f24 SecInfo 的 f2)。路由在 `sign.ts` 的
`acquireSignToken`, 按 TTL 续期在 `client.ts` 的 `ensureSignTokenFresh`。

| 端 | 取法 |
|----|------|
| linux | SignProxy 本地 ESK (`getLinuxEskToken`), 登录后拉 |
| windows / watch | 经 manager 的老路。**别并进 linux**: 本地 ESK 是真往 QQ 发包 |
| macos | o3 两步, 见下 |

macOS 按真机时序拆成两步 (`LuckyLillia.Sign/src/macOS/PoC/src/main.rs` 1322-1515):

1. **登录前 ESK** (`SsoEstablishShareKey`): 每条 TCP 连接一次, 在 trans_emp / session 恢复之前。
   `direct.ts` 的 `fetchFreshQrCode` 和恢复分支都先调 `acquirePreLoginToken`。拿到 token1 和
   通道密钥 (aesKey / shareId)。
2. **登录后 A2Establish + SA2** (`SsoSecureA2Establish` / `SsoSecureA2Access`): 复用第 1 步的通道
   拿业务 token。A2Establish 返空 = 没建成, SA2 退回 ESK 通道; `currentToken` 传 ESK 的 token1。

ESK 状态跟连接绑定: 断线 (`close`) 就作废, ESK 在飞时断线的结果也丢掉 (`connEpoch`); 过了 TTL
在下一次取 token 前重跑。签名时带哪个 device token (`client.protocolTokenFor`, 同 PoC `send()`):

| macOS 命令 | device token |
|------------|--------------|
| 未登录时的任何命令 | 空 |
| o3 握手 (`ecdh_access`: ESK / A2 / SA2) | 空, 登录后也是 (PoC 注释: 真机实测) |
| 登录后的业务命令 | SA2 token; SA2 回来之前用未过期的 ESK token1 |

其他端签名一律带 session 上的 token, 不区分命令。

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
