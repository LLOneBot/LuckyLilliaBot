# 会话生命周期: 假在线 / 重连与扫码 / 设备 guid

直连模式下, "Online registered" 打了但收不到 MsgPush、发包全超时的状态叫**假在线**。
本文前半记录它的成因和现在的处置链路, 以及掉线后怎么重连、怎么出码; 后半「设备 guid」一节讲
`machine_guid.bin` 与 session 文件里 `guid` 的分工和同步。相关代码: `direct-lib/client.ts` / `direct-lib/online.ts` /
`direct-lib/session.ts` / `direct-lib/machineGuid.ts` / `qqProtocol/direct.ts` / `qqProtocol/base.ts`。

## 服务端作废凭据长什么样

登录凭据 (d2 / tgt) 有寿命 (实测约 28 天)。到期后服务端不发 KickNT, 而是对**每个** SSO 请求回
一个错误帧:

```
retCode = -10001   extraMsg = "身份验证失败，请你重新登录。(s20)"
```

关键坑: **这个错误帧的 seq 是 0**, 匹配不上任何在飞请求。

## 曾经的三层漏判 (2026-09 修复)

1. **帧层丢 retCode**: `handlePacket` 只在 seq 命中 `pendingPackets` 时才看 retCode; 对不上就
   `emit('push')`, 而 push 路径的载荷只有 `{ cmd, payload }` — retCode / extraMsg 被整个丢掉。
   再往下 `dispatcher.ts` 是个只认几个 cmd 的 switch, 无 default, 于是静默蒸发。
2. **心跳吞异常**: `startHeartbeat` 的 catch 只 log 一行, 4.5 分钟一次无限重试, 从不升级。
3. **监控判据错**: `base.startDisconnectMonitoring` 靠 `get_is_connected()`, 而它当时 =
   `client.isLoggedIn` = `session !== null`。session 只是本地对象, 不因服务端作废而变 →
   `lastConnectedTime` 每 5 秒被刷新 → 掉线回调永不触发。

三层叠加的结果: `selfInfo.online` 停在 true, 没有任何日志之外的反应, 只能人工 `mv session.json`
+ 重新扫码。

## 现在的处置链路

```
错误帧 (retCode=-10001)
  └─ client.handlePacket()          认码在 pending 匹配之前, seq 命中与否都认
       ├─ clearSession()            本地凭据当场作废 -> isLoggedIn 转 false
       ├─ reject 所有在飞请求        理由带上真实 retCode, 不是笼统的 Disconnected
       └─ emit 'session-expired'
            └─ direct.ts            停心跳 + 清 reconnectTimer + deleteSession(uin)
                 ├─ qrPollToken++ / initToken++ / resetQrState / setLoginState('need_qrcode')
                 ├─ ensureQrLoop()  直接进扫码, 不绕 disconnect -> 重连
                 └─ ctx 'qq/session-expired' -> 邮件通知 + milky bot_offline
```

要点:

- **认码在分发之前**: 错误帧 seq=0 匹配不上在飞请求, 放到 pending 之后判就晚了。
- **不删 machine_guid**: 凭据到期 ≠ 设备指纹泄露, 删了下次要重新过设备验证。这点跟异地顶号
  (`KickNT` `code=1001`) 相反 — 那个要连 guid 一起清。见 `direct.ts` 的 `nt/kicked-offline`。
- **sign 在飞时的 session 换代**: `sendCommand` 签名期间 session 可能被作废, 发包前再比一次,
  不一致就抛错, 免得拿废凭据出网。
- **无主的非零 retCode 帧不进 dispatcher**: body 不是有效 protobuf, 只 log warn。正常推送走
  13 型帧 (`parseSsoFrame13` 不设 retCode), 不受影响。
- **心跳会升级**: 失败后转 30s 快重试, 连挂 3 次 (或 session 已被清掉) 就主动 `disconnect()`,
  最坏约 5.5 分钟能测出来。这条兜住"服务端不回错误帧, 只是静默不理"的情形 —— 没有它,
  上面整条链路都不会被触发。
- **掉线监控判据**: `get_is_connected()` = `isConnected && isLoggedIn`。失效时 `clearSession`
  让后者转 false; 前者覆盖"连接断了但 session 还在"那一档。

## 掉线后的重连与扫码

在线时 TCP 断开 (网络断 / 普通踢 / 异地顶号 1001 后主动 disconnect) -> `close` -> `scheduleReconnect()`:

- **只有 init 抛错才重排**, 抛错基本等于连不上服务器, 退避 5s -> 10s -> 20s -> 40s -> 封顶 60s。
- **init 正常返回就停**, 不管是恢复成功还是落到了扫码。扫码阶段归扫码循环管, 断连由
  `fetchFreshQrCode` 拉码前自己重连。
- 取舍 (有意为之): 恢复被拒 / `registerOnline` 超时这类失败不再自动重试 session, 直接出码,
  要么扫码, 要么 WebUI 点快速登录。

曾经的坑 (2026-09 修复): 定时器回调末尾**无条件** `scheduleReconnect()`, 守卫只看 `online`。落到
扫码后每 5s 又跑一轮 `doInitDirectClient`, 开头 `resetQrState` + 取消 poll, 等于每 5s 换一张码,
每张只能用 4-5 秒, 永远扫不上, 也就永远出不了这个循环。异地顶号会删 session, 所以一被顶号必进。

### 两个取消 token

| token | 谁 bump | 取消什么 |
|-------|---------|----------|
| `initToken` | `doInitDirectClient` 开头 / `logout` / `session-expired` | 在飞的 `doInitDirectClient` (session 恢复) |
| `qrPollToken` | 每条新 poll 链 / `doInitDirectClient` / `logout` / `session-expired` | 扫码 poll 链和 `completeDirectLogin` |

以前两者共用 `qrPollToken`: 恢复 session 的过程中扫码循环一拉码 (起新 poll 链 bump token),
恢复就在检查点悄悄退出, 之前全靠下一轮 5s 重连兜底。重连不再循环后必须拆开, 否则会卡在
"session 在、不在线、也不出码"。

### 二维码自动刷新上限 (仅直连)

码过期 (poll 回 Expired/Cancelled, 或到 180s TTL) 后扫码循环会自动拉新码。直连模式最多自动拉
**10 张** (`QR_AUTO_REFRESH_LIMIT`, 含第一张), 之后停止自动刷新, 打一条 warn, Desktop 状态置
`expired`。

- **清零**: 登录成功 (`maybeEmitOnline`), 或用户手动刷新: WebUI 请求 `/api/login-qrcode` 走
  `getLoginQrCode()`, 算手动, 这一张不计数。前端只在进扫码页、点"刷新"、请求失败后才会请求,
  过期时只显示"点击刷新", 不会自己轮询, 所以不会绕过上限。
- **PMHQ 不限**: 那边的码是 QQ 进程自己在刷, base 只是读 (`qrAutoRefreshLimit()` 默认无穷)。
- **Desktop 没有手动刷新入口**: IPC 只有 `get_login_state`, 到上限后只能开 WebUI 刷新或重启。
- **已知缺口**: 扫码阶段 TCP 断了没人立即重连。poll 每 2s 报一次 `Not connected`, 要等缓存的码过期,
  `fetchFreshQrCode` 才重连拉码。

### 拉码的其他规则 (base 里, 两种模式都生效)

都在 `base.ts` 的 `refreshQrCodeIfStale` 一处:

- **同一时刻只拉一次**: 扫码循环和 WebUI 请求同时发现缓存过期时共享同一次拉码 (`qrRefreshInflight`)。
  以前两边各拉一张, 后拉的那张起新 poll 链时会取消前一张的, 结果 WebUI 显示的码扫了没反应。
- **登录收尾时不拉码**: 已有 session、还没上线 (`shouldSkipQrPrint`) 时不拉, WebUI 请求也一样,
  那张码注定用不上。
- **失败退避**: `fetchFreshQrCode` 抛错 (断网时就是 `connect()` 失败) 后, 自动拉码按 2s -> 4s -> 8s
  -> 16s -> 封顶 30s 等, 退避期间扫码循环空转, 不重试也不刷日志; warn 里带"Ns 后重试"。手动刷新
  不等退避, 拉成功就清零。`fetchFreshQrCode` 返回 null (没就绪) 不算失败, 照旧每秒静默重试。

直连的 poll 收到服务端的过期 / 取消时打一条 info, 带这张码存活了多久 (`二维码已过期, 这张码用了 121s`)。
实测正常约 2 分钟一张; 如果只活几秒, 多半是设备被服务端风控标记了。

## 设备 guid: `machine_guid.bin` 与 session 里的 `guid`

两处都存 16B 设备 guid, 平时同值, 但语义不同且**允许不相等**, 不能合并成一份。

| | `data/machine_guid.bin` | `qq-session-<uin>[-<protocol>].json` 的 `guid` |
|---|---|---|
| 语义 | Bot 当前的设备身份 | 这份凭据 (d2/tgt) 签发给了哪台设备 |
| 粒度 | 全局, 跨账号跨协议共用一台"设备" | 按 (uin, 协议) |
| 管理 | `machineGuid.ts` | `session.ts` (明文字段, 不进 `enc`) |

- **session 为什么要自带 guid**: guid 进了 trans_emp 的 TLV 0x16/0x33、wtlogin.login 的
  TLV 0x128/0x145 (`login.ts`)、每个 SSO 帧头 (`packet.ts`)、上线的 SsoInfoSync (`online.ts`)。
  d2/tgt 跟签发时的 guid 绑定, 恢复时 guid 必须跟签发时一致, 否则服务端看来是换了设备。
  所以得记下"签发时是哪个 guid", 不能靠一个会变的全局文件去推。
- **为什么还要 `machine_guid.bin`**: 没有 session 时也要 guid —— 首次扫码的 trans_emp、
  sign-proxy 初始化 (`setupSign` 的 `machineGuid`), 以及下面那些派生物。

### 什么时候会不一致, 怎么同步

代码里的源头是**异地顶号** (`KickNT` code=1001): `direct.ts` 的 `nt/kicked-offline` 只删被顶
那个号的 session, 却 `deleteMachineGuid()` 换了新 guid, 同一 data 目录里其他账号的 session 还绑着
旧 guid。代码外的: 手动删掉 / 损坏 `machine_guid.bin` (会被重新随机生成)、从别的 data 目录拷
session 进来。

同步规则是**以 session 为准**: `doInitDirectClient` 恢复 session 前先 `overwriteMachineGuid(persisted.guid)`
把设备身份切回该账号签发时的 guid。client 首次创建时构造函数读的就是覆盖后的值; client 已存在时
再 `setGuid()`, 它连带 `setSignMachineGuid` 同步给 native sign。结果是多账号 guid 不同时,
`machine_guid.bin` 跟着最近快速登录的那个号走。

| 事件 | session 文件 | `machine_guid.bin` |
|------|--------------|--------------------|
| 扫码登录成功 | 写入, `guid` = 当前 client guid | 不动 |
| 快速登录 (恢复 session) | 读 | 覆盖成 `session.guid` |
| 异地顶号 1001 | 删被顶的号 | 删除, 立即重新随机生成 |
| 凭据过期 -10001 | 删 | 不动 (理由见上文) |
| 其他掉线 / 普通踢 | 保留 | 不动 |

### 从 guid 派生的东西必须跟着 guid 走

guid 一变, 派生物都得跟着换, 否则服务端看到的是新旧两台设备拼起来的"嵌合体"。

| 派生物 | 在哪 | 跟着 guid 变? |
|--------|------|---------------|
| native sign 的设备 guid | `client.setGuid` -> `setSignMachineGuid` | 是 |
| 设备名 `LuckyLillia-<hash>` | `appInfo.ts`, 惰性 getter 每次读 cache | 是 |
| watch device32 / qimei | `sign.ts` / `watch/qimei.ts`, 每次现算 | 是 |
| macOS qimei36 + device_pb | `macosDevice.ts`, 落盘 `data/macos_device.json` | **否**, 见已知问题 2 |
| 容器里的 session 加密 key | `session.ts` 的 `getMachineKey()` | **否**, 见已知问题 1 |

### 已知问题 (未修)

1. **容器 session 加密 key 跟不上 guid 变化**。容器里 key 从 `machine_guid.bin` 派生 (见
   [docker.md](docker.md)), 这段 (`61aa2670`) 早于顶号换 guid (`d42745d8`), 两者没对上:
   - `_machineKey` 进程内永久缓存, `deleteMachineGuid` 不清它。顶号后同进程扫码重登, session 的
     `guid` 是新值 Y, 却用旧 key K(X) 加密; 重启后按 Y 算 key 解不开, 又得扫一次码
     (配了 `AUTO_LOGIN_QQ` 的无头部署会停在等扫码)。
   - 其他账号的 session (旧 guid) 重启后解不开: `loadSession` 解密失败直接返回 null, 上面"以
     session 为准"的同步根本轮不到执行 —— 恰好是它要处理的场景。
   - 修法方向: 容器分支改用 session 自己的 `guid` 派生 key (加密用 `saveSession` 的 `guid` 参数,
     解密用 `data.guid`)。docker.md 本就接受"拿到 session 文件即可还原 key", 安全性不变; 现存
     session 两者相等, 算出的 key 一样, 不用迁移。非容器分支 key 来自 OS machine id, 不受影响。
2. **`macos_device.json` 不认 guid** (只影响 `--protocol macos`)。`readFileIfUsable` 只按 QUA
   判断要不要重建, 文件里不记派生它的 guid, 进程内 `cache` 也不清。guid 变了之后 macOS 取 token
   用的 device_pb (连同 qimei36 那次设备注册) 仍是旧 guid 派生的, wtlogin/SSO 却已换新 guid ——
   正是 `macosDevice.ts` 头注释警告的嵌合体。修法方向: 文件里记下 seed guid (或按 guid 分文件),
   对不上就重新取号重组。

### 来历

- `0e956f94` (2026-05-17): client guid 每次启动 `randomBytes(16)`, session 文件是唯一持久化 guid 的地方。
- `7f153dd8` (2026-06-10): sign 层 (SsoKeyExchange) 要跨重启稳定的设备指纹, 引入 `machine_guid.bin`。
- `6c732cc1` (2026-06-26): `machine_guid.bin` 升格为唯一来源 (wtlogin/SSO 与 sign 同一台设备);
  session 的 `guid` 保留下来当"凭据绑定记录", 恢复时反向同步。

## 测试

| 文件 | 覆盖 |
|------|------|
| `test/unit/qqProtocol/directSession.test.ts` | -10001 认码 / 在飞请求 reject / 登录恢复守卫 / 掉线回调 / 重连只在 init 抛错时退避重试 / 恢复期间拉码不打断恢复 / 二维码自动刷新上限 / 拉码去重、退避、登录收尾时不拉 / 过期日志 |
| `test/unit/qqProtocol/offlineNotifications.test.ts` | `qq/session-expired` 的邮件通知 |
| `test/unit/qqProtocol/directResilience.test.ts` | 心跳失败升级 / 无主错误帧不分发 |

`test/unit/setup.ts` 的 `@/common/utils/environment` mock 必须带 `getProtocol` / `getCdn` ——
direct-lib 在 import 期就会走 `getActiveProfile()`, 缺了会在加载阶段炸。
