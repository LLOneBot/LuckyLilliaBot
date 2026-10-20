# 插件系统（host 侧）

Bot 进程本身就是一个 cordis 4 应用，插件运行时只是在根 `Context` 上多挂了一个服务：`PluginService`（`ctx.plugins`）。它负责扫描本地目录、读写 `data/plugins.json`、把每个启用的条目 `ctx.plugin()` 成一个 fiber，以及热重载。

作者视角的写法见 [plugin-authoring.md](plugin-authoring.md)。

## 代码位置

| 文件 | 作用 |
|---|---|
| `src/plugin/index.ts` | `PluginService`：条目状态机、enable / disable / updateConfig / reload / describe |
| `src/plugin/manifest.ts` | 扫描插件根目录、解析 `package.json` 的 `llbot` 字段、SDK 版本比对 |
| `src/plugin/store.ts` | `data/plugins.json` 读写 |
| `src/plugin/resolve-hook.ts` | `module.registerHooks` 解析钩子 |
| `src/plugin/watcher.ts` | 目录监听（热重载） |
| `src/main/builtins.ts` | 内置插件表：三个适配器、WebQQ、邮件通知、中立层 |
| `packages/plugin-sdk/` | `@luckylillia/plugin-sdk`，yarn workspace，单独发 npm |
| `examples/plugins/` | dogfood 插件（不进 dist） |

`PluginService` 在 `src/main/main.ts` 里紧跟 `ConfigService` 挂载，早于协议层和登录。插件需要登录后才有的服务就自己 `inject`，没就绪时 fiber 停在 PENDING，cordis 会在服务出现后自动拉起 —— 运行时不关心登录状态。

**登录门闸 `account`**（`src/main/account.ts`）：取代了原来 `main.ts` 里的 `sessionLoaded` 布尔 + `loadPluginAfterLogin()`。它用 cordis 的 `Service[Service.check]`：首次 `qq/online` 前 check 为 false，依赖方停在 PENDING；之后 `reflect.notify(['account'])` 让它们拉起，断线重连不撤销。`main.ts` 里一个 `ctx.inject(['account', 'config'], ...)` 回调负责切到账号配置文件（`config.get(false)`）、首播 `llob/config-updated`，再挂数据库、`Core`、`Store`；适配器等改由 `PluginService` 作为内置条目装载（见下文"内置插件"）。`ctx.get('account')` 不看 check，判断它是否可用要用 `reflect._getImpl` + `check`（`PluginService.missingDeps` 就是这么算的）。

## 中立层（Satori）

插件只看到平台无关的一层：`ctx.bots`、`Session` 和 `bot/*` 事件，类型定义在 SDK 的 `packages/plugin-sdk/src/universal.ts`。数据模型直接用 `@satorijs/protocol` / `@satorijs/element`（不依赖 cordis）；`@satorijs/core` 还停在 cordis 3，不能用，`Bot` / `Session` 是自己实现的。

```
qq/raw ─► dispatcher ─► nt/*（28 个，平台原生层）
                         ├─► Core / OneBot11 / Milky / WebUI     各自照旧订阅
                         └─► NTQQUniversal ─► ctx.bots.dispatch(bot, event)
                                                ├─ 全部事件    ─► bot/session（parallel 旁路）─► Satori 适配器
                                                ├─ 别人的消息  ─► bot/message（waterfall 中间件链）
                                                └─ 其余事件    ─► bot/event（parallel）
```

- **`nt/*` 永久保留**，不是过渡态：`nt/pin-changed`、`nt/ptt-trans-result`、`nt/profile-like`、`nt/group-essence-message-changed` 在 Satori 里没有对应事件，OneBot / Milky 依赖这些细节
- `src/universal/bots.ts`：`BotsService`（`ctx.bots`）。`register(bot)` 用调用方的 `ctx.effect` 登记，调用方插件卸载时 bot 自动注销 —— 靠的是 cordis 的 tracker：经 `ctx.bots` 访问时方法里的 `this.ctx` 是调用方的 ctx。这些方法跑在实例的 shadow 上，只能改字段内容、不能重新赋值字段
- **`bot/session` 是不受中间件影响的旁路**：每个事件路由前先广播一次，监听器出错只记日志、不影响路由。Satori 适配器只订阅它 —— 若挂在 `bot/message` 上，本地插件的中间件（比如黑名单）就能决定 Satori 客户端看到什么，而 OneBot 仍直接订阅 `nt/*`，两边会不一致
- **Satori 适配器不再自己转换事件**：原来的 12 个 `nt/*` 监听和信封构造删掉了，信封由 `NTQQBot.event()` 按原格式构造（`id` 兼容字段、`login` 只带 `sn/user/platform`、`login.sn` 恒为 1），`test/unit/satori/adapter.test.ts` 逐字段比对。Satori 客户端因此依赖中立层，所以它是不能停用的核心内置条目
- **bot 自己发出的消息不进 `bot/message`**，走 `bot/event`：中间件只看它能回应的消息，避免回复自己造成循环（Koishi 也是这么做的）
- `bot/before-send` 只覆盖经 `bot.sendMessage` 发出的消息。OneBot / Milky 的 `send_msg` 直接调 `ctx.app.sendMessage`，刻意不拦：否则插件能悄悄改写下游客户端的消息。真有需要时在 `Core.sendMessage` 加钩子，按 breaking change 处理
- `src/universal/session.ts`：`Session` 的驼峰字段都是从 snake_case 的 Satori 事件里读的；`elements` 是对 `content` 的懒 `h.parse()`
- `src/universal/ntqq/`：`NTQQUniversal` 插件（内置条目 `builtin:ntqq-universal`，`inject` 带 `account`：bot 就是登录的账号）和 `NTQQBot`。`NTQQBot.platform` 是 `llonebot` —— Satori 适配器的历史值，下游 Satori 客户端靠它识别，不能改

**转换器复用的是 Satori 适配器的现成代码**：

| 能力 | 位置 |
|---|---|
| NT 消息 → `h[]` / Satori 资源 | `src/satori/utils.ts` 的 `decodeElement()` / `decodeMessage()` 等 |
| 12 种 `nt/*` → Satori 事件 | `src/satori/event/*.ts` 的 `parseXxx(host, data)`，`host` 是 `src/universal/types.ts` 的结构性接口 `NormalizeHost`（只要 `ctx` 和 `event()`），现在只有 `NTQQBot` 调用 |
| `h[]` → NT 发送元素 → 发出 | `src/satori/message.ts` 的 `MessageEncoder` |
| Bot 的可选能力 | 直接调 `src/satori/api/*` 里对应的 handler |

这些文件仍在 `src/satori/` 下，按理应提升到 `src/universal/ntqq/`，留作后续整理。`NTQQUniversal.inject` 必须覆盖转换器和 `MessageEncoder` 经 `ctx` 访问的全部服务（目前和 `SatoriAdapter.inject` 一致），否则 cordis 严格模式下会抛 `cannot get property without inject`。

以后接 QQ 官方机器人：写一个适配器插件，实现 `Bot`（`sendMessage` 必须，其它按平台能力挑），发送前调 `ctx.bots.beforeSend()`，收到的事件转成 Satori 事件后 `ctx.bots.dispatch()`，在 apply 里 `ctx.bots.register(bot)`。不需要碰任何 `nt/*`。

## 插件包与条目

**包**：插件根目录（默认 `data/plugins/`，外加任意个 `--plugin-dir <path>`）下的子目录，`package.json` 里有 `llbot` 字段才算。`@scope/` 目录会再往下找一层。入口按 `exports` → `main` → `index.js` 解析。同名包只认第一个，其余打 warn。

**条目**（`data/plugins.json`）：

```json
{
  "version": 1,
  "hmr": false,
  "entries": [
    { "id": "7f3a9c21", "name": "luckylillia-plugin-echo", "config": { "prefix": "echo " } },
    { "id": "b1d4e880", "name": "luckylillia-plugin-echo", "disabled": true }
  ]
}
```

- `id` 是 8 位 hex，落盘后不变。同一个包可以开多个实例，所以不能用包名当主键
- 形状对齐官方 `@cordisjs/plugin-loader` 的 `EntryOptions`（少了 `group` / `inject`），将来换官方 loader 不用迁移文件
- 单独成文件，是为了避开 `ConfigService.cleanupConfig()` —— 它以 `defaultConfig.ts` 为白名单递归删掉不认识的 key
- 读用 JSON5（允许手写注释）。解析失败时把原文件改名为 `plugins.json.broken-<ts>` 并以空条目启动，不会被下次保存覆盖
- 扫描到从没见过的包，会自动建一个 `disabled: true` 的条目，让它出现在 WebUI 里，但不会自动执行
- 全局一份、不分账号。同一个 `data/` 下跑多个账号会共用插件配置，是已知限制

## 内置插件

`src/main/builtins.ts` 把原来写死在 `main.ts` 里的几个模块登记成内置条目，交给 `PluginService`（`Config.builtins`）装载，在 WebUI 插件页和第三方插件同列、同一套开关：

| 条目 | 内容 | 设置页 |
|---|---|---|
| `builtin:onebot11` / `builtin:satori` / `builtin:milky` | 三个协议适配器 | `onebot` / `satori` / `milky` |
| `builtin:webqq` | WebQQ 后端（`src/webui/BE/routes/webqq/index.ts` 的 `WebQQ`） | — |
| `builtin:email-notification` | 掉线邮件通知 | `other` |
| `builtin:ntqq-universal` | 中立层，**core** | — |

- 条目照样存在 `data/plugins.json` 里（随机 id），只是 `name` 带 `builtin:` 前缀（npm 包名不能含冒号，不会撞）。启动时每个内置插件保证恰好一个条目：没有就建一个**启用**的（老版本升级上来行为不变），手写出来的重复条目丢掉，core 条目上的 `disabled` 忽略
- 内置插件只有一个实例：它们提供具名服务（`onebot` / `satori` / ...），两个实例会抢同一个名字。`add` / `remove` / `updateConfig` / `describe` 对内置条目、`disable` 对 core 条目都抛 `PluginForbiddenError`（HTTP 403）
- **配置仍在 `config_<uin>.json`**，不进 `plugins.json`：条目开关只决定装不装，`ob11.enable` 等原来的开关照旧。适配器包了一层 `withBotConfig()`：`inject` 是 `account` + `config` + 适配器自己的依赖（条目因此在依赖齐之前显示 pending，而不是"外壳 active、里面 pending"），`apply` 里按原来 `main.ts` 的拼法从 `ctx.config.get()` 取配置再 `await ctx.plugin(适配器)` —— await 让适配器启动失败变成条目的 `failed`。`test/unit/bootstrap/builtins.test.ts` 逐字段比对拼出来的配置
- `reload` 对内置条目是重启（dispose + 重新挂载，没有模块可重新 import），会读到最新配置
- **停用要真能停下来**：改造前适配器从不在运行时卸载，OneBot / Satori / Milky 的 `[Service.init]` 都返回 `noop`，停用后端口不释放，再启用就 `EADDRINUSE`。现在它们返回关服务器的 disposer（cordis 卸载时会 await）。Satori 的 `/v1/internal/onebot11/:action` 原来缓存了一份按 OB11 实例构造的 action 表，OB11 重启后会指向已卸载的实例，改成每次从当前的 `ctx.get('onebot').actionMap` 取
- 前端：插件页分"内置 / 已安装"两区，内置卡片有"内置 / 核心"徽章，core 的开关置灰；设置按钮跳到对应设置页（改 `location.hash`，`App` 监听 hashchange）。设置页顶部的 `BuiltinDisabledNotice` 在对应内置条目被停用时提示"这里的设置不会生效"。WebQQ 的侧边栏入口由它的内置前端客户端注册（见下文"插件前端"），随 `builtin:webqq` 的状态出现和消失；插件没在运行时直接打开 `#webqq`，显示 `PluginPageUnavailable` 说明原因
- **WebQQ 插件**（`builtin:webqq`）：路由、上传目录、`/api/webqq/events` 的 SSE 连接，以及往 SSE 推消息的 4 个 `nt/*` 监听（`routes/webqq/events.ts`）都在插件里，`inject` 列出路由代码直接访问的全部服务，登录后才挂载。停用时主动 `abort()` 还开着的 SSE 连接，否则页面会一直挂在一条没人写的流上。路由文件留在 `src/webui/BE/routes/webqq/` 没搬目录
- 插件只需要 `inject` 自己**直接**访问的服务：经 `ctx.xxx` 调到别的服务的方法时，cordis 按那个服务自己的 fiber 做严格检查（`createShadow` 的 `defSite` 是服务本身的 ctx），调用方 ctx 只决定方法里注册的副作用挂在谁身上。但像 `Core.sendMessage(ctx, ...)` 这种把 ctx 当参数传进去的，参数 ctx 访问的服务要算在调用方头上
- `pending` 的条目缺 `account` 时，前端只显示"等待 QQ 登录"：登录后才有的服务（`app` / `store` / `database` ...）都是它的结果，列出来没有意义

## 状态

`PluginStatus.state` 由 fiber 状态加几种 fiber 之外的情况组成：

| state | 含义 |
|---|---|
| `missing` | 条目引用的包不在任何插件根目录里 |
| `incompatible` | 插件声明的 `peerDependencies['@luckylillia/plugin-sdk']` 不满足 host 自带的 SDK 版本，不加载 |
| `loading` | 正在 import 模块，或 fiber LOADING / UNLOADING |
| `pending` | fiber PENDING：`inject` 的服务还没就绪，`missingDeps` 列出缺哪些 |
| `active` | fiber ACTIVE |
| `failed` | import 失败、`apply` 抛错，或配置没通过 schema 校验；`error` 是原因 |
| `disposed` | 停用 |

状态变化订阅的是 cordis 内置的 `internal/status` 事件，再以 `plugins/changed(id?)`（`@mode emit`，`id` 为空表示条目列表本身变了）转发出去，WebUI 的 SSE 只听后者。

几个 cordis 4.0.0-rc.11 的行为直接决定了实现（细节见 [cordis-upgrade-notes.md](cordis-upgrade-notes.md)）：

- `ctx.plugin()` 返回的是 `Object.create(fiber)` 包了一层 `then`，不是 fiber 本体；`internal/status` 传的是本体，所以要用 `.ctx.fiber` 取回来做映射
- `fiber.await()` 只等进行中的加载 / 卸载，对 PENDING 的 fiber 立刻返回；FAILED 时会把错误重新抛出 —— 这也是拿到失败原因的唯一公开途径
- `fiber.update(config)` 只在 fiber 已加载时同步校验配置，PENDING 时不校验。`updateConfig()` 因此先用 `resolveConfig()` 预校验一遍，失败直接抛 `ValidationError`，不动正在运行的实例、不写盘

## WebUI 管理面

**运行时路由表**：`WebuiServer.route(prefix, handler)` 让插件在 WebUI 下挂 HTTP 接口，返回的 disposer 挂在调用方的 `ctx.effect` 上，插件卸载时自动摘除。Hono 本身不能注销路由，所以 `initServer()` 在所有内置路由之后、静态文件之前挂了一个 `/api/*` 分发中间件，按前缀查一张可变的表 —— 内置路由先注册，永远优先命中；鉴权中间件在更前面，挂上来的路由自动受保护。`handler` 只要有 `fetch(request, env)`，收到的是完整 URL（Hono 子应用用 `basePath(prefix)` 或 `route(prefix, ...)`），请求体原样转发，multipart 也没问题。

**WebUI 的路由都按依赖挂载**：原来 `server.ts` 用 `lazyServiceContext` 代理绕过严格 inject，登录前就把所有路由挂上、调用时服务不在就报错或回 503。现在代理已删除：`WebuiServer` 自己只 inject 登录前就绪的 `qqProtocol` / `ntLoginApi` / `config`，也只带登录前要用的 config / auth-token / login / logs 路由；其余都是插件，`inject` 齐了才经路由表挂上 —— `DashboardRoutes`（`routes/dashboard.ts`，登录前就可用，`/dashboard/stats` 在 `app` 起来之前照旧回 503）、`EmailRoutes`（`routes/email.ts`，随邮件通知内置插件存在）、WebQQ（`builtin:webqq`）、`PluginRoutes`。没有路由命中的 `/api/*`（包括插件停用或还没起来）统一回 JSON 404 `{ success: false, message }`，前端能直接显示。

**`/api/plugins`**（`src/webui/BE/routes/plugins.ts`）本身就是经路由表挂上的插件 `PluginRoutes`（`inject: ['webuiServer', 'plugins']`）：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/` | 条目列表（过滤掉 `manifest.hidden`） |
| GET | `/stream` | SSE：`changed` 事件，`{ type: 'status', data }` 或 `{ type: 'list' }`（鉴权走 `?token=`） |
| POST | `/scan` | 重新扫描 |
| POST · DELETE | `/` · `/:id` | 新建实例（`{ name, config? }`）· 删除条目 |
| POST | `/:id/enable` · `/:id/disable` · `/:id/reload` | |
| GET | `/:id/schema` | `{ schema, defaults, config }`，会 import 尚未加载的模块 |
| GET | `/:id/dependencies` | 依赖报告，见下 |
| PUT | `/:id/config` | 400 时 `data.issues` 是 `[{ path, message }]` |

**依赖报告**（`PluginService.dependencies(id)`）：`PluginStatus.service` 是清单的 `llbot.service`（`normalizeService()` 补齐三个列表，格式不对的部分丢弃并打 warning）合并模块加载后的 `Inject.resolve(plugin.inject)` 和 `plugin.provide`；内置条目只用 `BuiltinPlugin.manifest.service`（它们的 inject 是一长串 Bot 内部服务，对插件页没意义），四个适配器 / 邮件通知声明了自己 `implements` 的服务名。报告按请求现算，因为"服务在不在"取决于整个 app：

- `available` 用 `reflect._getImpl` + `Service.check`（和 `missingDeps` 同一个判断，`ctx.get()` 不看 check，`account` 登录前会被误判为可用）
- `provider`：从提供该服务的 fiber 沿 `parent.fiber` 往上找，碰到某个条目挂载的 fiber 就是它；找不到说明是 Bot 自带
- `candidates`：其他条目里 `implements` 了这个服务的；`conflicts`：自己 `implements` 的服务还有哪些**启用中**的条目也 `implements`
- 冲突只提示不拦截：cordis 会让后起来的提供者失败（`service "xxx" has been registered at <...>`），先起来的不受影响。前端卡片上的冲突提示由 `findConflicts()` 用列表现算，不调接口

错误码：`PluginNotFoundError` → 404，`PluginForbiddenError` → 403（内置条目不支持的操作），`PluginConfigError` → 400（带 issues），其它 → 500。cordis 自己的 `ValidationError` 只拼一段文本、不保留 issues，所以 `updateConfig` 直接调 Standard Schema 的 `validate()` 自己抛 `PluginConfigError`。

**前端**在 `src/webui/FE/components/plugins/`，类型在 `types/plugins.ts`（手工和 `src/plugin/index.ts` 对齐 —— FE 的 tsconfig 没有 node 类型，不能直接 import 后端模块）。`utils/api.ts` 的 `apiFetch` 遇到非 2xx 抛 `ApiError`（带 `status` 和响应体里的 `data`），保存配置靠它拿到 issues。

**schemastery 渲染器**（`components/plugins/schema/`）：

- 线格式是 `toJSON()` 的引用表 `{ uid, refs: { [uid]: { type, meta, list: [uid], dict: { key: uid }, inner, sKey, value, bits } } }`，不是嵌套结构。`model.ts` 的 `hydrate()` 先登记节点再填子节点，`Schema.lazy()` 自引用产生的环能终止；`lazy` 节点透明化为它的 `inner`。`constructor` 这个键名会撞 `Object.prototype.constructor`，节点里不保留它
- `Schema.date()` / `regExp()` 是 `union(is(X), transform(string))`：`is` / `function` 成员没有 JSON 表示，丢掉后只剩字符串那一支
- union 分形态：全 const → 下拉（role `radio` 时单选）；`[const(false), X]` → 开关；`[X, const(null)]` → 直接编辑 X；各分支 object 共享一个 const 键 → tagged，顶部按钮切换分支；其余 → JSON 编辑框。`intersect` 只在成员都是 object 时平铺合并
- `role` 优先于 `type`：`secret` / `textarea` / `ms` / `slider`（`percent()` 显示为百分比）/ `table`（`array(object)` 渲染成 `table-fixed` 表格）/ `radio` / `checkbox`（const 数组的多选）。不认识的类型一律落到 JSON 编辑框，永不白屏；嵌套超过 6 层也用 JSON
- 弹窗打开时 `withDefaults(config, defaults)` 填出完整值；保存时 `stripDefaults` 剥掉等于默认值的字段（数组整体比较），`plugins.json` 只存用户改过的部分，插件升级改了默认值时用户自动跟上
- 卡片图标用一张固定的 lucide 图标表（`meta.ts`），没用 `lucide-react/dynamic` 的 `DynamicIcon`：它会给约 1600 个图标各生成一个 chunk

**端到端验证方法**（不登录 QQ）：后端 `tsx --tsconfig <repo>/tsconfig.json <repo>/src/main/main.ts -q 10001 --pmhq-port 1 --plugin-dir <repo>/examples/plugins`，cwd 放临时目录，预置 `data/webui_token.txt` 和 `data/config_10001.json`（`{ "webui": { "enable": true, "host": "127.0.0.1", "port": 3999 } }`：带 `-q` 时登录前就读这份配置，PMHQ 端口没人监听所以不会真登录）；前端 `BROWSER=none WEBUI_PORT=3999 npx vite --port 15199 --strictPort`；浏览器设好 `webui_token` cookie（密码的 sha256 hex），用 Playwright 只把 `/api/config` 响应里的 `selfInfo.online` 改成 true，就能进主界面操作真实的插件后端。

- **不要用默认的 3080 / 15173**：桌面浏览器里开着的 WebUI 页面会自动重连上临时实例，带着真实密码的 cookie（cookie 不分端口），校验失败，连续失败 4 次临时实例的 API 就锁一小时
- **不要用 `vite --open false`**：`false` 被当成路径，照样在桌面浏览器打开页面。用 `BROWSER=none`
- `playwright-cli fill <ref> -1` 会把 `-1` 当成命令行选项，填负数要用 `run-code`

## 插件前端（WebUI 扩展）

| 位置 | 作用 |
|---|---|
| `packages/plugin-sdk/src/webui.ts` | 前端约定，只有类型，即 `@luckylillia/plugin-sdk/webui` |
| `packages/plugin-sdk/src/server.ts` | `ctx.webuiServer` 的约定和 Context 增强；host 的 `WebuiServer` implements 它，自己不再声明 |
| `src/webui/FE/plugin-host/` | 宿主：插件列表 store、注册表、加载器、插件上下文、错误边界、视图组件 |
| FE `vite.config.ts` 的 `pluginSharedShims()` 和 `index.html` 的 import map | 共享依赖 |

- **共享 React**：插件模块里的 `import 'react'` 是裸说明符，浏览器按 `index.html` 里的 import map 解析到 `/plugin-shared/*.js`。这些 shim 由 `pluginSharedShims()` 生成（构建时 emit，dev 下走 middleware），内容是从 `globalThis.__LLBOT_WEBUI__.modules` 取 WebUI 自己那份模块再逐个命名导出；导出名在构建时用 `Object.keys(require('react'))` 读出，不手写。`main.tsx` 渲染前调 `installSharedModules()` 填这个全局。WebUI 自己的代码在构建时已经解析掉裸 import，不受 import map 影响。这和后端"进程里只能有一份 cordis"是同一个不变式
- **模块 URL**：`PluginStatus.webui` 是 `/plugin-webui/<key>/<version>/<入口文件名>`。key 是包名把 `/` 换成 `+`（npm 包名最多一个斜杠，且不允许 `+`）；version 在 `reloadPackage()` 和扫描到包变化时加一。ES 模块按 URL 缓存，URL 变了浏览器才会重新导入
- **加载**：`syncClients()` 随插件列表变化导入启用中插件的模块；版本变了先导入新的、成功后再撤掉旧的注册；包不在了就卸载。停用的插件只在打开配置弹窗时由 `ensureClient()` 按需导入（要拿它的配置编辑器）。导入失败记在 `useClientErrors` 里
- **可见性**：页面和插槽只显示"有条目处于 active"的插件的（`activeOwners()`）；配置编辑器和字段控件只要模块加载了就能用
- **WebQQ** 是 `plugin-host/builtins.tsx` 里随 WebUI 打包的内置客户端，同样用 `ctx.page()` 注册，侧边栏不再写死它，页面随 `builtin:webqq` 的状态出现和消失。`#webqq-fullscreen` 仍由 `App` 单独处理，前提是 webqq 页面可见
- **文件路由**：`PluginRoutes` 用 `webuiServer.route('/plugin-webui', ..., { public: true })` 挂在 `/api` 之外，因为 `import()` 发不了自定义请求头；但它会带同源 cookie，所以 `servePluginAsset()` 校验 `webui_token` cookie（存的就是密码哈希，和 `X-Webui-Token` 同值）。只允许 GET / HEAD，`webuiAsset()` 只放行入口所在目录及其子目录。dev 下 Vite 也代理了 `/plugin-webui`
- **路由表的 public 选项**：`route(prefix, handler, { public: true })` 存进另一张表，由一个注册在 `/api/*` 分发之后、静态文件之前的 `*` 中间件分发。public 路由不能在 `/api` 下，非 public 路由必须在 `/api` 下（以前挂到别处会静默不生效）
- **插件列表**是一个共享 store（`plugin-host/pluginList.ts`），只由 `usePluginHost()` 订阅一条 SSE；插件页、侧边栏、设置页提示都读它，不再各自拉取
- **字段控件**：`SchemaField` 先查 `useFieldRenderer(role)`；表单自己处理的 role（`BUILTIN_ROLES`）不让插件覆盖
- `PluginBoundary` 给插件组件提供 `usePluginContext()` 的上下文、套 Suspense，并兜住渲染错误；页面按 tab id 各自一个边界，一页出错不会带到同一插件的下一页

## 进程内只能有一份 cordis

外部插件 `import { Service } from 'cordis'` 如果拿到的是另一份 cordis，`Service.init` symbol、Context 原型链、事件总线全都对不上，而且不会有明确报错。三道防线：

1. **external**：`vite.config.ts` 的 `pluginShared` 把 `cordis` / `cosmokit` / `schemastery` / `@standard-schema/spec` / `@satorijs/element` / `@satorijs/protocol` 移出 bundle，和 `ws` 一样拷进 `dist/node_modules/`；SDK 的 `lib/` 也拷到 `dist/node_modules/@luckylillia/plugin-sdk/`。被打进 bundle 的 `@cordisjs/plugin-*` 里的 `import 'cordis'` 会解析到 external 那份
2. **resolve hook**：`DATA_DIR` 是相对 cwd 的，`data/plugins/xxx` 按目录向上解析未必走得到 `dist/node_modules/`。`resolve-hook.ts` 用 `module.registerHooks()`（Node ≥ 22.15，同步、同线程）把 `SHARED_SPECIFIERS` 不管从哪里 import 都短路到 host 用 `import.meta.resolve()` 算出的 URL
3. **加载后校验**：插件若是 `Service` 子类，沿构造器原型链找，碰到名叫 `Service` 却不是 host 那个类的，就判定插件把 cordis 打进了自己的产物（这种情况没有 import 语句，钩子拦不到），拒载

已实测：cwd 放在系统临时目录、插件周围没有任何 `node_modules` 时，从 `dist/llbot.js` 启动，插件拿到的 `Schema` 与 host 是同一个对象，`ctx instanceof Context` 成立。

## 热重载

Node ESM 没有公开的缓存失效 API（官方 `@cordisjs/plugin-hmr` 需要原生 addon `node-addon-require-builtin` 才能删 `loadCache`，我们不引）。做法是 query cache-busting：

- 每个包维护一个单调递增的 epoch，import 入口时带 `?v=<epoch>`。epoch 永不回退，否则重复的 `?v=` 会命中旧缓存
- 坑：query 只加在入口上，入口里 `import './util.js'` 解析出的子模块没有 query，仍是旧缓存。resolve hook 的第二个职责就是：父模块 URL 带 `v` 且在某个包根目录内、子模块也在同一个包内时，把同一个 `v` 抄过去。包根用 realpath（ESM 会解析符号链接，模块 URL 里是真实路径）
- 重载是"先验后拆"：新模块 import 成功才 dispose 旧 fiber 再挂新的；import 失败时旧实例继续跑，条目上挂 `error` 说明仍在跑旧版本
- 同一个包的所有启用条目一起换新代码
- 代价：每次重载泄漏一张旧模块图（ESM 缓存只增不减）。开发期无所谓，长期运行的实例频繁重载后应重启进程
- 没有 `registerHooks`（Node < 22.15）时 `reload()` 返回 `restart-required`，不做半吊子的重载

触发方式：WebUI 的重载按钮（`reload(id)`），或开启目录监听 —— `plugins.json` 里 `"hmr": true` 或启动参数 `--plugin-hmr`。监听用 `fs.watch(root, { recursive: true })` + 300ms 防抖，忽略 `node_modules` 和点开头的路径。**docker bind mount 下 inotify 经常收不到事件**（`ConfigService` 用 `fs.watchFile` 轮询也是这个原因），这时用 WebUI 按钮。

`--dev` 已被占用（连本地 manager + dev 版 sign-proxy），插件相关参数一律用 `--plugin-*`。

## dev 下

- `tsx watch` 的 loader hook 是进程级的，插件 `main` 可以直接指向 `.ts`；已实测 `registerHooks` 与 tsx 的钩子可以共存，TS 插件的子模块也能热重载
- **tsx watch 会监听所有经它加载的文件，动态 import 的插件也算**：不排除的话，改一行插件代码会让 tsx 重启整个 bot（重新登录），抢在热重载前面。所以 `yarn dev` 带了 `--exclude "./data/**" --exclude "./examples/**"`；用 `--plugin-dir` 指向别处时要自己再加一条 `--exclude`。注意 tsx watch 本来就忽略点开头的目录，在 `.tmp/` 里做这类实验会得到"不重启"的假结论
- 例子：`yarn dev --plugin-dir examples/plugins --plugin-hmr`
- `@luckylillia/plugin-sdk` 在 dev 下通过 workspace 链接解析到 `packages/plugin-sdk/lib/`，需要先构建过一次（`yarn install` 的 postinstall 会跑 `build:sdk`）。host 对 SDK 只有 `import type`，类型检查走 tsconfig `paths` 直连源码，不依赖构建

## SDK 版本

- host 启动时读自己能解析到的 `@luckylillia/plugin-sdk/package.json` 的版本，与插件的 peer 范围用 `compare-versions` 的 `satisfies()` 比对。没声明范围的插件视为不 import SDK，总是兼容
- SDK 只 re-export 第三方运行时值（`Context` / `Fiber` / `Inject` / `Service` / `Schema` / `h`）和纯类型。host 内部的能力（`SendElement` 等）一律通过 `ctx` 拿，不进 SDK，免得内部结构变成插件 ABI
- SDK 的 tsconfig 用 `moduleResolution: Bundler`：cordis rc.11 的 `.d.ts` 里相对 import 不带扩展名，`NodeNext` 跟不过去，会静默丢掉 `Service` / `Inject` 等导出
- 发布：tag `sdk-v<version>` 触发 `.github/workflows/publish-sdk.yml`（npm trusted publishing，`--provenance`）。首次发布前需要在 npm 上建 `luckylillia` org，并给这个包配置 trusted publisher

## 测试

- `test/unit/plugin/service.test.ts`：在 gitignore 的 `.tmp/` 下现场生成插件包，覆盖启停、配置校验、失败隔离、SDK 不兼容、缺依赖、自带 cordis、重载与重载失败、包被删除、多实例。放在仓库内是为了让夹具插件能向上解析到仓库的 `node_modules`
- `test/unit/bootstrap/builtins.test.ts`：用真实的内置插件表和 mock 的协议层 / 配置，验证登录前全部 pending、登录后拿到与改造前相同的配置、停用后端口真的释放、同端口再启用不 `EADDRINUSE`、core 条目停不掉
- vitest 自己接管了模块加载，`registerHooks` 对被它转换的模块不生效，所以子模块热重载和"仓库外的插件"只能在真 Node 下验证：`npx tsx test/manual/plugin-runtime.mts`（裸 `Context` + `TimerService` + `PluginService`，插件建在系统临时目录，JS / TS 各一个，改子模块后重载）
- 插件前端：`test/webui/plugins/registry.test.ts`（可见性、排序、取最新注册）、`test/webui/routes/pluginAssets.test.ts`（cookie 校验、Content-Type、越界 404）、`routeTable.test.ts`（public 路由）。端到端用示例插件 `webui-demo`（页面 / 插槽 / 字段控件）和 `custom-config`（自定义配置界面）按上面的不登录方法验证
- 生产 bundle 的冒烟：`node dist/llbot.js --pmhq-port 1` 不会登录（PMHQ 端口没人监听，协议层只会重连），插件运行时照常在登录前加载；cwd 放到 dist 之外的空目录，就能验证解析兜底
