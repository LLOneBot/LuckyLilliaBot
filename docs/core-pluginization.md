# 核心插件化：扫码协议也是插件

> 已实施。扫码协议层（纯协议 / 官方 QQ 端桥接，登录方式见 §6）、8 个 NT API、`account` 门闸、登录后的数据库 / `Core` / `Store`、扫码登录路由，全部收进内置条目 `builtin:nt-protocol`（`src/plugin/internal/protocol/nt-protocol/`），可以在插件页**运行时**停用 / 启用。WebUI 成了不依赖任何协议的壳。和 QQ 官方机器人（`builtin:qq-official`，见 [official-qq-bot.md](official-qq-bot.md)）是两个独立开关：
>
> | 模式 | 启用 |
> |---|---|
> | 只用扫码账号 | `builtin:nt-protocol`（默认） |
> | 只用官方机器人 | `builtin:qq-official`，停用 `builtin:nt-protocol` |
> | 两者并存（同进程） | 两个都启用 |

## 1. 结构

`main.ts` 只剩根基础设施：`Log` / `LoggerConsole`、`TimerService`、`ConfigService`、`BotsService`、`PluginService`、`EmailRoutes`（WebUI 本身是核心条目 `builtin:webui`，Dashboard、日志也是条目，见 [plugin-system.md](plugin-system.md)"外壳和核心页面"），以及一个 `ctx.inject(['config'])` 块（版本日志、logLevel、配置文件监听，**启动时首播一次 `llob/config-updated`**）。其余都由依赖驱动：

- **`builtin:nt-protocol`**（`inject: ['config']`）的 apply 依次挂：协议实现（按条目设置里的登录方式选纯协议或 PMHQ，见 §6；单入口，不暴露成两个可并存的开关：两者都叫 `qqProtocol`）、8 个 NT API、`AccountService`、`NTLoginRoutes`（扫码 / 快速登录 / 退出 / auth token 路由），一个 `ctx.inject(['account', 'config'])` 块挂数据库（`${uin}.v3.db`）/ `Core` / `Store`，再加登录横幅、IPC（`setLoginState` / `startIpcServer`）、断线日志
- 原设计把数据库 / Core / 登录后生命周期拆成 `builtin:store` / `builtin:nt-core` / `builtin:nt-lifecycle` 三个条目，**没有采用**：它们只服务扫码账号，跟着协议条目一起起停最简单，插件页也少三张无法单独操作的卡片
- 依赖它的条目照旧：三个适配器、WebQQ、邮件通知、中立层的 `NTQQUniversal`（core）都 inject 了 `account` 等服务，协议条目停用时它们回到 PENDING，前端显示"需要先启用 NTQQ 协议"
- 启用后的波次由 inject 自然得到：`qqProtocol` → `ntFriendApi` / `ntGroupApi` / `ntLoginApi` / `ntSystemApi` 和登录路由；首次 `qq/online` → `account` 放行 → 数据库 / `Store` → `ntUserApi` / `ntMsgApi` → `ntFileApi` / `ntWebApi` → `Core`（`app`）→ 适配器、WebQQ、中立层

## 2. 不变量（重连安全）

> **`service present == 插件 enabled`，不等于 `connected`。连接的通断只走事件，绝不触动 service 的生命周期。**

断线时若 `qqProtocol` 等服务消失、重连时再出现，cordis 会把 Core、Store、适配器、WebQQ、中立层全部拆掉重建。所以：

- `QQProtocolBase` **不能**加 `[Service.check]`（比如 `return this.isConnected()`）。连接状态继续走 `protocol/disconnect` / `qq/online` 事件
- `account` 是一次性闩：`markOnline()` 只置 `true` 一次，断线重连不翻动
- 现在服务消失**只有一个原因**：用户在插件页停用了协议条目

## 3. 运行时停用：协议层的清理

`QQProtocolBase[Service.init]` 返回 `stop()`，cordis 卸载条目时 await 它。停用和断线不同，**不发 `protocol/disconnect` / `qq/session-expired`**：消费者正一起被卸载，邮件通知也不该报一次用户主动的"掉线"。

- 基类：`disposed` 标志让二维码循环和 `maybeEmitOnline()` 停下；清断线检测定时器和回调；`selfInfo` 清空成未登录；IPC 的登录状态回到 `initializing`
- 直连：停 auth token 监听（`stopAuthTokenWatcher()`：`unwatchFile`、清重试、清 `lastValidToken`，不然再启用时同一个 token 不会再触发登录）；`qrPollToken` / `initToken` 自增让在途的扫码轮询和 init 退出；清重连定时器、停心跳；**先**从 client 摘掉本实例的监听（不然 `close` 会安排重连），再 `clearSession()` + `disconnect()`。存盘的 session 不删，再启用时直接恢复，不用重新扫码
- **`DirectProtocolClient` 跨实例共用**（`direct.ts` 的模块级 `sharedClient`）：native sign 的 relay 只绑第一个 client、无法重绑，所以停用只断开它，再启用的新实例接着用同一个对象（走"已有 client"分支：换 token / uin / guid、清 session），只重新挂自己的监听
- PMHQ：探测 token 自增、清重连定时器、置空 ws 的四个回调后关闭（不然 `onclose` 会重连）、清响应监听；`waitConnected()` 在停用后拒绝而不是永远等
- 邮件通知的 disposer 改用 `ctx.get('qqProtocol')?.offDisconnect()`：协议条目先没了的时候它已经不在
- `startIpcServer()` 进程级、幂等，停用不关：桌面端一直靠它轮询登录状态

## 4. 账号 / 数据库

- `account` 由协议条目提供，停用后**完全不存在**（比"存在但 check=false"更干净）。官方机器人以 AppID 为身份，不碰 `account` / `selfInfo`
- 数据库仍是保守档：在 `account` 门后、路径 `${uin}.v3.db`。不能为了让纯官方进程也有数据库就让它在登录前起：那时拿不到 uin，只能落 `default.v3.db`，老用户扫码登录后会落到空库，丢掉 shortId 映射、文件缓存。所以纯官方进程没有 `database`；官方机器人真要数据库时，另给它一个按 `qq:<appid>` 取路径的实例
- 原设计要求登录后在 account 门后再广播一次 `llob/config-updated`，那是按账号存配置时代的约束。实例模型下配置启动就定了，改成启动时广播一次（日志文件开关只从这个事件拿），`Core` 的 ffmpeg 路径改成 `start()` 里直接读自己的配置

## 5. WebUI 壳

- `WebuiServer.static inject = ['config']`，构造时自己读 `ctx.config.get().webui`，内建路由只有 config、`login-info`、logs、鉴权中间件、静态文件和两张运行时路由表的分发
- 扫码登录相关路由（`/api/login-qrcode`、`/api/quick-login-list`、`/api/quick-login`、`/api/logout`、`/api/auth-token`）是 `NTLoginRoutes`（`inject: ['webuiServer', 'ntLoginApi', 'qqProtocol']`），协议停用时经路由表 fallback 返 JSON 404。`nt-protocol/authTokenRoutes.ts` 对 `authTokenWatcher` 的静态 import 留着：它现在只在协议条目里被用到
- `/api/login-info` 带 `ntProtocol`（`!!ctx.get('qqProtocol')`）；`/api/config` 只有 bot 设置，不再带 `selfInfo` / `ntProtocol`
- `builtin:dashboard` 的 `/api/dashboard/stats` 只有 bot 进程和机器的资源。扫码账号的好友、群、收发数、QQ 进程资源和版本号是协议条目里的 `NTStatsRoutes`（`src/plugin/internal/protocol/nt-protocol/statsRoutes.ts`，`/api/ntqq/stats`），由插件自己挂进 Dashboard 的卡片读（`client/DashboardCards.tsx`）；原来的 `/api/device-info` 并进了它
- 前端没有扫码登录门，读完 `/api/config` 就进主界面。扫码登录在 `builtin:nt-protocol` 自己的设置页「NTQQ 协议」（插件自己的界面 `src/plugin/internal/protocol/nt-protocol/client/`：`NTProtocolPage.tsx`、`QQLogin.tsx`、`AuthTokenForm.tsx`、`LoginMethod.tsx`，只用 plugin SDK，见 [plugin-system.md](plugin-system.md)"内置插件的界面"；页面 id `ntqq`，order 5）：协议启用时在侧边栏，停用后卡片的「前往设置」仍能打开。页面每 3 秒轮询 `/api/login-info`（壳路由，协议停用也在，停用时也问：登录方式要用它的 `pins`）和 `/api/auth-token/status`（协议启用时才问）。顶部是登录方式（§6），下面依次显示：未启用 / 协议启动中 / 连不上 PMHQ（官方 QQ 端桥接时："正在连接 PMHQ（地址:端口）"，提示先启动 QQ 和 PMHQ）/ Auth Token 表单（`AuthTokenForm`，内联；原来那个不能关的弹框会盖住整个 WebUI）/ 快速登录和扫码（`QQLogin`，桥接时二维码来自 QQ 客户端）/ 已登录账号卡片（在线状态；纯协议可退出登录，桥接的登录归 QQ 客户端管）。全局设置弹框里的「退出 QQ」挪到了这里
  - 登录后不用刷新整页：侧边栏按 `/api/bots` 显示在线的账号，Dashboard 的 NTQQ 卡片自己轮询，WebQQ 打开时自己拿账号（见 [plugin-system.md](plugin-system.md)"内置插件的界面"）。原来侧边栏账号、WebQQ 按账号的持久化、QQ 版本号只在页面加载时取，NTQQ 页看到登录就刷新整页，不在 NTQQ 页时自动恢复的登录则不更新侧边栏；现在 NTQQ 页只提示"QQ 登录成功"。反方向：已登录的账号掉线时卡片显示"离线"，用户点「重新登录」才切到扫码，免得断线重连期间自动去拉二维码
  - 快速登录（直连）：`POST /api/quick-login` 等到有结果才返回。`DirectQQProtocol.quickLogin()` 等 init 跑完（另一个 init 正在跑时最多再等 60 秒，它转回来会用上这个 uin），上线了就成功，没上线就抛出原因（`restoreError`：session 恢复时 `registerOnline` 的报错），路由回 500 带这句话。原来 init 恢复失败只记一行 info 就悄悄退回扫码，请求照样回成功，页面一直停在"正在登录"。前端：按钮显示"正在登录 <昵称>…"直到有结果；成功立刻轮询一次（不等 3 秒），页面换成账号卡片；失败把原因留在页面上的红框里（toast 容易错过），并切到扫码
  - 主界面顶部的状态提示按插件说明谁卡在哪，每行一件事、带跳转按钮，指向的那页本身不显示那一行（owner 2026-10-28 选的做法：只说哪些插件需要哪个账号，免得用户以为所有账号都得登录）。外壳（`components/layout/StatusNotices.tsx`）不认得哪个插件，只按状态说通用的，规则见 [plugin-system.md](plugin-system.md)"内置插件的界面"：
    - 有启用的插件停在 PENDING、缺的服务由 NTQQ 协议提供 →"OneBot 11、WebQQ 要等 NTQQ 账号登录后才会运行"「去看看」（文字来自协议条目 manifest 的 `service.labels.account`）；协议停用时是"…需要启用「NTQQ 协议」才会运行"「前往插件页」。名字按插件列表里实际在等的算（超过 3 个写"等 N 个插件"）
    - 账号没登录或已离线、而没有插件在等它：协议条目自己往 `shell.notices` 插槽放的一行（`src/plugin/internal/protocol/nt-protocol/client/Notices.tsx`），只在一个在线的账号都没有时说，登录过（`/api/bots` 里有 `llonebot` 平台的 bot）就说"已离线"
    - QQ 官方机器人：没能启动走通用的"运行出错"，`notice`（"还没有填写 AppID 和 AppSecret"）走通用的配置提示，正在连接（只在没有任何账号在线时）和没有连上开放平台是它自己 `shell.notices` 插槽里的（`src/plugin/internal/protocol/qq-official/client/Notices.tsx`）
    - 运行出错的插件汇总一行（只有一个时带原因，按钮去它的设置页）；没有启用任何协议端（插件页"协议端"分类的插件，第三方的也算）、也没有在线的 bot 时说"没有启用任何协议端"
    - `/api/bots` 由外壳每 5 秒问一次（`stores/botsStore.ts`），它和插件列表都回来之前不显示
  - `/api/login-info` 原来带 `webui`（生效的 WebUI 地址），给扫码页在登录后判断"WebUI 被关掉 / 换了端口"并跳转。那是按账号存配置的年代（登录才切换配置）的逻辑，实例模型下登录前后配置相同，连同前端的跳转和 FE `vite.config.ts` 的 `__WEBUI_DEV_PORT__` 一起删了

## 6. 登录方式：纯协议 / 官方 QQ 端桥接

owner 2026-10-28：NTQQ 设置页可以选登录方式，纯协议（多种协议可选）或官方 QQ 端桥接。原来只能用启动参数定：带 `--pmhq-port` 是 PMHQ，否则直连，协议看 `--protocol` / `-p` / 环境变量 `PROTOCOL`。

- **设置**：`builtin:nt-protocol` 有了配置（`NTProtocolSchema`，`src/plugin/internal/protocol/nt-protocol/settings.ts`；类型 `NTProtocolConfig` 在 `common/types.ts`），存在 `plugins.json` 的条目里：`mode`（`direct` 纯协议 / `pmhq` 官方 QQ 端桥接，默认 direct）、`protocol`（linux / macos / windows / watch，默认 linux，只对纯协议有意义）、`pmhq`（`host` 127.0.0.1、`port` 13000）。`check` 只拦桥接时地址为空
- **启动参数优先**（`common/utils/environment.ts` 的 `protocolPins()`，进程内算一次 `launchPins()`）：`--pmhq-port`（加 `--pmhq-host`）锁定桥接和地址；有 `LL_IPC_PIPE` 而没有 `--pmhq-port` 锁定纯协议（桌面端无头模式：它自己管 QQ，WebUI 改成桥接会去连一个它没开的 PMHQ）；`--protocol` / `-p` > `PROTOCOL` 锁定协议。空值不算（compose 里没设的变量会传 `PROTOCOL=`），不认识的值仍是 linux。有 `LL_IPC_PIPE` 时 flag 记成桌面端传的（`by: 'desktop'`），提示"由 LuckyLillia 桌面端指定"，用户知道去哪改。docker 的 `PROTOCOL_MODE=pmhq` 走 `--pmhq-port`，同样锁定
- **生效的选择**：协议条目 apply 时 `resolveProtocolSelection(设置)`（锁定的字段盖过设置）→ `setProtocolSelection()`，再按 `mode` 挂 `DirectQQProtocolClient` 或 `PmhqQQProtocolClient`。`isPmhqMode()` / `currentPmhqTarget()`（PMHQ 客户端构造时读）/ `getProtocol()` 都看这个选择；协议条目从没 apply 过时退回只看 argv，跟原来一样
- **协议一个进程只能定一次**：`DirectProtocolClient` 进程内共用（§3，native sign 的 relay 不能重绑），所以 `doInitDirectClient` 建它之前 `lockProtocol()`，之后 `getProtocol()` 一直返回锁定的那个，`/api/login-info` 的 `lockedProtocol` 告诉前端，改了要重启 LLBot。建 client 之前（还没录入 Auth Token、桥接模式）改协议立刻生效：快速登录列表（session 按 (uin, 协议) 分文件，只列当前协议的）、扫码都用新协议。为此 profile 不能在模块加载时就解析：`appInfo.ts` 原来顶层 `const p = getActiveProfile()`，`client.ts` 的 `DEFAULT_CONFIG`、`telemetry.ts` 的版本串也在加载时读 `AppInfo`，都改成读的时候才取；`getActiveProfile()` 按 `getProtocol()` 的结果缓存（锁定前会跟着变）
- **桥接固定用 linux 的 profile**（启动参数另给的除外）：PMHQ 也读 profile（highway 的 appId、`SsoInfoSync` 的设备信息），原来不带 `--protocol` 就是 linux，不能因为纯协议选过 macOS 就在桥接里换掉。从纯协议切到桥接时 `getProtocol()` 也回到 linux，切回纯协议再回到锁定的那个
- **运行时切换**：保存走 `fiber.update`，协议条目用 `ctx.on('internal/update')` 拦截（见 [cordis-upgrade-notes.md](cordis-upgrade-notes.md)）：只有换了模式、或桥接时换了 PMHQ 地址才放行重启（重挂协议层，当前账号登出，依赖 `account` 的都跟着重来）；只改协议或纯协议下改 PMHQ 地址就地更新选择，不断开已登录的账号
- **`/api/login-info`** 多了 `protocol`（生效的 profile）、`lockedProtocol`、`pins`，桥接时还有 `pmhq: { host, port, connected }`
- **前端**（`src/plugin/internal/protocol/nt-protocol/client/LoginMethod.tsx`，纯逻辑在 `loginOptions.ts`；文件名不能叫 `loginMethod.ts`：Windows 上跟 `LoginMethod.tsx` 只差大小写，`./LoginMethod` 会解析到它；配置经 SDK 的 `usePluginConfig()` 读写）：NTQQ 页顶部一行"登录方式：纯协议 · Linux"，下面是锁定说明（"协议由启动参数 --protocol 指定"，全锁定时"由 LuckyLillia 桌面端指定，这里改不了"、没有「更改」）和"已改为 macOS，重启 LLBot 后生效"（这时上面一行写的是正在跑的协议）。「更改」展开表单：两张选项卡片；纯协议有协议下拉（"不同客户端的登录记录分开保存，换了以后要重新登录"，手表另有琥珀色提示能用的接口最少）；桥接有 PMHQ 地址和端口。账号在线时换模式提示"保存后会断开当前登录的 QQ 账号"，协议已锁定时提示要重启。表单编辑的是存盘的设置，锁定的字段只显示锁定值、不写进去，以后去掉启动参数时还是用户自己选的。保存换了模式时页面置 `relogin`，不让旧账号的卡片挂着"离线"
- 插件停用时页面照样显示登录方式，可以先选好再启用

## 7. 验证

- 单测：`test/unit/bootstrap/ntProtocol.test.ts`（条目整体：服务分登录前 / 后出现、停用后全部消失且依赖方回到 PENDING、再启用再登录恢复；按设置挂纯协议或桥接，只改协议不重挂、换模式和桥接换地址才重挂）；`test/unit/environment.test.ts`（`protocolPins` 各种写法、`resolveProtocolSelection`、选择 / 锁定后的 `getProtocol()`）；`test/webui/routes/login.test.ts`（`login-info` 的新字段）；`test/unit/plugin-clients/ntProtocolLoginOptions.test.ts`（登录方式的显示和锁定逻辑）；`test/unit/qqProtocol/protocolStop.test.ts`（直连停用的清理、二维码循环停止、再启用复用同一个 client、PMHQ 停用后不再重连）；`builtins.test.ts` / `service-registry.test.ts` / WebUI 路由测试按新结构更新
- 不登录 QQ 的端到端（照 [plugin-system.md](plugin-system.md) 的方法）：PMHQ 模式和直连（无 auth token）模式下，运行时停用 → `/api/login-*` 404、依赖方 PENDING、没有残留的重连日志；再启用 → 协议重新连接、路由回来。`plugins.json` 里停用协议后启动，日志里没有任何协议层输出
- 登录方式（2026-10-28，浏览器里，临时实例不带 `--pmhq-port`、没有 Auth Token）：改成 macOS 立刻生效（`login-info` 的 `protocol` 跟着变，不用重启）；改成桥接（端口 1）→ 协议层重挂，页面显示正在连接 PMHQ；改回纯协议回到 Auth Token 表单；带 `--protocol watch` 启动时协议下拉置灰、写明来源；停用协议时也能改，保存后启用按新方式挂载。桌面端锁定和"重启后生效"用 Playwright 改 `/api/login-info` 的 `pins` / `lockedProtocol` 看的
- WebUI（PMHQ 模式，浏览器里）：直接进主界面、「去登录」到 NTQQ 页、运行时停用协议后提示和侧边栏入口消失而卡片仍能打开页面（显示未启用）、再启用回到扫码；已登录卡片、掉线 → 重新登录 → 恢复在线、登录完成后自动刷新、Auth Token 表单提交、退出登录的确认，用 Playwright 改 `/api/config` / `/api/login-info` / `/api/auth-token/status` 的响应验证

## 8. 未验证 / 遗留风险

- **真机未验证**：扫码登录后停用再启用（应当用存盘 session 免扫码恢复）、直连在线时停用（TCP 断开、native sign 的 relay 在同一个 client 上继续可用）、PMHQ 已登录时停用再启用；在 WebUI 里选 macOS / Windows / 手表后真的扫码登录（原来只经 `--protocol` 验证过）、已登录时在纯协议和桥接之间切换、桌面端带 `LL_IPC_PIPE` 启动时的锁定
- native sign 的 relay "不可重绑"只据源码注释推断；共用 client 绕开了重绑，但停用期间 relay 收到的请求会因为连接断开失败，要真机确认不会让 native 层 `process.exit`
- 停用后 `selfInfo` 被清空；WebQQ 的页面只在打开时取一次账号，开着的 WebQQ 不会因为换了账号就切过去，要重新打开它
