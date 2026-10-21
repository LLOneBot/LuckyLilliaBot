# 核心插件化：用依赖图驱动整个启动

> 把登录协议层、账号门闸、数据库、WebUI 从 `main.ts` 的硬编码里解出来，全部变成依赖驱动的插件。目标是：一个进程跑什么，由启用了哪些插件决定，而不是由启动参数或 `main.ts` 的写死顺序决定——真正走完"万物皆插件"。
>
> 本文是设计，尚未实施。基线 `feat/plugin-system @ c8236196`。相关设计见本文末"衔接"一节（官方 QQ bot、配置存储）。

## 1. 为什么

P4 把三个适配器、WebQQ、中立层都插件化了，但**登录协议层本身（`qqProtocol` + 8 个 NT API + `account` 门闸 + 数据库）还是 `main.ts` 写死挂的基础设施**，没进插件系统。这一层没插件化，就带来两个限制：

- 接官方 QQ bot 时，没法表达"这个进程只跑官方 bot、不跑扫码账号"——现在 `main.ts` 无条件起扫码/直连那套。
- "开哪个协议"散落在启动参数（`main.ts:98` 的 `isPmhqMode()`）和写死顺序里，而不是统一在插件页管理。

补上这一层之后，三种启动模式都只由"启用了哪些插件"决定，无需任何启动开关：

| 模式 | 启用 |
|---|---|
| 纯扫码/直连账号（现状） | NT 协议插件 |
| 纯官方 bot | 官方 bot 插件 |
| 两者并存（同进程） | 两个都启用 |

机制是现成的：**cordis 的 `inject` 语义就是"依赖的 service 不在 → 依赖它的插件 PENDING（静静等着，不运行、不崩），service 出现 → 自动启动"**。下游（Core/Store/三适配器/WebQQ/中立层）今天已经是用 service 连起来的，只差把协议层本身变成"可启停的条目"——它一停用，它提供的 service 消失，整条 NT 下游自动 PENDING。

## 2. 命门不变量（重连安全）

> **`service present == 插件 enabled`，不等于 `connected`。连接的通断只走事件，绝不触动 service 的生命周期。**

这是整个设计能不能成立的唯一命门。如果把 NT 协议做成插件后，它提供的 `qqProtocol` / `ntMsgApi` 等 service 在**断线时消失、重连时重新出现**，cordis 会在每次断线重连时把所有依赖它的东西（Core、Store、三适配器、WebQQ、中立层）全部拆掉重建——灾难。

现有代码已经满足这个不变量，必须守住：

- `QQProtocolBase` **没有** override `[Service.check]`（全库 `Service.check` 只有 `account.ts:25` 一处）。所以 `qqProtocol` 从 `ctx.plugin()` 挂上那刻起就恒 present，和 TCP/WS 是否连通无关。
- 断线/重连是 service **内部**的事：Direct 的 `'close'` → `scheduleReconnect()`，PMHQ 的 `ws.onclose` → `reconnect()`，两者只 `ctx.parallel('protocol/disconnect')` **发事件**，**不撤 service**。
- `account` 是一次性闩：`markOnline()` 只置 `true` 一次、全文件无处置回 false（`account.ts:35-42`），`[Service.check]` 返回 `online`（`account.ts:25`）。一旦上线就永久 present，断线重连不翻动，下游不抖。三个 `protocol/disconnect` / `session-expired` 消费者（`emailNotification.ts`、`universal/ntqq/index.ts`、`milky/adapter.ts`）都只改状态/发信，无一 dispose 插件。

**硬约束：改造时绝不给 `QQProtocolBase` 加 `[Service.check]`（例如 `return this.isConnected()`）。** 连接状态继续走 `protocol/disconnect` 事件通道。这一条写进 review checklist。

## 3. 目标依赖图

### 留在根基础设施（继续 `main.ts` 里硬编码 `ctx.plugin()`）

无 inject（或仅 inject `timer`）、无条件需要、且是 PluginService 自身运转的前提：

| 节点 | 提供 |
|---|---|
| `Log` / `LoggerConsole` + `bindLoggerFactory` | 日志 exporter |
| `TimerService` | `timer` |
| `ConfigService` | `config`（无 inject，容忍空 uin） |
| `BotsService` | `bots` |
| `PluginService` | `plugins` |
| `WebuiServer` | `webuiServer`（inject 降到 `['config']`，见 §7） |
| `PluginRoutes` | 无（inject `webuiServer`+`plugins`，无 NT 依赖） |
| `DashboardRoutes` / `EmailRoutes` | 路由注册器，已是纯 inject 驱动 |
| 进程级 `unhandledRejection` / `uncaughtException` | — |

`PluginRoutes` 留根是关键：它不碰 NT，官方-only 进程也能挂出 `/api/plugins` 管理页，解开"要靠 WebUI 开官方 bot，WebUI 却依赖 NT"的鸡生蛋。

### 变成可启停的 builtin 条目

- `builtin:nt-protocol`：协议实现 + 8 个 NT API + `AccountService`（§4）
- `builtin:store`：`Database` + `SQLiteDriver` + `Store`（§5）
- `builtin:nt-core`：`Core`（`app`）（§5）
- `builtin:nt-login-routes`：WebUI 的扫码/快速登录路由（§7）
- `builtin:nt-lifecycle`：登录后的 config 重解析+广播等 account 门后的裸副作用（§6）
- 官方 bot：第二个中立层 producer，单独条目（§8）
- 既有的 `builtin:onebot11/satori/milky/webqq/email-notification/ntqq-universal` 不变

### 目标 main.ts 形态（无任何 `ctx.inject([...], cb)` 块）

```
ctx.plugin(Log); ctx.plugin(LoggerConsole, { levels: { default: isDebugEnabled() ? 3 : 2 } })
bindLoggerFactory(name => ctx.logger(name))
ctx.plugin(TimerService)
ctx.plugin(ConfigService)
ctx.plugin(BotsService)
ctx.plugin(PluginService, { file, roots, hmr, builtins: builtinPlugins })
ctx.plugin(WebuiServer)        // static inject = ['config']，波 0 即起
ctx.plugin(PluginRoutes); ctx.plugin(DashboardRoutes); ctx.plugin(EmailRoutes)
process.on('unhandledRejection', ...); process.on('uncaughtException', ...)
```

### cordis 的起停波次（无显式 sequencing，图自己算出来）

- **波 0**：`timer` `config` `bots` `plugins` `webuiServer`（只需 config）→ 三个路由注册器挂载。**WebUI + 插件页此刻已可用，零 NT 依赖。**
- **波 1**（`builtin:nt-protocol` 启用）：`qqProtocol`（inject config，立即起）→ `ntFriendApi/ntGroupApi/ntLoginApi/ntSystemApi`（仅 inject qqProtocol）就绪；`nt-login-routes` 随 `ntLoginApi` 挂；`AccountService` 注册但 check=false。协议开始跑登录 loop。
- **波 2**（首次 `qq/online` → `account.check` 翻真）：`builtin:store` 起 → `ntMsgApi/ntUserApi`（inject store）→ `ntFileApi/ntWebApi` → `builtin:nt-core`（`app`）→ `nt-lifecycle` 做登录后那次 config 重解析+广播。
- **波 3**（account + 全 NT API + app + store + bots 齐）：`ntqq-universal`（core）、三适配器、webqq、email → `EmailRoutes`。

官方-only（`builtin:nt-protocol` 停用）：波 1 之后一切（含 `account`）全部 absent，NT 下游全 PENDING 不崩，shell + 插件页照常波 0 起。

> 一个反直觉的事实（审计发现）：今天 8 个 NT API 里，只有 `ntFriendApi/ntGroupApi/ntLoginApi/ntSystemApi`（仅 inject qqProtocol）能在登录前就绪；`ntMsgApi/ntUserApi` 直接 inject `store`、`ntFileApi/ntWebApi` 经 `ntUserApi` 间接依赖 store，而 store 在账号门后——所以这 4 个本来就是登录后才 active。图化后这个分档由 inject 自然得到，不用手排。

## 4. NT 协议条目 `builtin:nt-protocol`

apply 内一次性注册整棵子树，随 fiber 卸载：

```
apply(ctx) {
  ctx.plugin(isPmhqMode() ? PmhqQQProtocolClient : DirectQQProtocolClient)  // 提供 qqProtocol
  ctx.plugin(NTFileApi); ...; ctx.plugin(NTSystemApi)                        // 8 个 NT API，各自独立条目
  ctx.plugin(AccountService)                                                 // 提供 account
  // 内聚 main.ts 现在两个 inject 块里属于协议生命周期的裸副作用：
  const config = ctx.config.get()
  setConfigLogLevel(config.logLevel); applyDebugLevel(ctx)
  ctx.on('llob/config-updated', c => { setConfigLogLevel(c.logLevel); applyDebugLevel(ctx) })
  ctx.on('qq/online', handleOnline); if (selfInfo.online && selfInfo.uid) handleOnline()
  ctx.on('llbot/self-nick-changed', ...); ctx.on('protocol/disconnect', ...)
  startIpcServer(); setLoginState({ state: 'initializing' })
}
```

**提供的 service**：`qqProtocol`、`ntFileApi`…`ntSystemApi`、`account`。

**关键收益**：今天 `AccountService` 无条件挂（`main.ts:108`），`account` 永远 present、只是 check=false；收进条目后，**停用 NT → `account` 完全 absent**，下游因缺 service 而 PENDING，比"present 但 check=false"更强更干净。语义依据：`AccountService` 只依赖 `selfInfo` 全局 + `qq/online` 事件，二者只由 NT 层产生（审计穷举确认所有 `selfInfo` 写点都在 `qqProtocol/*`、`dispatcher.ts`、`user.ts`）。

**8 个 NT API 保持各自独立条目、各 inject `qqProtocol`**，不折进协议本体：它们已形成子图（user→group+friend+store；msg→user+file+store；file→user；webapi→user，webapi 根本不碰 qqProtocol），独立条目让它们的生命周期跟随 `qqProtocol` 的存在性自动 PENDING/ACTIVE。

**direct vs pmhq：单入口，内部按 arg/config 选**，不暴露成两个可并存的 toggle。两个实现都 `super(ctx, 'qqProtocol')` 同名 service，同时启用必冲突；native sign addon 进程常驻、relay 绑定一次不可重绑，运行时热切不干净。真正要并存的"官方 bot"是第二个中立层 producer（§8），不提供 `qqProtocol`/`account`。

## 5. account / uin / 数据库 解耦

- **account 由 NT 条目提供**（§4）。一次性闩 + `Service.check=online` 是重连安全的基石（§2）。
- **官方-only 的 selfInfo**：无人填充，`selfInfo` 保持 `{uid:'', uin:'', nick:'', online:false}`，**不崩**。所有启动/构造期读点都在门后（DB path、`NTQQBot.selfId=selfInfo.uin`）或在 `qq/online`/`nt/*` handler 内永不触发；唯一启动期裸读是 `ConfigService.get()`（空 uin 已 handle）和 WebUI 几个路由读空串（不抛）。官方 bot 以 appid 身份、satori 守卫 `platform !== 'llonebot'` 天然隔离，绝不喂假 uin 进 account。
- **数据库拆成两个条目**：
  - `builtin:store` = `Database` + `SQLiteDriver` + `Store`
  - `builtin:nt-core` = `Core`（`app`），保留 `core.ts:87` 的 NT API 依赖，自然等登录

> **store 的 gating 定为保守档（重要，否决了评审原方案的"默认档"）**：`builtin:store` **inject `['account']`**，DB path 继续用 `account.uin`，即 `${uin}.v3.db`。官方-only 首版就先没有 store。
>
> 评审原方案曾建议"默认档"：store 只 inject `['config']`、在波 0 就起、path 由身份服务取 key，好让官方-only 也有 store。**这条被否决**——因为 SQLiteDriver 的 path 在构造时固定，store 若不等 account，登录前（且未带 `-q <uin>`）根本拿不到 uin，只能落 `default.v3.db`。老用户 QR 登录升级后就会落到空库，丢掉 `${uin}.v3.db` 里的 message shortId 映射、文件缓存、uix 表——撤回/引用/文件转发静默失效。"官方-only 有 store"和"NT 维持 `${uin}.v3.db`"在单一 store 条目下互斥。保守档让 NT 行为零变化；官方 bot 真需要 store 时，另给它一个按 `qq:<appid>` 取 path 的**第二个** store 实例，而不是让一个 store 同时服务两种身份。

## 6. 登录后的 config 重解析+广播：必须留在 account 门后

`main.ts` 现在在 account inject 块顶部先 `ctx.config.get(false)`（用登录后的 `selfInfo.uin` 把 configPath 重解析为 `config_<uin>.json`）再 `ctx.parallel('llob/config-updated', config)`。这次广播驱动三件事：WebUI 按新 host/port 从波 0 的 default 端口迁到账号配置指定端口、`Store` 的 `msgCacheExpire` 更新、logLevel 重算。

**这一步必须放进一个 account-gated 的 lifecycle 条目（`builtin:nt-lifecycle`，inject `['account','config']`），在登录后执行一次重解析+广播。** 绝不能挪到永远在的 shell：shell 在波 0、uin 为空，`config.get(false)` 走 default 且不缓存，登录后没有任何东西再触发第二次广播 → WebUI 永远停在 default 端口、logLevel/msgCacheExpire 永远是 default。这是实打实的 NT 回归，写进硬约束。

## 7. WebUI 拆成"永远在的壳 + NT 专属路由"

现状 `WebuiServer.static inject = ['qqProtocol', 'ntLoginApi', 'config']`（`server.ts:42`）——官方-only 两者皆无 → 壳永不启动 → 到不了插件页去启用官方 bot。`server.ts` 注释已声明"WebUI 要在登录前起、只依赖那时就绪的服务"，代码却自相矛盾列了 NT 服务。改法：

1. **`WebuiServer.static inject` 降到 `['config']`**。`config` 波 0 就绪，壳立刻起。
2. **构造函数必须真的去读 config**（落地必改，不是口味）：现状靠 `main.ts:136` 把 `config.webui` 作为构造参数传入；降 inject 后提到顶层 `ctx.plugin(WebuiServer)` 不传第二参，`this.config` 会是 `undefined`，`start()` 的 `if (!this.config?.enable) return` 直接短路，WebUI 根本不起。构造函数内改成 `this.config = ctx.config.get().webui`（`inject=['config']` 保证构造时 `ctx.config` 已就绪）。热更新已由 `server.ts` 的 `llob/config-updated` 监听处理。
3. **`initServer()` 只留与 NT 无关的内建路由**：config、logs、auth 中间件、静态文件 + SPA fallback、两个 runtime-table fallback。
4. **扫码/快速登录路由拆成 `builtin:nt-login-routes` 条目**（照 `DashboardRoutes` 范式，inject `['webuiServer','ntLoginApi','qqProtocol']`，用 `ctx.webuiServer.route()` 挂 `/api/login-qrcode`、`/api/quick-login`、`/api/quick-login-list`、`/api/logout`）。NT 不在时这些 path 经路由表 fallback 自然返 404 JSON，前端拿空快速登录列表/失败会自动切扫码。
5. **断开 authToken 路由对 Direct 的静态耦合**：`routes/authToken.ts` 模块级 `import { triggerAuthTokenCheck } from direct-lib/authTokenWatcher`，把永远在的壳在 module-eval 期就绑死到 Direct 实现，且 `triggerAuthTokenCheck` 是 Direct 专属（PMHQ 模式不适用）。把整条 auth-token 路由并入 `builtin:nt-login-routes`，trigger 改由 Direct 条目注册为事件/service、路由间接触发。

**官方-only 插件页可达**：`PluginRoutes`（inject `webuiServer`+`plugins`，无 NT）留根。壳波 0 起 → PluginRoutes 随即挂 → 浏览器拿到页面 + `/api/plugins` → 操作员启用官方 bot。鸡生蛋解除。

## 8. 与官方 bot、配置存储的衔接

- **官方 bot** = 第二个中立层 producer：platform ≠ `llonebot`（satori 守卫已隔离）、appid 身份、不提供 `account`/`qqProtocol`、不喂假 uin、经 `ctx.bots.register()` 与 NT 并存；两个都启用就是双协议同进程。本设计只负责让官方-only 能 boot（壳+插件页可达、NT 下游干净 absent），官方 bot 的协议实现本身见其专门设计。
- **配置存储**：本设计维持 `config_<uin>.json` 的 per-account 语义、`cleanupConfig` 白名单、builtins 读 `ctx.config.get()` 全部不动。instance-level 字段（webui/log/ffmpeg 不该 per-account）和 `plugins_<uin>.json` overlay + `ctx.storage` 是独立的配置存储设计，本方案不实现也不与之矛盾。

## 9. 分步迁移（每步后 NT 账号体验不变）

每步都能独立验证、独立回滚，默认扫码账号体验在每一步都保持可用。

**Step 1 — WebUI 壳解耦（低风险，收益最高）**
`server.ts:42` inject 降 `['config']` + 构造读 config；`createLoginRoutes` 拆成 `builtin:nt-login-routes`；断开 authToken 的 direct-lib 静态 import。
验证：扫码/quick-login/logout/authToken 照常；临时不启用协议 → 壳仍起、插件页可达、`/api/login-*` 返 404。
回归面：**QR 登录、quick-login、authToken 签名**。

**Step 2 — NT 协议条目（先 `core: true`）**
`main.ts:98-108` + 登录生命周期副作用搬进 `builtin:nt-protocol`（含 8 NT API + AccountService + IPC/banner/logLevel）。首版设 `core: true`（可成条目、启动期可选，但暂不可运行时 disable），不实现 disable 的 dispose，规避泄漏。
验证：默认启动波次、登录、`selfInfo` 填充、重连全不变（direct/pmhq 各测一次）。
回归面：**重连（确认没加 Service.check）、三适配器、中立层、IPC uin 上报/桌面端 banner、登录生命周期**。

**Step 3 — store / nt-core 拆条目**
`main.ts` 的 account inject 块拆成 `builtin:store`（保守档：inject `['account']`，path 用 `account.uin`）、`builtin:nt-core`（`app`），登录后的 config 重解析+广播进 `builtin:nt-lifecycle`（§6）。
验证：NT 模式 DB 文件名不变 `${uin}.v3.db`、message cache/shortId 正常；WebUI 登录后迁端口、logLevel/msgCacheExpire 生效。
回归面：**webqq（直调 `ctx.ntMsgApi`+store）、message_id/shortId、msgCacheExpire、WebUI 登录后迁端口**。

**Step 4 — main.ts 清空 inject 块**
删两个 `ctx.inject` 块，顶层只剩 §3 清单。
验证：波次与 Step 3 后一致，纯 inject 驱动。

**Step 5（可选，高风险）— 协议运行时 toggle 的 dispose 补全**
把 `builtin:nt-protocol` 从 `core:true` 降为可 disable，补 teardown：`QQProtocolBase` 返回 disposer（停 qrLoop、清 disconnectCheckTimer / reconnectTimer、`directClient.disconnect()` / PMHQ `ws.close()`）、`authTokenWatcher` 加 `stopAuthTokenWatcher()`。native sign relay 一次性绑定，可能只能支持"disable 一次不可真正换实现 re-enable"，需实测。
回归面：**全部 NT 链 + native sign relay（最高风险）**。

**Step 6（独立并行）— 官方 bot 第二 producer 条目**
见官方 bot 设计。依赖 Step 1（壳可达）；store 用 appid path 另开实例。

**总回归冒烟**（每步后跑）：direct 扫码登录 → 收发群/私聊 → 断网重连 → webqq 收发。

## 10. Owner 决策（含建议默认）

1. **WebuiServer 读 config.webui 的方式** → 默认构造内 `ctx.config.get().webui`，main.ts 彻底无 inject 块。
2. **nt-protocol 的 core 标志** → 默认首版 `core: true`（启动期可选、不触发 dispose 泄漏），运行时 disable 列为 Step 5。
3. **store 的 gating** → 定为保守档（inject `['account']`、path 用 uin）。官方 bot 要 store 时另给 `qq:<appid>` path 的第二实例。**不采用去 uin 化的"默认档"**（§5 说明）。
4. **authToken 路由归属** → 并入 `builtin:nt-login-routes`，trigger 经事件/service 间接触发。

## 11. 未验证 / 遗留风险

- 前端对"无账号的壳 / `/api/login-*` 返 404"的端到端反应，只凭后端返优雅 404 + 协议层 no-op 推断，上线前需真机验证。
- native sign addon 的 relay 是否绝对不可重绑，只据源码注释与 require 单例推断，`.node` 未反编译；Step 5 能否支持真正 re-enable 需实测，可能最终只支持"disable 一次"。
- 保守档下数据库仍在 account 门后，无需担心"DB 初始化时 selfInfo.uid 未就位"——但全部 DB 消费者未做广 grep，Step 3 落地时补查。
