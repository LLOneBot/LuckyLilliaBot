# 核心插件化：扫码协议也是插件

> 已实施。扫码协议层（纯协议 / 官方 QQ 客户端桥接，登录方式见 §6）、8 个 NT API、私有登录资源生命周期、登录后的数据库 / `Core` / `Store`、扫码登录路由，全部收进内置条目 `builtin:nt-protocol`（`src/plugin/internal/protocol/nt-protocol/`），可以在插件页**运行时**停用 / 启用。WebUI 成了不依赖任何协议的壳。和 QQ 官方机器人（`builtin:qq-official`，见 [official-qq-bot.md](official-qq-bot.md)）是两个独立开关：
>
> | 模式 | 启用 |
> |---|---|
> | 只用扫码账号 | `builtin:nt-protocol`（默认） |
> | 只用官方机器人 | `builtin:qq-official`，停用 `builtin:nt-protocol` |
> | 两者并存（同进程） | 两个都启用 |

## 1. 结构

`main.ts` 只剩根基础设施：`Log` / `LoggerConsole`、`TimerService`、`HttpService`（`ctx.http`，见 [plugin-system.md](plugin-system.md)"HTTP 和代理"）、`ConfigService`、`BotsService`、`PluginService`（WebUI 本身是核心条目 `builtin:webui`，Dashboard、日志也是条目，见 [plugin-system.md](plugin-system.md)"外壳和核心页面"；邮件通知的发测试邮件路由原来也由 `main.ts` 挂，现在是那个条目的 standby 部分，见 plugin-system.md"内置插件"），以及一个 `ctx.inject(['config'])` 块（版本日志、logLevel、配置文件监听，**启动时首播一次 `llob/config-updated`**）。其余都由依赖驱动：

- **`builtin:nt-protocol`**（`inject: ['config']`）挂载选定的协议实现、登录前可用的 `NTLoginApi` / `NTSystemApi` 及登录路由。私有 `loginResources.ts` 监听登录与退出，在身份就绪后创建隔离数据库（`<uin>.v3.db`）、Core、Store，以及 Friend / Group / User / Msg / File / Web API。没有公共账号服务。
- 原设计把数据库 / Core / 登录后生命周期拆成 `builtin:store` / `builtin:nt-core` / `builtin:nt-lifecycle` 三个条目，**没有采用**：它们只服务扫码账号，跟着协议条目一起起停最简单，插件页也少三张无法单独操作的卡片
- OneBot、Milky、WebQQ、中立层的 NTQQUniversal 按实际使用的 `app` / `store` / NT API 等服务等待；Satori 只依赖 `bots`，可独立服务官方机器人。邮件通知监听协议事件并读取协议状态，首次登录前不报告断线。
- 启用顺序：`qqProtocol` → Login / System API 和登录路由；完整登录身份 → 私有资源分支（数据库、Store、NT API、Core）→ 依赖这些服务的适配器、WebQQ、NTQQBot。

## 2. 不变量（重连安全）

> **临时网络断线只更新状态与事件，不卸载服务。身份变化、明确退出或协议停用才销毁身份绑定的资源。**

断线时若 `qqProtocol` 等服务消失、重连时再出现，cordis 会把 Core、Store、适配器、WebQQ、中立层全部拆掉重建。所以：

- `QQProtocolBase` **不能**加 `[Service.check]`（比如 `return this.isConnected()`）。连接状态继续走 `protocol/disconnect` / `qq/online` 事件
- 私有登录资源按 UIN + UID 识别身份，同一身份的重复上线与重连不重复挂载；退出后重新登录即使还是同一个号，也重新初始化资源。
- 明确退出或换号时旧资源先卸载，再创建新身份的数据库和 Bot；协议停用时清理监听器，并让在途的初始化失效。登录监听安装后立即检查已有身份，避免错过启动期间已完成的登录。

## 3. 运行时停用：协议层的清理

`QQProtocolBase[Service.init]` 返回 `stop()`，cordis 卸载条目时 await 它。停用和断线不同，**不发 `protocol/disconnect` / `qq/session-expired`**：消费者正一起被卸载，邮件通知也不该报一次用户主动的"掉线"。

- 基类：`disposed` 标志让二维码循环和 `maybeEmitOnline()` 停下；清断线检测定时器和回调；协议实例的 `selfInfo` 清空成未登录
- 直连：停实例自己的 auth token 监听（`AuthTokenWatcher.stop()`：只摘它挂在 token 文件上的那个监听、清重试。再启用的新实例有新的 watcher，同一个 token 照样触发登录）；`qrPollToken` / `initToken` 自增让在途的扫码轮询和 init 退出；清重连定时器、停心跳；**先**从 client 摘掉本实例的监听（不然 `close` 会安排重连），再 `clearSession()` + `disconnect()`。存盘的 session 不删，再启用时直接恢复，不用重新扫码
- **`DirectProtocolClient` 跨实例共用**（`direct.ts` 的模块级 `sharedClient`）：native sign 的 relay 只绑第一个 client、无法重绑，所以停用只断开它，再启用的新实例接着用同一个对象（走"已有 client"分支：换 token / uin / guid、清 session），只重新挂自己的监听
- NativeQQ：`generation` 自增让在途的 probe 和原生事件作废，收掉会话的 token watcher 和 probe 定时器、清响应监听，再 await `native.stop()` 等原生会话结束（Windows debugger 模式解除调试、保留 QQ 进程）；`waitConnected()` 在停用后拒绝而不是永远等
- 邮件通知的 disposer 改用 `ctx.get('qqProtocol')?.offDisconnect()`：协议条目先没了的时候它已经不在
- 给桌面端的 IPC（`LL_IPC_PIPE`、`startIpcServer()`、`setLoginState()`）2026-11-02 整个去掉了：登录状态看 `/api/login-info`，停止 Bot 靠信号或 `--parent-pid=<PID>` 的父进程监视（也支持 `--parent-pid <PID>`，不再读取环境变量；`src/main/hostLifecycle.ts` 每秒检查一次，父进程没了就 dispose 再退出）。重复参数取第一个；缺失、无效或指向 Bot 自身的 PID 不启用监视。

## 4. 账号 / 数据库

- `ctx.account` 和 SDK 的 `Account` 类型已删除，没有新增 `ntAccount` 等替代服务。插件的账号入口为 `session.bot` / `ctx.bots`。
- **账号记录属于协议实例**：`QQProtocolBase.selfInfo`（uid / uin / nick / online）由登录、退出、掉线和昵称更新维护。NT 内部及已有 NT 专属组件读取 `qqProtocol.selfInfo`；普通插件只通过 Bot 的 `selfId` / `user` / `status` 获取通用信息。身份绑定资源保存初始化时的身份，换号后重建，不能继续使用旧数据库路径或旧 Bot 的 `selfId`。
- **Auth Token 的状态也在协议实例上**（owner 2026-10-30）：`QQProtocolBase.authTokenStatus`（hasToken / validation / message / loginError）。纯协议和官方 QQ 客户端桥接都要 Auth Token：桥接在本机 QQ 起来之后才建 watcher，校验通过的 token 交给 native 的 `setAuthToken`。写它的是实例自己的 `AuthTokenWatcher`（`direct-lib/authTokenWatcher.ts`，原来是模块级的状态和函数，`stop()` 得手动清 `lastValidToken`）和 `direct.ts` 的登录流程；`sign.ts` 仍是进程级（native sign 的 relay 只绑第一个 client），不再自己写：签名时 sign 服务器回 403（比如这个 token 能登的 QQ 数量满了）经 `setupSign({ onRefused })` 交给它绑的那个 client，client 发 `sign-refused`，当前实例在 `bindDirectClientEvents` 里收，停用时跟别的监听一起摘掉。原来它是 `direct-lib/authTokenStatus.ts` 的模块级对象，停用再启用会带着上一个实例的 loginError
- NT 的消息数据库仍为 `<uin>.v3.db`，只在身份就绪后打开，并隔离 `database` / `model` 服务。通用插件的 `ctx.database` 由 `builtin:database` 提供，是实例级的 `database.db`，官方机器人也能使用，无需等待 NT 登录。
- 实例配置启动时确定，`llob/config-updated` 在启动时广播；Core 初始化时读取配置，不再依靠登录后重复广播。

## 5. WebUI 壳

- `WebuiServer.static inject = ['config']`，构造时自己读 `ctx.config.get().webui`，内建路由只有 config、`bots`、文件选择框列目录用的 `/api/fs/list`（`BE/routes/files.ts`，见 [plugin-system.md](plugin-system.md)「路径选择」）、鉴权中间件、静态文件和两张运行时路由表的分发，不认得任何一个插件
- 扫码登录相关路由（`/api/login-qrcode`、`/api/quick-login-list`、`/api/quick-login`、`/api/logout`、`/api/auth-token`）是 `NTLoginRoutes`（`inject: ['webuiServer', 'ntLoginApi', 'qqProtocol']`），协议停用时经路由表 fallback 返 JSON 404。`nt-protocol/authTokenRoutes.ts` 只读 `ctx.qqProtocol.authTokenStatus`；`POST /api/auth-token` 写 token 文件后调 `ctx.qqProtocol.checkAuthToken()`（纯协议先把状态置成 validating、让 watcher 立刻查；桥接有会话时也让 watcher 立刻查，没有会话时是空操作），路由自己不改状态
- `/api/login-info` 是协议条目的 standby 部分（`nt-protocol/loginInfoRoutes.ts` 的 `LoginInfoRoutes`，`BuiltinPlugin.standby`）：不在 apply 里，协议停用时也在，带 `ntProtocol`（`!!ctx.get('qqProtocol')`）说协议在不在。原来它是壳路由，外壳因此认得 NTQQ；`/api/config` 只有 bot 设置，不再带 `selfInfo` / `ntProtocol`
- `builtin:dashboard` 的 `/api/dashboard/stats` 只有 bot 进程和机器的资源。扫码账号的好友、群、收发数、QQ 进程资源和版本号是协议条目里的 `NTStatsRoutes`（`src/plugin/internal/protocol/nt-protocol/statsRoutes.ts`，`/api/ntqq/stats`），由插件自己挂进 Dashboard 的卡片读（`client/DashboardCards.tsx`）；原来的 `/api/device-info` 并进了它
- 前端没有扫码登录门，读完 `/api/config` 就进主界面。扫码登录在 `builtin:nt-protocol` 自己的设置页「NTQQ 协议」（插件自己的界面 `src/plugin/internal/protocol/nt-protocol/client/`：`NTProtocolPage.tsx`、`QQLogin.tsx`、`AuthTokenForm.tsx`、`LoginMethod.tsx`，只用 plugin SDK，见 [plugin-system.md](plugin-system.md)"内置插件的界面"；页面 id `ntqq`，order 5）：协议启用时在侧边栏，停用后卡片的「前往设置」仍能打开。页面每 3 秒轮询 `/api/login-info`（协议条目的 standby 部分，协议停用也在，停用时也问：登录方式要用它的 `pins`）和 `/api/auth-token/status`（协议启用时才问）。顶部是登录方式（§6），下面依次显示：未启用 / 协议启动中 / 官方 QQ 客户端桥接还没有会话时的「启动 QQ」（`LaunchQQ`，见下一条）/ Auth Token 表单（`AuthTokenForm`，内联；原来那个不能关的弹框会盖住整个 WebUI）/ 快速登录和扫码（`QQLogin`，桥接时二维码来自 QQ 客户端；先读快速登录列表，有账号才显示快速登录，空列表显示扫码和「重新读取账号」。读取期间也可选扫码。桥接要等本机 QQ 起来才画这一块，并支持在当前 QQ 会话选择账号快速登录；旧原生包缺少接口时明确返回 HTTP 501。列表就绪、重试和登录结果的处理见后文「快速登录（桥接）」）/ 已登录账号卡片（在线状态；纯协议可退出登录，桥接的登录归 QQ 客户端管）。全局设置弹框里的「退出 QQ」挪到了这里。登录方式下面常驻一行 Auth Token（`AuthTokenCard`，2026-11-02）：状态（还没有录入 / 校验通过 / 正在校验 / 无效 / 暂时校验不了）和「设置」按钮（owner 2026-11-05，入口统一称为「设置 AuthToken」），点开是 `AuthTokenForm` 的 `replace` 形态，表单标题为「设置 Auth Token」（可取消；账号在线时不把"在线"当成功，等新 token 的校验结果）。原来只有没 token 或 token 无效时才有录入框，token 有效以后（已登录、或 sign 服务器拒了这个 token）没地方换。大表单显示时这一行不显示，桥接要等本机 QQ 起来才显示。登录方式的编辑框里选了另一种方式还没保存时，下面不画旧方式的登录界面，只说"保存后改用…登录"（`LoginMethod` 的 `onDraftMode`）
- **官方 QQ 客户端桥接的启动和状态**（owner 2026-11-02）：桥接不再随协议自动拉起 QQ。协议启动时只建 `NativeQQ`，会话（启动 QQ、注入）等页面上的「启动 QQ」（`POST /api/nativeqq/launch` → `qqProtocol.launch()`，两次点击只起一个会话）；没人能点按钮的场合照旧自动启动：启动时给了快速登录的号（`-q` 或 NativeQQ 配置文件的 `quick_login_qq`）、docker（`/.dockerenv`）。启动前先确认要启动的 QQ 在（`NativeQQProtocol.qqToStart()`：配置了 `qq_path`（WebUI 选的、`--qq-path` 或配置文件里的，相对路径按原生模块的目录算）就看它是不是文件，没配置就用 `detectQQPath()`），不在就直接报中文原因，不去调 `native.start()`：原生模块这时的报错是英文的 `QQ executable not found; set config.qq_path`，`config.qq_path` 是配置文件里的字段，WebUI 上没有，用户看了不知道怎么办（2026-11-02 实测：没有这个检查时点「启动 QQ」就是这句，会话变成 failed，协议不停）。启动面板写出将启动哪个 QQ（选了的，或自动检测到的；启动时给了配置文件就不写，那里面可能另有 `qq_path`），没检测到时启动前就用黄色提示去安装或选择，启动失败后再检测一次（可能刚装上）。会话失败或停了（`health()` 报 failed / stopped，或 native 发 error / stopped 事件）只收掉这个会话的 watcher 和轮询，协议不停，页面换成"重新启动 QQ"和失败原因；页面发起的启动失败也不停协议（自动启动失败仍是条目失败）。**状态以 NativeQQ 为准**：`/api/login-info` 的 `nativeQQ.status` 是 `bridgeStatus()` 从 `health()` 读出的 `{ session（stopped / starting / running / stopping / failed）, failure, authTokenSet, qqRunning（qq_pid）, loggedIn（uin 和 uid 都有）, qrcodeAvailable }`，在线与否照旧由 probe 每秒读 `health()` 的 uin / uid。`probe` 用箭头函数字段绑定协议原实例，避免从 `ctx.qqProtocol.launch()` 启动后每轮轮询叠加 Cordis shadow，最终触发堆栈溢出。页面按它画：会话没在跑 → 启动面板（starting / stopping 时转圈）；跑着但 QQ 进程还没起来 → "正在启动 QQ"；起来了 → 快速登录 / 扫码；登录了 → 账号卡片。QQ 起来之前每秒问一次 login-info，平时 3 秒。会话没在跑时 token 状态没有意义（还没有 watcher），页面不据它弹 Auth Token 表单；桥接没有会话时也不留离线的账号卡片（没有会话就不会自己重连）。**账号在线时登录方式只读**（两种方式都是）：不给"更改"，写着"退出登录后才能更改"（桥接是"在 QQ 客户端里退出登录后"），编辑中账号上线编辑框会关掉
  - 登录后不用刷新整页：侧边栏底部的账号卡片按 `/api/bots` 列出各协议端的账号和状态，Dashboard 的 NTQQ 卡片自己轮询，WebQQ 打开时自己拿账号（见 [plugin-system.md](plugin-system.md)"内置插件的界面"）。原来侧边栏账号、WebQQ 按账号的持久化、QQ 版本号只在页面加载时取，NTQQ 页看到登录就刷新整页，不在 NTQQ 页时自动恢复的登录则不更新侧边栏；现在 NTQQ 页只提示"QQ 登录成功"。反方向：纯协议账号掉线时卡片显示"离线"，用户点「重新登录」才切到扫码，免得断线重连期间自动去拉二维码。桥接账号离线直接回到登录流程：会话停止时显示「启动 QQ」，QQ 启动中显示进度，QQ 已启动但未登录时显示快速登录 / 扫码；不保留「正在自动重连」的离线卡片（2026-11-09）
  - 快速登录（直连）：`POST /api/quick-login` 等到有结果才返回。`DirectQQProtocol.quickLogin()` 等 init 跑完（另一个 init 正在跑时最多再等 60 秒，它转回来会用上这个 uin），上线了就成功，没上线就抛出原因（`restoreError`：session 恢复时 `registerOnline` 的报错），路由回 500 带这句话。原来 init 恢复失败只记一行 info 就悄悄退回扫码，请求照样回成功，页面一直停在"正在登录"。前端：按钮显示"正在登录 <昵称>…"直到有结果；成功立刻轮询一次（不等 3 秒），页面换成账号卡片；失败把原因留在页面上的红框里（toast 容易错过），并切到扫码
  - 快速登录（桥接，2026-11-09）：先「启动 QQ」，原生 `getQuickLoginList()` 经 QQ 登录服务读取仍可用且本机未登录的账号。点登录调用原生 `quickLogin(uin)`，在当前 QQ 会话发起登录；原生接受请求后，Bot 继续等 health 确认所选 UIN 和非空 UID（最多 60 秒），才返回成功。重复提交同一账号共用请求，其他账号必须等待；会话停止或换代使旧请求失败。旧原生包缺少列表或登录接口时返回 HTTP 501 和明确提示，不再把接口缺失伪装成空列表。前端对暂时失败和未就绪每 2 秒重试，最多 60 次；等待时可扫码，之后读到账号不改变用户已选的扫码方式。超过重试次数可「重新读取账号」。
  - 状态提示在各插件自己的页面上（owner 2026-11-02：原来主界面每一页的顶上都有一排，哪个插件的事都挂在那里）。规则见 [plugin-system.md](plugin-system.md)"内置插件的界面"的"顶部状态提示"：
    - 在等 NTQQ 账号的插件（OneBot 11、WebQQ 等）在它自己的页面上说"要等 NTQQ 账号登录后才会运行"「去看看」（文字来自协议条目 manifest 的 `service.labels.app` / `service.labels.store`），按钮去 NTQQ 页；协议停用时说"需要先启用「NTQQ 协议」"
    - NTQQ 账号没登录或已离线：NTQQ 页本身就是登录界面 / 离线的账号卡片，Dashboard 的 NTQQ 卡片也写着；原来协议条目往 `shell.notices` 放的那条全局提示删了
    - QQ 官方机器人：连接状态在「QQ 官方机器人」标题右侧，以绿点 +「已连接」或灰点 +「未连接」显示（`qq-official/client/ConnectionStatus.tsx`，owner 2026-11-05），不再有单独的顶部连接状态卡片；缺 AppID / AppSecret、插件运行失败等提示仍由 `PluginPage` 显示在设置页上方
    - 外壳顶上只剩跟哪个插件都无关的一条：没有启用任何协议端、也没有在线的 bot
    - `/api/bots` 由外壳每 5 秒问一次（`stores/botsStore.ts`），它和插件列表都回来之前不显示
  - `/api/login-info` 原来带 `webui`（生效的 WebUI 地址），给扫码页在登录后判断"WebUI 被关掉 / 换了端口"并跳转。那是按账号存配置的年代（登录才切换配置）的逻辑，实例模型下登录前后配置相同，连同前端的跳转和 FE `vite.config.ts` 的 `__WEBUI_DEV_PORT__` 一起删了

## 6. 登录方式：纯协议 / 官方 QQ 客户端桥接

owner 2026-10-28：NTQQ 设置页可以选登录方式，纯协议（多种协议可选）或官方 QQ 客户端桥接。原来只能用启动参数定：带桥接的参数就桥接，否则直连，协议看 `--protocol` / `-p` / 环境变量 `PROTOCOL`。桥接的名字 2026-11-02 统一成 NativeQQ（模式 `nativeqq`、设置的 `nativeQQ`、参数 `--nativeqq`、路由 `/api/nativeqq/launch`、docker 的 `PROTOCOL_MODE=nativeqq`），旧名字不再识别；`plugins.json` 里已保存的旧设置由启动迁移 `renameNativeQQSettings()`（`src/main/config/migrate.ts`）改名。

- **设置**：`builtin:nt-protocol` 有了配置（`NTProtocolSchema`，`src/plugin/internal/protocol/nt-protocol/settings.ts`；类型 `NTProtocolConfig` 在 `common/types.ts`），存在 `plugins.json` 的条目里：`mode`（`direct` 纯协议 / `nativeqq` 官方 QQ 客户端桥接，默认 nativeqq）、`protocol`（linux / macos / windows / watch，默认 macos，只对纯协议有意义）、`nativeQQ`（`qqPath` QQ 可执行文件的绝对路径，空的时候用 NativeQQ 自己找到的）。`normalize` 去掉首尾空白，并且重建这个对象，以前存下的 `configPath` 下次保存时就没了。NativeQQ 配置文件（`hook_mode`、`qq_args` 等）2026-11-02 起不在设置里，只能由启动参数 `--nativeqq-config` 给（docker 的 `startup.sh`、冒烟脚本），所以保存的 `ProtocolSettings` 没有它，生效的 `ProtocolSelection.nativeQQ` 里的 `configPath` 只来自启动参数
- **默认值**（owner 2026-11-02）：原来是纯协议 · Linux，改成官方 QQ 客户端桥接、纯协议默认 macOS。条目存盘时不写等于默认值的字段（`stripDefaults`），所以改默认值会改掉所有没写这个字段的条目：从旧版迁来的实例由 `migrateToInstances` 在条目里写明 `{ mode: 'direct', protocol: 'linux' }`，跟原来一样跑（config-storage.md §9）；开发机上已有的条目没迁移（插件系统没发布过），没选过登录方式的会变成桥接、协议变成 macOS。没有 QQ 可桥接的地方由启动参数锁成纯协议：docker 标准镜像的 `startup.sh`、`start-linux.sh --headless` 都带 `--direct`
- **启动参数优先**（`common/utils/environment.ts` 的 `protocolPins()`，进程内算一次 `launchPins()`）：`--nativeqq` 或 `--nativeqq-config <file>`（可再加 `--qq-path <QQ>`）锁定桥接和它的配置；`--direct` 锁定纯协议（协议仍可选，两个都给时桥接的参数优先）；`--protocol` / `-p` > `PROTOCOL` 锁定协议。空值不算（compose 里没设的变量会传 `PROTOCOL=`），不认识的值仍是 linux。docker 的 `PROTOCOL_MODE=nativeqq` 走 `--nativeqq --nativeqq-config`，同样锁定。原来桌面端（`LL_IPC_PIPE`）另有一套锁定（`by: 'desktop'`，提示"由 LuckyLillia 桌面端指定"），随 IPC 一起去掉了
- **生效的选择**：协议条目 apply 时 `resolveProtocolSelection(设置)`（锁定的字段盖过设置）→ `setProtocolSelection()`，再按 `mode` 挂 `DirectQQProtocolClient` 或 `NativeQQProtocolClient`。`isNativeQQMode()` / `currentNativeQQTarget()`（NativeQQ 协议启动时读）/ `getProtocol()` 都看这个选择；协议条目从没 apply 过时退回只看 argv，纯协议的协议这时是默认的 macOS
- **协议一个进程只能定一次**：`DirectProtocolClient` 进程内共用（§3，native sign 的 relay 不能重绑），所以 `doInitDirectClient` 建它之前 `lockProtocol()`，之后 `getProtocol()` 一直返回锁定的那个，`/api/login-info` 的 `lockedProtocol` 告诉前端，改了要重启 LLBot。建 client 之前（还没录入 Auth Token、桥接模式）改协议立刻生效：快速登录列表（session 按 (uin, 协议) 分文件，只列当前协议的）、扫码都用新协议。为此 profile 不能在模块加载时就解析：`appInfo.ts` 原来顶层 `const p = getActiveProfile()`，`client.ts` 的 `DEFAULT_CONFIG`、`telemetry.ts` 的版本串也在加载时读 `AppInfo`，都改成读的时候才取；`getActiveProfile()` 按 `getProtocol()` 的结果缓存（锁定前会跟着变）
- **桥接固定用 linux 的 profile**（启动参数另给的除外）：桥接也读 profile（highway 的 appId、`SsoInfoSync` 的设备信息），原来不带 `--protocol` 就是 linux，不能因为纯协议选过 macOS 就在桥接里换掉。从纯协议切到桥接时 `getProtocol()` 也回到 linux，切回纯协议再回到锁定的那个
- **运行时切换**：保存走 `fiber.update`，协议条目用 `ctx.on('internal/update')` 拦截（见 [cordis-upgrade-notes.md](cordis-upgrade-notes.md)）：只有换了模式、或桥接时换了 QQ 路径（`qqPath`）才放行重启（重挂协议层，当前账号登出，依赖登录后资源的组件跟着重建）；只改协议或纯协议下改 QQ 路径就地更新选择，不断开已登录的账号
- **`/api/login-info`** 多了 `protocol`（生效的 profile）、`lockedProtocol`、`pins`，桥接时还有 `nativeQQ: { configPath, qqPath, connected, status }`（`status` 见 §5）
- **前端**（`src/plugin/internal/protocol/nt-protocol/client/LoginMethod.tsx`，纯逻辑在 `loginOptions.ts`；文件名不能叫 `loginMethod.ts`：Windows 上跟 `LoginMethod.tsx` 只差大小写，`./LoginMethod` 会解析到它；配置经 SDK 的 `usePluginConfig()` 读写）：NTQQ 页顶部一行"登录方式：纯协议 · Linux"，下面是锁定说明（"协议由启动参数 --protocol 指定"，全锁定时"由启动参数 --nativeqq 指定，这里改不了"、没有「更改」）和"已改为 macOS，重启 LLBot 后生效"（这时上面一行写的是正在跑的协议）。「更改」展开表单：两张选项卡片；纯协议有协议下拉（"不同客户端的登录记录分开保存，换了以后要重新登录"，手表另有琥珀色提示能用的接口最少）；桥接只有「QQ 可执行文件」：SDK 的 `PathInput`（输入框加「浏览」，浏览的是 Bot 所在机器的目录，WebUI 可能是在别的机器上打开的；Windows 上只列 `.exe`），留空就用自动检测到的，下面写出检测到的路径，没检测到时提示去选。检测是 standby 部分的 `GET /api/nativeqq/qq-path`（`{ detected, platform }`，协议停用时也能问），实现在 `nt-protocol/qqPath.ts` 的 `detectQQPath()`：原生模块找 QQ 的函数（LuckyLillia.node `crates/injector/src/app.rs` 的 `get_qq_path`，Windows 上调 `qq.rs` 的 `get_qq_path_from_registry`）没有导出给 JS，这里按同样的顺序再找一遍，显示的就是它会启动的那个。Windows 先读注册表 `HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\QQ`，再读不带 `WOW6432Node` 的，取 `UninstallString` 所在目录的 `QQ.exe`（用 PowerShell 读、输出 UTF-8：`reg.exe` 按控制台代码页输出，中文路径会乱码），然后是几个常见安装目录；Linux 是 `/opt/QQ/qq`，macOS 是 `/Applications/QQ.app/Contents/MacOS/QQ`。原生模块的查找顺序改了，这里要跟着改。账号在线时换模式提示"保存后会断开当前登录的 QQ 账号"，协议已锁定时提示要重启。表单编辑的是存盘的设置，锁定的字段只显示锁定值、不写进去，以后去掉启动参数时还是用户自己选的。保存换了模式时页面置 `relogin`，不让旧账号的卡片挂着"离线"
- 插件停用时页面照样显示登录方式，可以先选好再启用

### 自动登录

自动登录（2026-11-09）：NTQQ 页仅在账号登录成功、在线时显示「自动登录」勾选项，勾选即保存当前 QQ 号，取消即清空。配置是实例 `plugins.json` 中 `builtin:nt-protocol` 的 `autoLoginUin`，默认空串；schema 隐藏这个字段，登录方式和勾选项共用页面的一份 `usePluginConfig()`，避免相互覆盖或触发旧 rev 冲突。保存不重启协议，下一次实例启动或协议重新启用时读取：纯协议恢复这个号在当前协议下的 session；桥接自动启动 QQ，并传入 `quick_login_qq`。`-q` / `--qq` 优先于保存的账号，桥接启动配置文件显式填写的 `quick_login_qq` 也优先。手动快速登录后的断线重连继续用当前账号；凭据不可用时仍可扫码登录。

## 7. 验证

- 自动登录回归：`test/unit/bootstrap/ntProtocol.test.ts` 经真实插件服务验证保存不掉线、重启恢复、取消后不再自动登录；`directSession.test.ts` 和 `nativeQQ.test.ts` 验证两种模式的启动账号、启动参数优先级及纯协议的扫码回退。

- 单测：`test/unit/bootstrap/ntProtocol.test.ts`（条目整体：服务分登录前 / 后出现、停用后全部消失且依赖方回到 PENDING、再启用再登录恢复；按设置挂纯协议或桥接，只改协议不重挂、换模式和桥接换地址才重挂）；`test/unit/environment.test.ts`（`protocolPins` 各种写法、`resolveProtocolSelection`、选择 / 锁定后的 `getProtocol()`）；`test/webui/routes/login.test.ts`（`login-info` 的新字段）；`test/unit/plugin-clients/ntProtocolLoginOptions.test.ts`（登录方式的显示和锁定逻辑）；`test/unit/qqProtocol/protocolStop.test.ts`（直连停用的清理、二维码循环停止、再启用复用同一个 client）；`test/unit/qqProtocol/nativeQQ.test.ts`（NativeQQ 会话的所有权、在线判定、停用清理、快速登录列表、启动 QQ 和状态）；`test/unit/config/migrate.test.ts` 的 `renameNativeQQSettings`；`builtins.test.ts` / `service-registry.test.ts` / WebUI 路由测试按新结构更新
- 不登录 QQ 的端到端（照 [plugin-system.md](plugin-system.md) 的方法）：桥接模式和直连（无 auth token）模式下，运行时停用 → `/api/login-*` 404、依赖方 PENDING、没有残留的重连日志；再启用 → 协议重新连接、路由回来。`plugins.json` 里停用协议后启动，日志里没有任何协议层输出
- 登录方式（2026-10-28，浏览器里，临时实例不带桥接的启动参数、没有 Auth Token）：改成 macOS 立刻生效（`login-info` 的 `protocol` 跟着变，不用重启）；改成桥接 → 协议层重挂；改回纯协议回到 Auth Token 表单；带 `--protocol watch` 启动时协议下拉置灰、写明来源；停用协议时也能改，保存后启用按新方式挂载。全锁定和"重启后生效"用 Playwright 改 `/api/login-info` 的 `pins` / `lockedProtocol` 看的
- WebUI（桥接模式，浏览器里）：直接进主界面、「去登录」到 NTQQ 页、运行时停用协议后提示和侧边栏入口消失而卡片仍能打开页面（显示未启用）、再启用回到扫码；已登录卡片、掉线 → 重新登录 → 恢复在线、登录完成后自动刷新、Auth Token 表单提交、退出登录的确认，用 Playwright 改 `/api/config` / `/api/login-info` / `/api/auth-token/status` 的响应验证

## 8. 未验证 / 遗留风险

- **真机未验证**：扫码登录后停用再启用（应当用存盘 session 免扫码恢复）、直连在线时停用（TCP 断开、native sign 的 relay 在同一个 client 上继续可用）、桥接已登录时停用再启用；在 WebUI 里选 macOS / Windows / 手表后真的扫码登录（原来只经 `--protocol` 验证过）、已登录时在纯协议和桥接之间切换
- native sign 的 relay "不可重绑"只据源码注释推断；共用 client 绕开了重绑，但停用期间 relay 收到的请求会因为连接断开失败，要真机确认不会让 native 层 `process.exit`
- 停用后 `selfInfo` 被清空；WebQQ 的页面只在打开时取一次账号，开着的 WebQQ 不会因为换了账号就切过去，要重新打开它
