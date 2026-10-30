# 插件系统（host 侧）

Bot 进程本身就是一个 cordis 4 应用，插件运行时只是在根 `Context` 上多挂了一个服务：`PluginService`（`ctx.plugins`）。它负责扫描本地目录、读写插件条目与配置（当前实例的 `data/instances/<实例>/plugins.json`）、把每个启用的条目 `ctx.plugin()` 成一个 fiber，以及热重载。

作者视角的写法见 [plugin-authoring.md](plugin-authoring.md)。

## 代码位置

| 文件 | 作用 |
|---|---|
| `src/plugin/host/index.ts` | `PluginService`：条目状态机、enable / disable / updateConfig / reload / describe |
| `src/plugin/host/manifest.ts` | 扫描插件根目录、解析 `package.json` 的 `llbot` 字段、SDK 版本比对 |
| `src/plugin/host/store.ts` | 条目文件的读写（底层是 `src/common/jsonFile.ts`） |
| `src/common/schema/` | schemastery 线格式模型（`model.ts`）与按 schema 的差异 / 合并（`diff.ts`），前后端共用 |
| `src/plugin/host/resolve-hook.ts` | `module.registerHooks` 解析钩子 |
| `src/plugin/host/watcher.ts` | 目录监听（热重载） |
| `src/plugin/internal/index.ts` | 内置插件的列表，条目定义在各自目录的 `builtin.ts`（见下文"内置插件"） |
| `packages/plugin-sdk/` | `@luckylillia/plugin-sdk`，yarn workspace，单独发 npm |
| `examples/plugins/` | dogfood 插件（不进 dist） |

`PluginService` 在 `src/main/main.ts` 里紧跟 `ConfigService` 挂载。扫码协议本身也是它装载的内置条目 `builtin:nt-protocol`（见下文"内置插件"和 [core-pluginization.md](core-pluginization.md)），`main.ts` 只剩日志、配置、`bots` 和插件服务，WebUI 自己也是内置条目（`builtin:webui`）。插件需要登录后才有的服务就自己 `inject`，没就绪时 fiber 停在 PENDING，cordis 会在服务出现后自动拉起 —— 运行时不关心登录状态，也不关心扫码协议开没开。

**登录门闸 `account`**（`src/plugin/internal/protocol/nt-protocol/account.ts`，由 `builtin:nt-protocol` 挂载）：它用 cordis 的 `Service[Service.check]`：首次 `qq/online` 前 check 为 false，依赖方停在 PENDING；之后 `reflect.notify(['account'])` 让它们拉起，断线重连不撤销。扫码协议条目停用时它跟着消失，依赖方回到 PENDING。配置是实例的、启动时就定了，登录不切换配置（config-storage.md §7）：`main.ts` 启动时就首播一次 `llob/config-updated`（日志文件开关只从这个事件拿），`Core` 的 ffmpeg 路径在 `start()` 里直接读自己的配置。登录后才挂的数据库、`Core`、`Store` 在 `builtin:nt-protocol` 里的 `ctx.inject(['account', 'config'], ...)` 回调中。`ctx.get('account')` 不看 check，判断它是否可用要用 `reflect._getImpl` + `check`（`PluginService.missingDeps` 就是这么算的）。

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
- `src/plugin/internal/service/ntqq-universal/`：`NTQQUniversal` 插件（内置条目 `builtin:ntqq-universal`，`inject` 带 `account`：bot 就是登录的账号）和 `NTQQBot`。`NTQQBot.platform` 是 `llonebot` —— Satori 适配器的历史值，下游 Satori 客户端靠它识别，不能改

**NT → Satori 的转换在中立层里**（`src/plugin/internal/service/ntqq-universal/`），Satori 适配器的 HTTP API 反过来用它：

| 能力 | 位置 |
|---|---|
| NT 消息 → `h[]` / Satori 资源 | `utils.ts` 的 `decodeElement()` / `decodeMessage()` 等，消息 id 的编解码 |
| 12 种 `nt/*` → Satori 事件 | `event/*.ts` 的 `parseXxx(host, data)`，`host` 是 `src/universal/types.ts` 的结构性接口 `NormalizeHost`（只要 `ctx` 和 `event()`），现在只有 `NTQQBot` 调用 |
| `h[]` → NT 发送元素 → 发出 | `message.ts` 的 `MessageEncoder`（Satori 适配器的 `message.create` 也用它） |
| Bot 的可选能力 | `api.ts` 的 `getMessage` / `deleteMessage` / `getUser` / `getGuild` / `getGuildMember` / `muteGuildMember` / `kickGuildMember` / `createReaction`，Satori 适配器同名的 handler 只是转调它们（`test/unit/universal/ntqq.test.ts`） |

原来这些都在 Satori 适配器的目录里，core 的中立层反过来 import 一个能停用的适配器的代码；2026-10-30 搬进了中立层。`NTQQUniversal.inject` 必须覆盖转换器和 `MessageEncoder` 经 `ctx` 访问的全部服务（目前和 `SatoriAdapter.inject` 一致），否则 cordis 严格模式下会抛 `cannot get property without inject`。

第二个消息源 QQ 官方机器人就是这样接的（`src/plugin/internal/protocol/qq-official/`，见 [official-qq-bot.md](official-qq-bot.md)）：实现 `Bot`（`sendMessage` 必须，其它按平台能力挑），发送前调 `ctx.bots.beforeSend()`，收到的事件转成 Satori 事件后 `ctx.bots.dispatch()`，在 apply 里 `ctx.bots.register(bot)`。不需要碰任何 `nt/*`。

## 插件包与条目

**包**：插件根目录（默认 `data/plugins/`，外加任意个 `--plugin-dir <path>`）下的子目录，`package.json` 里有 `llbot` 字段才算。`@scope/` 目录会再往下找一层。入口按 `exports` → `main` → `index.js` 解析。同名包只认第一个，其余打 warn。

**条目**（当前实例的 `data/instances/<实例>/plugins.json`；旧位置由启动迁移搬过来，见 config-storage.md §9）：

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
- 单独成文件、每个实例一份（`data/instances/<实例>/`），见 [config-storage.md](config-storage.md)。读写都经 `JsonFile`：读用 JSON5（允许手写注释），写先写临时文件再 rename
- 解析失败时**文件原样留着**，以空条目 + 内置条目启动；启动时补内置条目的那次保存在读失败时跳过，所以坏文件不会被覆盖，用户改好后下次启动生效（原来是改名成 `.broken-<ts>`）
- 扫描到从没见过的包，会自动建一个 `disabled: true` 的条目，让它出现在 WebUI 里，但不会自动执行

### 配置的读写

每个实例只有这一份插件配置，没有按账号的覆盖层：要让另一个号用不同的插件配置，用另一个实例跑它（config-storage.md §4）。

- **落盘存差异，差异由服务端算**：`updateConfig` 收完整值（也兼容已剥默认值的差异），先补成生效值、校验生效值（单独校验差异会被 `required` 拒掉），再只存相对 schema 默认值的差异。差异规则见 `src/common/schema/diff.ts`：只有 object（和全是 object 的 intersect）逐 key 递归，dict / array / union / 标量整体替换
- 交给 cordis 的是存下来的差异，schema 默认值由 cordis 自己补
- **并发**：`describe` 返回 `rev`（存下来的配置的哈希），`PUT` 带回 `ifRev`，在条目锁内比对，不一致返回 409，前端提示后重新载入

### 插件数据目录（`ctx.storage` / `ctx.baseUrl`）

`src/plugin/host/storage.ts` 的 `PluginDataDirs`，根目录是 `PluginService.Config.dataDir`（`main.ts` 传当前实例的 `data/instances/<实例>/plugin-data`；不传就两样都不提供，单测默认如此）。

- **目录名**：`dataKey()` 把包名的 `/` 换 `+`、内置条目 `builtin:x` 换成 `_builtin+x`（冒号在 Windows 路径里非法），并拒绝任何不是单段合法路径的名字（`..`、多个斜杠、结尾 `.`、Windows 保留名）。`baseUrl()` 对这种名字返回 undefined，不让条目因此挂载失败
- **`ctx.storage` 是根上注册的 accessor**，不是条目 ctx 上的自有属性：服务的方法被别的条目调用时，cordis 给的 `this.ctx` 是"调用方 ctx + `symbols.shadow` 指向服务自己的 ctx"，自有属性会沿调用方那条原型链解析，拿到调用方的目录。accessor 里取 `this[symbols.shadow] ?? this` 作为定义处，再沿 `fiber.parent.fiber` 走到 `mount()` 时 `register()` 过的条目 fiber
- **`ctx.baseUrl` 只能是自有属性**：根 Context 自己就有 `baseUrl` 属性（值为 undefined），属性访问在走到 accessor 之前就命中了。所以 `mount()` 用 `this.home.extend({ baseUrl })` 当父 ctx，插件的 ctx 从它继承；`fiber.parent.fiber` 仍是 PluginService 的 fiber，`entryOfFiber()` 等不受影响。代价是服务方法被别人调用时读到的 `baseUrl` 是调用方的，作者文档写了"在 apply 里读"
- **`dir('account')` 绑定 `inject`，不挂起等待**：从调用处的 fiber 往上走到条目，路上有任何 fiber 的 `inject` 含 `account` 才放行，uin 直接读 `account` 服务；否则 reject，与当前是否已登录无关（保证行为确定，不随启动时机变化）。设计稿首选的是"登录前挂起等待"，没采用：挂起时 fiber 停在 LOADING，`start()` / `updateConfig()` 等在包锁里 `await fiber.await()` 会一直等到登录，整个包的 WebUI 操作都卡住；要绕开就得在六处调用点和"已挂起"赛跑、伪造 pending 状态，还要靠 dispose 时 `internal/plugin` 先于等 inertia 发出这个 cordis 内部时序来取消等待
- 插件数据在实例目录下、不在插件代码目录 `data/plugins/` 里，热重载 watcher 只看插件根目录，dev 下 `tsx watch --exclude "./data/**"` 也覆盖了它

## 内置插件

**目录**（owner 2026-10-29）：插件相关的都在 `src/plugin/` 下，分成平级的两块：`host/` 是插件系统本身（`PluginService`、清单、模块解析钩子、热重载、数据目录），`internal/` 是它装载的内置插件。两边不互相嵌套：内置插件依赖 `host/` 的类型，`host/` 从不 import 内置插件。每个内置插件一个目录 `src/plugin/internal/<分类>/<条目名去掉 builtin:>/`。分类就是插件页的分组，也就是 manifest 的 `category`：`protocol/`（nt-protocol、qq-official）、`adapter/`（onebot11、satori、milky）、`tool/`（webqq、email-notification、dashboard、logs）、`service/`（webui、ntqq-universal）；`builtinClients.test.ts` 检查目录的分类和 manifest 一致，改了分类就得挪目录。后端代码、`client/`（WebUI 部分）和它自己的路由放在插件目录里；`builtin.ts` 导出它的条目定义（标题、manifest、plugin、`config` 的 `BuiltinConfig`），像第三方包的 `package.json`；有设置的另有 `settings.ts`（原来集中在 `src/main/builtinConfig/`，三个适配器共用的 `fromTemplate` 在 `src/plugin/internal/adapter/settingsTemplate.ts`，`adapterEntry` 在 `src/plugin/internal/adapter/adapterEntry.ts`）。`src/plugin/internal/index.ts` 只是一张列表，`main.ts` 从这里拿 `builtinPlugins`。目录外剩下的是宿主：`main/`（入口、实例、配置服务、日志）、`plugin/`（插件系统）、`common/`、`universal/`（BotsService、Session、中立层的类型）。NTQQ 协议这一个条目带着它的全部实现：`nt-protocol/qqProtocol/`（原 `src/main/qqProtocol/`，纯协议和 PMHQ 协议层）、`nt-protocol/ntqqapi/`（原 `src/ntqqapi/`，NT 接口、Core 和类型，OneBot / Satori / Milky / WebQQ import 它就是在依赖这个插件）、`account.ts` / `store.ts` / `llbot-ipc.ts`、扫码登录路由（`loginRoutes.ts`、`authTokenRoutes.ts`）。WebUI 前端是 `src/plugin/internal/service/webui/FE`（独立的 npm 包，`npm --prefix src/plugin/internal/service/webui/FE ...`）。内置插件之间的 import 只有这几条：OneBot / Satori / Milky / WebQQ / 中立层用协议条目的 NT API 和类型（`nt-protocol/ntqqapi/`），Satori 适配器用中立层的转换和 OneBot 的 `OB11Response`（`/v1/internal/onebot11` 桥接）；没有插件 import WebUI 的后端，`client/` 之间也互不 import。协议条目的运行时状态只在它自己里面：账号经 `account` 服务读（`ctx.account.uin` 等），没有全局的 `selfInfo`（见 [core-pluginization.md](core-pluginization.md) §4）。新加的跨插件 import 先想想该不该是服务（`ctx.xxx`）

**挪目录时 import 以外要改的路径**（2026-10-30 拆 commit 时逐个踩到）：这些写错了不报错。前端 `plugin-host/builtins.tsx` 的 `import.meta.glob` 和 `index.css` 的 `@source`（匹配不到只是少了内置插件的页面和样式）；FE `tsconfig.json` / `vite.config.ts` 的别名、`outDir`、`fs.allow`，`BE/server.ts` 的 `feDistPath`；根 `package.json` 的 `--prefix`、CI、`docker/Dockerfile.local`、`.dockerignore`、`.vscode/launch.json`；`test/*-api-test/` 自己的 `@llbot/*` 别名（各自的 `tsconfig.json`，onebot11 还有 `jest.config.js` 的 `moduleNameMapper`，直接指 `src/*`，不走根 tsconfig）；注释里写的路径。根 `.gitignore` 的日志规则必须是 `/logs/`（只管根目录的 `nohup` 输出）：写成 `logs/` 会把 `tool/logs/` 下新建的文件一起忽略，`git add -A` 静默漏掉，提交出来的代码编译不过

`src/plugin/internal/index.ts` 把原来写死在 `main.ts` 里的几个模块登记成内置条目，交给 `PluginService`（`Config.builtins`）装载，在 WebUI 插件页和第三方插件同列、同一套开关：

| 条目 | 内容 | WebUI 页面（插件自己的 `client/`，见下文"内置插件的界面"） |
|---|---|---|
| `builtin:webui` | WebUI 本身，**core**：`WebuiServer`（HTTP 服务、登录校验、路由表）和 `PluginRoutes`（`/api/plugins`、`/plugin-webui`），`src/plugin/internal/service/webui/BE/index.ts` 的 `WebUI` | 核心页面 `#plugins`（插件页，含「界面」视图）、`#other`（其他配置）、`#about`，代码在外壳里（`src/plugin/internal/service/webui/FE/core/`），见下文"外壳和核心页面" |
| `builtin:dashboard` | `/api/dashboard/stats`（bot 进程和机器的资源，带版本号），`src/plugin/internal/tool/dashboard/` | 功能页 `#dashboard`：声明 `dashboard.header` / `dashboard.cards`，自己的三张卡（运行时间、LLBot 资源、系统资源）也是贡献（`src/plugin/internal/tool/dashboard/client/`） |
| `builtin:logs` | `/api/logs/stream`（日志的 SSE，每次连接先发整份缓存），`src/plugin/internal/tool/logs/` | 功能页 `#logs`（`src/plugin/internal/tool/logs/client/`）：每次 `connected` 后来的那批当作完整快照，暂停时重连就在继续时换掉；暂停不断开连接（原来暂停 / 继续、浏览器自己重连都会把缓存再追加一遍） |
| `builtin:onebot11` | OneBot 11 适配器 | 设置页 `#onebot`：自己画的连接卡片和编辑弹框、事件过滤器（`src/plugin/internal/adapter/onebot11/client/`） |
| `builtin:satori` / `builtin:milky` | 两个协议适配器 | 设置页 `#satori` / `#milky`：按 schema 渲染（`SchemaSettings`） |
| `builtin:email-notification` | 掉线邮件通知（`src/plugin/internal/tool/email-notification/`）；发测试邮件的 `/api/email/test` 是它的 standby 部分（`testRoutes.ts`） | 设置页 `#email`：按 schema 渲染，加一个发测试邮件的按钮 |
| `builtin:qq-official` | QQ 官方机器人（AppID 登录，不依赖扫码账号，默认关闭），见 [official-qq-bot.md](official-qq-bot.md) | 设置页 `#qqofficial`：按 schema 渲染，订阅事件是插件注册的字段控件 |
| `builtin:webqq` | WebQQ（`src/plugin/internal/tool/webqq/`：后端路由和 `client/`） | 功能页 `#webqq`（也能 `#webqq?fullscreen` 单独开），设置弹框里它的两项设置走 `settings.sections` 插槽；声明了 `webqq.chat.actions`（聊天窗口顶栏）、`webqq.message.element`（keyed，按元素类型）、`webqq.message.bubble`（chain，消息气泡） |
| `builtin:ntqq-universal` | 中立层，**core** | — |
| `builtin:nt-protocol` | 扫码协议：纯协议或官方 QQ 端桥接（PMHQ）协议层、8 个 NT API、`account`、登录后的数据库 / `Core` / `Store`、扫码 / 快速登录 / auth token 路由（`src/plugin/internal/protocol/nt-protocol/`），standby 部分是 `/api/login-info`（`loginInfoRoutes.ts`）。默认启用，可以在运行时停用 / 启用；登录方式是它的设置，见 [core-pluginization.md](core-pluginization.md) §6 | 设置页 `#ntqq`：登录方式、扫码 / 快速登录、Auth Token、账号状态和退出登录（`src/plugin/internal/protocol/nt-protocol/client/`） |

- 条目照样存在实例的 `plugins.json` 里（随机 id），只是 `name` 带 `builtin:` 前缀（npm 包名不能含冒号，不会撞）。启动时每个内置插件保证恰好一个条目：没有就按它的 `initial()` 建一个（没有 `initial` 的建成启用），手写出来的重复条目丢掉，core 条目上的 `disabled` 忽略
- 内置插件只有一个实例：它们提供具名服务（`onebot` / `satori` / ...），两个实例会抢同一个名字。`add` / `remove` 对内置条目、`disable` 对 core 条目都抛 `PluginForbiddenError`（HTTP 403）；`updateConfig` / `describe` 只对**没有设置**的内置条目（WebQQ、core）抛 403
- `reload` 对内置条目是重启（dispose + 重新挂载，没有模块可重新 import），会读到最新配置
- **standby 部分**（`BuiltinPlugin.standby`）：一个不随条目开关启停的小插件，`PluginService` 启动时挂在自己下面，跟插件服务同生共死。给设置页在条目停用时也要用的接口：邮件通知发测试邮件（`testRoutes.ts` 的 `EmailRoutes`）、NTQQ 协议的 `/api/login-info`（`loginInfoRoutes.ts` 的 `LoginInfoRoutes`）。它不是条目的一部分：没有状态、设置和数据目录，出错只有 cordis 打的日志。原来这两条一个由 `main.ts` 直接挂，一个是 WebUI 外壳的路由（外壳因此认得 NTQQ）。第三方插件没有这个口子：用户停用的插件一行代码都不该跑
- **停用要真能停下来**：改造前适配器从不在运行时卸载，OneBot / Satori / Milky 的 `[Service.init]` 都返回 `noop`，停用后端口不释放，再启用就 `EADDRINUSE`。现在它们返回关服务器的 disposer（cordis 卸载时会 await）。Satori 的 `/v1/internal/onebot11/:action` 原来缓存了一份按 OB11 实例构造的 action 表，OB11 重启后会指向已卸载的实例，改成每次从当前的 `ctx.get('onebot').actionMap` 取
- 前端：插件页（`components/plugins/PluginsPage.tsx`，排序、筛选、分页的逻辑在 `listing.ts`）按分类列：协议端 / 适配器 / 消息互动 / 工具 / 依赖组件 / 其他，来自 manifest 的 `category`（内置插件写在各自的 `builtin.ts`，第三方写在 `package.json` 的 `llbot.category`，扫描时 `normalizeCategory()` 丢掉不认识的值并警告）。同一分类里内置插件在前、按 bot 的顺序，其余按包名。顶部是搜索（标题、包名、说明）、状态筛选（已启用 / 未启用 / 需要处理：出错、文件缺失、版本不兼容、启用了但在等依赖或待配置）和带数量的分类标签；"全部"时按分类分组、带标题，每页 12 个，分到下一页的分类重复标题；筛选条件和页码存在 sessionStorage，从设置页回来还在。内置卡片有"内置 / 核心"徽章，core 的开关置灰。内置插件的界面和第三方插件走同一套 `ctx.page()`（见下文"内置插件的界面"）：适配器和邮件通知注册的是**设置页**（插件启用就在侧边栏，停用后从侧边栏消失，但卡片上的"前往设置"仍能打开），WebQQ 注册的是**功能页**（插件启用就在侧边栏，没运行时页面换成原因）。卡片上的"前往设置"跳到该插件注册的设置页，第三方插件也一样
- 内置设置页读写配置都用 SDK 的 `usePluginConfig()`（`SchemaSettings` 也是它）：经 `/api/plugins/:id/schema` 读、`PUT /:id/config` 带 `ifRev` 写，服务端按 schema 和内置规则校验；在别处（`set_config`、另一个标签页）改过之后再保存会 409 并重新载入，不会悄悄覆盖。邮件页登录前、通知关着时都能配，`/api/email` 只剩 `POST /test`。"其他配置"页仍走 `POST /api/config`，只提交它编辑的键（`otherSettings()`），`ConfigService.patch()` 深合并进去；保存 bot 设置不会重启适配器、不踢客户端。原来的 `BotConfigContext` 已删除
- **WebQQ 插件**（`builtin:webqq`）：路由、上传目录、`/api/webqq/events` 的 SSE 连接，以及往 SSE 推消息的 4 个 `nt/*` 监听（`events.ts`）都在插件里，`inject` 列出路由代码直接访问的全部服务，登录后才挂载。停用时主动 `abort()` 还开着的 SSE 连接，否则页面会一直挂在一条没人写的流上。整个插件在 `src/plugin/internal/tool/webqq/`（原来在 `src/webui/BE/routes/webqq/`），序列化函数在它自己的 `utils.ts`（原来借 WebUI 后端的）；页面要的账号是它自己的 `/api/webqq/self`（原来借 NTQQ 页的 `/api/login-info`）
- 插件只需要 `inject` 自己**直接**访问的服务：经 `ctx.xxx` 调到别的服务的方法时，cordis 按那个服务自己的 fiber 做严格检查（`createShadow` 的 `defSite` 是服务本身的 ctx），调用方 ctx 只决定方法里注册的副作用挂在谁身上。但像 `Core.sendMessage(ctx, ...)` 这种把 ctx 当参数传进去的，参数 ctx 访问的服务要算在调用方头上
- `pending` 的条目缺 `account` 时，前端只显示"等待 QQ 登录"：登录后才有的服务（`app` / `store` / `database` ...）都是它的结果，列出来没有意义

### 内置插件的设置（`BuiltinConfig`）

OneBot / Satori / Milky / 邮件通知 / QQ 官方机器人 / NTQQ 协议（登录方式）的设置和第三方插件一样存在实例 `plugins.json` 的条目里，经同一套 `describe` / `updateConfig` / rev / 409 读写，开关就是条目的开关（关掉就卸载，和普通插件一样）。schema 是插件自己的 `Config`（各插件目录的 `settings.ts`，如 `src/plugin/internal/adapter/onebot11/settings.ts` 的 `OB11Schema`，去掉了原来的 `enable` / `enabled`；默认值和 `defaultConfig.ts` 一致，单测锁住）。`BuiltinPlugin.config`（`BuiltinConfig`）只补 schema 表达不了的：

- `check(value, enabled)`：跨字段规则（"监听全部地址必须有 token"），`enabled` 是条目是否在跑或正被打开。保存时按当前开关校验；声明了 `checkOnEnable` 的（三个适配器）在卡片打开时也校验 —— token 规则是安全闸，关着时存下的不安全配置不能借开关绕过。邮件不声明：SMTP 没配好也能先打开（只是发不出去，测试邮件按钮会报错），通知开着时保存才要求 SMTP / 发件人 / 收件人齐全，关着可以存空配置（issue #690）。QQ 官方机器人也不声明：没填 AppID / AppSecret 也能先打开，设置页随之出现在侧边栏，填好保存即重启。`checkOnEnable` 只给安全闸用，别拿来挡"还没配完"：那样卡片开关一点就报错，用户还找不到先填的地方
- `notice(value)`：启用的条目按当前设置给卡片的一句话（`PluginStatus.notice`），用于"没配完也能启动、等着配"的插件：插件本身照常运行但什么都不做，卡片显示琥珀色的"待配置"和这句话，设置页顶部也提示。QQ 官方机器人用它说"还没有填写 AppID 和 AppSecret"，插件见没填就只记一行 info 返回。别让这种插件在启动时抛错（owner 2026-10-28：缺配置应该在保存时检测，不是一启动就报错）；真正只有运行时才知道的错（AppID / secret 不对）照旧让条目失败
- `normalize`：校验前清理，比如 Milky 去掉表单留下的空 webhook 行
- `secrets`：`describe` 把非空的 secret 换成 `SECRET_MASK`；写回时发来掩码或空串就保留原值，`PUT` 带 `clear: [路径]` 才清空，发来新值以新值为准（先点"清空"再输入新密码，存的是新密码）。只有邮件密码用到：适配器的 token 页面本来就显示，不打码，所以没有按 `role('secret')` 自动打码。rev 加了进程内随机盐，因为配置里可能有密码
- 保存默认会让条目整个重启（`fiber.update`）。不需要重启的改动由插件自己拦：NTQQ 协议用 `ctx.on('internal/update')` 只在换登录模式（或桥接换 PMHQ 地址）时放行，只改协议不会把已登录的账号踢下线
- `initial()`：条目第一次出现时的开关和配置。适配器取 `default_config.json` 的对应段（`enable` 变成开关），docker / nix 用 sed 改这个模板就是靠它生效；邮件默认关

适配器经 `adapterEntry()`（`src/plugin/internal/adapter/adapterEntry.ts`）包一层：`inject` 是 `account` + `config` + 适配器自己的依赖（条目在依赖齐之前显示 pending，而不是"外壳 active、里面 pending"），`Config` 是适配器的 schema，`apply` 把条目配置加上 `enable: true` 和它要读的 bot 设置（OneBot 的 `musicCardSignUrl` / `ffmpeg`，Satori 的 `ffmpeg`）交给适配器并 await，适配器启动失败就是条目的 `failed`。条目配置变了走 `fiber.update` 重启适配器；bot 设置变了，适配器只就地更新那几个调用时才读的字段，不断开客户端。`test/unit/bootstrap/builtins.test.ts` 逐字段比对拼出来的配置，并用真实端口验证启动、换端口、停用释放端口。

- **旧形状的兼容**（`src/main/config/legacyConfig.ts`）：OneBot `get_config` / `set_config` 和 `POST /api/config` 仍收发 `{ ...bot 设置, ob11, satori, milky }`。读时三段由条目拼回，`enable` 就是条目开关；写时三段交给插件服务（按 key 合并，`enable` 转成启用 / 停用，先停用再改），其余进 `settings.json`。`set_config` 按 owner 的决定不加 token 校验（`rules: false`，schema 照查），并且在回复发出之后才应用：改 ob11 段会重启承载这次请求的 OneBot 连接，等它会把回复卡在自己服务器的关闭上
- **启动时接管**：`liftBuiltinSettings()`（`src/main/config/migrate.ts`，在实例锁之后）把实例 `settings.json` 里还在的 `ob11` / `satori` / `milky` 段和实例下的 `email.json` 搬进条目（老格式的 ob11 先转换），没升级的桌面端或手改写进 `settings.json` 的段也就跟着接管了；`plugins.json` 读不出来时不搬，等修好

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
- `fiber.update(config)` 只在 fiber 已加载时同步校验配置，PENDING 时不校验。`updateConfig()` 因此先自己校验合并后的生效值，失败抛 `PluginConfigError`，不动正在运行的实例、不写盘

## WebUI 管理面

**运行时路由表**：`WebuiServer.route(prefix, handler)` 让插件在 WebUI 下挂 HTTP 接口，返回的 disposer 挂在调用方的 `ctx.effect` 上，插件卸载时自动摘除。Hono 本身不能注销路由，所以 `initServer()` 在所有内置路由之后、静态文件之前挂了一个 `/api/*` 分发中间件，按前缀查一张可变的表 —— 内置路由先注册，永远优先命中；鉴权中间件在更前面，挂上来的路由自动受保护。`handler` 只要有 `fetch(request, env)`，收到的是完整 URL（Hono 子应用用 `basePath(prefix)` 或 `route(prefix, ...)`），请求体原样转发，multipart 也没问题。

**WebUI 的路由都按依赖挂载**：原来 `server.ts` 用 `lazyServiceContext` 代理绕过严格 inject，登录前就把所有路由挂上、调用时服务不在就报错或回 503。现在代理已删除：`WebuiServer` 是不依赖任何协议的壳，由核心条目 `builtin:webui` 挂载（`main.ts` 不再直接装它），只 inject `config`（构造时自己读 `config.webui`），只带 config / `bots` 路由（日志流挪进了 `builtin:logs`，`login-info` 挪进了 NTQQ 协议条目的 standby 部分）。`builtin:webui` 不能停用，也不能"重启"：`reload()` 对 core 条目抛 `PluginForbiddenError`，因为重启它要关掉请求正走着的那个服务器，而 `server.close()` 又要等这个请求结束，两边互相等。`/api/config` 只有 bot 设置（不再带 `selfInfo` / `ntProtocol`：前端没有地方读外壳拿到的账号了）；`/api/login-info` 原来是唯一一条认得 NTQQ 的壳路由（NTQQ 页在协议停用时也要读登录方式的锁定 `pins`，它带 `ntProtocol` 说协议在不在），现在是协议条目的 standby 部分；`/api/bots`（`routes/bots.ts`）列出 `ctx.bots` 里每个账号的 sid、平台、在线状态，外壳每 5 秒问一次（`stores/botsStore.ts`），侧边栏、状态提示和插件的 `useBots()` 都读它；其余都是插件，`inject` 齐了才经路由表挂上 —— 扫码 / 快速登录 / 退出 / auth token 路由是 `builtin:nt-protocol` 里的 `NTLoginRoutes`（`src/plugin/internal/protocol/nt-protocol/loginRoutes.ts`），扫码协议停用时返 404；`builtin:dashboard` 的路由（`src/plugin/internal/tool/dashboard/routes.ts`，只 inject `webuiServer`：bot 进程和机器的资源；扫码账号的好友 / 群 / 收发数、QQ 进程资源和 QQ 版本号是 NTQQ 插件自己的 `/api/ntqq/stats`，`src/plugin/internal/protocol/nt-protocol/statsRoutes.ts`，原来的 `/api/device-info` 并进了它）、`EmailRoutes`（`src/plugin/internal/tool/email-notification/testRoutes.ts`，只有发测试邮件的 `/test`，只依赖 `webuiServer`，邮件通知条目的 standby 部分）、WebQQ（`builtin:webqq`）、`PluginRoutes`。没有路由命中的 `/api/*`（包括插件停用或还没起来）统一回 JSON 404 `{ success: false, message }`，前端能直接显示。

**`/api/plugins`**（`src/plugin/internal/service/webui/BE/routes/plugins.ts`）本身就是经路由表挂上的插件 `PluginRoutes`（`inject: ['webuiServer', 'plugins']`）：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/` | 条目列表（过滤掉 `manifest.hidden`） |
| GET | `/stream` | SSE：`changed` 事件，`{ type: 'status', data }`、`{ type: 'list' }` 或 `{ type: 'ui', data }`（用户偏好变了，见"插件前端"的用户偏好；鉴权走 `?token=`） |
| POST | `/scan` | 重新扫描 |
| GET · PATCH | `/ui` | 用户对插件界面的批准 / 隐藏 / 排序（`plugins.json` 的 `ui`）；PATCH 的 body 是增量，`approve` 了没安装或没有 WebUI 模块的包回 404 |
| POST · DELETE | `/` · `/:id` | 新建实例（`{ name, config? }`）· 删除条目 |
| POST | `/:id/enable` · `/:id/disable` · `/:id/reload` | |
| GET | `/:id/schema` | `{ schema, defaults, config, effective, rev }`（内置插件另有 `location` / `secrets`），会 import 尚未加载的模块。`config` 是存下来的差异，`effective` 是补齐默认值后插件实际用的值 |
| GET | `/:id/dependencies` | 依赖报告，见下 |
| PUT | `/:id/config` | body `{ config, ifRev?, clear? }`，`config` 是完整值。400 时 `data.issues` 是 `[{ path, message }]`；409 表示 `ifRev` 过期，`data.rev` 是当前值 |

**依赖报告**（`PluginService.dependencies(id)`）：`PluginStatus.service` 是清单的 `llbot.service`（`normalizeService()` 补齐三个列表，格式不对的部分丢弃并打 warning）合并模块加载后的 `Inject.resolve(plugin.inject)` 和 `plugin.provide`；内置条目只用 `BuiltinPlugin.manifest.service`（它们的 inject 是一长串 Bot 内部服务，对插件页没意义），四个适配器 / 邮件通知声明了自己 `implements` 的服务名。报告按请求现算，因为"服务在不在"取决于整个 app：

- `available` 用 `reflect._getImpl` + `Service.check`（和 `missingDeps` 同一个判断，`ctx.get()` 不看 check，`account` 登录前会被误判为可用）
- `provider`：从提供该服务的 fiber 沿 `parent.fiber` 往上找，碰到某个条目挂载的 fiber 就是它；找不到说明是 Bot 自带
- `candidates`：其他条目里 `implements` 了这个服务的；`conflicts`：自己 `implements` 的服务还有哪些**启用中**的条目也 `implements`
- 冲突只提示不拦截：cordis 会让后起来的提供者失败（`service "xxx" has been registered at <...>`），先起来的不受影响。前端卡片上的冲突提示由 `findConflicts()` 用列表现算，不调接口

错误码：`PluginNotFoundError` → 404，`PluginForbiddenError` → 403（内置条目不支持的操作），`PluginConfigError` → 400（带 issues），`PluginRevConflictError` → 409，其它 → 500。cordis 自己的 `ValidationError` 只拼一段文本、不保留 issues，所以 `updateConfig` 直接调 Standard Schema 的 `validate()` 自己抛 `PluginConfigError`。

**前端**在 `src/plugin/internal/service/webui/FE/components/plugins/`，类型在 `types/plugins.ts`（手工和 `src/plugin/host/index.ts` 对齐 —— FE 的 tsconfig 没有 node 类型，不能直接 import 后端模块）。`utils/api.ts` 的 `apiFetch` 遇到非 2xx 抛 `ApiError`（带 `status` 和响应体里的 `data`），保存配置靠它拿到 issues。

**登录的拒绝带标记**：鉴权（`BE/auth.ts` 的 `checkToken()`）拒绝时回 `X-Webui-Auth: unset | required | wrong | locked` 头，前端的 `authorizedFetch`（插件拿到的 `ctx.fetch` / `ctx.api` 也是它）只在带这个头的 401 / 403 上要密码；路由自己回的 401 / 403（`PluginForbiddenError`、插件自己的接口）原样交给调用方。原来任何 403 都会弹密码框，输对了接口照样 403，弹满 5 次报"认证失败"；任何 401 都会走"设置密码"。`checkToken()` 也是唯一的密码比对处：API 的请求头 / `?token=` 和 `/plugin-webui` 的 cookie 都经它计入失败次数和锁定（连续错 4 次锁 1 小时，不分 IP）

**schemastery 渲染器**（`components/plugins/schema/`）：

- 线格式是 `toJSON()` 的引用表 `{ uid, refs: { [uid]: { type, meta, list: [uid], dict: { key: uid }, inner, sKey, value, bits } } }`，不是嵌套结构。`model.ts` 的 `hydrate()` 先登记节点再填子节点，`Schema.lazy()` 自引用产生的环能终止；`lazy` 节点透明化为它的 `inner`。`constructor` 这个键名会撞 `Object.prototype.constructor`，节点里不保留它
- `Schema.date()` / `regExp()` 是 `union(is(X), transform(string))`：`is` / `function` 成员没有 JSON 表示，丢掉后只剩字符串那一支
- union 分形态：全 const → 下拉（role `radio` 时单选）；`[const(false), X]` → 开关；`[X, const(null)]` → 直接编辑 X；各分支 object 共享一个 const 键 → tagged，顶部按钮切换分支；其余 → JSON 编辑框。`intersect` 只在成员都是 object 时平铺合并
- `role` 优先于 `type`：`secret` / `textarea` / `ms` / `slider`（`percent()` 显示为百分比）/ `table`（`array(object)` 渲染成 `table-fixed` 表格）/ `radio` / `checkbox`（const 数组的多选）。不认识的类型一律落到 JSON 编辑框，永不白屏；嵌套超过 6 层也用 JSON
- 表单编辑的是完整值（服务端给的 `effective`）；保存时把完整值连同 `ifRev` 发回去，剥默认值由服务端做，`plugins.json` 只存用户改过的部分，插件升级改了默认值时用户自动跟上
- `model.ts` / `values.ts` 是对 `src/common/schema/` 的 re-export（经 `@shared` 别名：FE 的 vite 和 tsconfig、根 vitest 各配了一份），只有 `initialValue()` 这种纯表单逻辑留在前端
- 卡片图标用一张固定的 lucide 图标表（`meta.ts`），没用 `lucide-react/dynamic` 的 `DynamicIcon`：它会给约 1600 个图标各生成一个 chunk

**端到端验证方法**（不登录 QQ）：后端 `tsx --tsconfig <repo>/tsconfig.json <repo>/src/main/main.ts --pmhq-port 1 --plugin-dir <repo>/examples/plugins`，cwd 放临时目录，预置 `data/instances/default/webui_token.txt` 和 `data/instances/default/settings.json`（`{ "webui": { "enable": true, "host": "127.0.0.1", "port": 3999 } }`：配置是实例的，登录前就生效，PMHQ 端口没人监听所以不会真登录；预置旧的 `data/config_10001.json` / `data/webui_token.txt` 也行，没有 `data/instances/` 时启动迁移会把它们搬进去）；前端 `BROWSER=none WEBUI_PORT=3999 npx vite --port 15199 --strictPort`；`--pmhq-port` 会锁定 NTQQ 页的登录方式，要测登录方式的切换就不带它（纯协议没有 Auth Token 时也不会登录）；浏览器设好 `webui_token` cookie（密码的 sha256 hex），进主界面就能操作真实的插件后端（预置 `plugins.json` 把 `builtin:nt-protocol` 停用就是纯官方机器人进程的样子）。要看登录后才有的界面，用 Playwright 改响应：Dashboard 的 NTQQ 卡片读 `/api/ntqq/stats`（`online: true`，带 `qq` 时多一张"QQ 资源"卡）；WebQQ 要把 `GET /api/plugins` 里 `builtin:webqq` 的 `state` 改成 `active`、`missingDeps` 清空，再 mock `/api/webqq/self`（`online: true`）和 `/api/webqq/friends` / `groups` / `pins` / `messages`，点开好友就有聊天窗口（真实的 WebQQ 路由没挂，`/api/webqq/events`、`notifications` 的 404 不用管）。`page.goto()` 只改 hash 时不重新加载页面，挂好 mock 后要 `page.reload()`。想往注册表里直接塞贡献（测 single 插槽的替换、渲染出错）：在 `page.evaluate()` 里 `import()` App 正在用的那份 `plugin-host/registry.ts`，dev 下改过的模块 URL 带 `?t=`，从 `performance.getEntriesByType('resource')` 里找；不带 query 的那个 URL 是另一份模块、另一个 store，塞进去什么都不显示。第三方示例插件要先在插件页的"界面"里批准才会加载。

- **不要用默认的 3080 / 15173**：桌面浏览器里开着的 WebUI 页面会自动重连上临时实例，带着真实密码的 cookie（cookie 不分端口），校验失败，连续失败 4 次临时实例的 API 就锁一小时
- **不要用 `vite --open false`**：`false` 被当成路径，照样在桌面浏览器打开页面。用 `BROWSER=none`
- shell 里设了 `HTTP_PROXY` / `HTTPS_PROXY` 时，curl 探本机端口要加 `--noproxy '*'`：否则请求走代理，没在听的端口会拿到代理回的 502，看起来像"有服务"
- Windows 下用后台任务起的 `npx vite`，停掉 shell 之后 node 子进程还在占着端口：按端口找进程结束（PowerShell `Get-NetTCPConnection -LocalPort <port>` 取 `OwningProcess`）
- 验证 env 层：启动后端时带 `LLBOT_WEBUI_PORT=<port>`，实例的 `settings.json` 里写另一个端口。WebUI 会起在 env 的端口，`GET /api/config` 的 `envLocked` 列出它，"其他配置"页端口框只读
- `playwright-cli fill <ref> -1` 会把 `-1` 当成命令行选项，填负数要用 `run-code`
- `playwright-cli run-code` 每次调用的全局变量不共享：要在测试中途翻转一个 mock（比如让账号掉线再上线），在同一个脚本里注册 `page.route` 并改闭包变量

## 插件前端（WebUI 扩展）

| 位置 | 作用 |
|---|---|
| `packages/plugin-sdk/src/webui.ts` | 前端约定，只有类型，即 `@luckylillia/plugin-sdk/webui` |
| `packages/plugin-sdk/src/server.ts` | `ctx.webuiServer` 的约定和 Context 增强；host 的 `WebuiServer` implements 它，自己不再声明 |
| `src/plugin/internal/service/webui/FE/plugin-host/` | 宿主：插件列表 store、注册表、加载器、插件上下文、错误边界、视图组件 |
| FE `vite.config.ts` 的 `pluginSharedShims()` 和 `index.html` 的 import map | 共享依赖 |

- **共享 React**：插件模块里的 `import 'react'` 是裸说明符，浏览器按 `index.html` 里的 import map 解析到 `/plugin-shared/*.js`。这些 shim 由 `pluginSharedShims()` 生成（构建时 emit，dev 下走 middleware），内容是从 `globalThis.__LLBOT_WEBUI__.modules` 取 WebUI 自己那份模块再逐个命名导出；导出名在构建时用 `Object.keys(require('react'))` 读出，不手写。`main.tsx` 渲染前调 `installSharedModules()` 填这个全局。WebUI 自己的代码在构建时已经解析掉裸 import，不受 import map 影响。这和后端"进程里只能有一份 cordis"是同一个不变式
- **模块 URL**：`PluginStatus.webui` 是 `/plugin-webui/<key>/<version>/<入口文件名>`。key 是包名把 `/` 换成 `+`（npm 包名最多一个斜杠，且不允许 `+`）；version 在 `reloadPackage()` 和扫描到包变化时加一。ES 模块按 URL 缓存，URL 变了浏览器才会重新导入
- **加载**：`syncClients()` 随插件列表变化导入启用中、并且用户批准过的插件的模块（`clientAllowed()`：`PluginStatus.webuiApproved`）；版本变了先导入新的、成功后再撤掉旧的注册；包不在了或撤销了批准就卸载。停用的插件只在打开配置弹窗时由 `ensureClient()` 按需导入（要拿它的配置编辑器），没批准的不导入，弹窗里给"批准界面"。导入失败记在 `useClientErrors` 里。模块的 `apply()` 抛错时，它抛错前注册的页面、插槽贡献、声明全部撤掉（和后端插件 apply 失败一样全有或全无），错误同样记在那里；`ctx.events()` 打开、组件没关的流在模块卸载时一起关掉
- **可见性**：页面跟着插件启用（见下面的"页面"）；插槽贡献只显示"有条目处于 active"的插件的（`activeOwners()`），再去掉用户隐藏的：放在别人界面里的东西，插件没运行时不该占位置；配置编辑器和字段控件只要模块加载了就能用
- **约定的来历**：owner 2026-10-29 定的，参考 DeepSeek Harness 的插槽模型：插槽由那块界面的主人声明（点路径命名、`list` / `single` 两种基数）、外框归主人画、只有 `single` 插槽能顶替、插件只碰声明过的位置、用户能批准 / 隐藏 / 排序。对插件作者的说明在 [plugin-authoring.md](plugin-authoring.md)"插槽"
- **插槽**：注册表里的 `declaration` 条目。外壳的四个（`shell.notices`、`settings.sections`、`plugins.toolbar`、`plugins.card.actions`，都是 list）在 `registry.ts` 模块加载时就注册，owner 是 `builtin:webui`；插件的（Dashboard 的 `dashboard.header` / `dashboard.cards`、WebQQ 的三个）由 `ctx.declareSlot()` 注册，同名第二次声明抛错。贡献（`kind: 'slot'`）带 `id` / `label` / `order` / `priority`，其余字段放进 `options` 给外框用；`rejection()` 挡掉缺 id、缺组件和同一插件同一插槽里重复的 id，`ctx.slot()` 的旧签名（第二个参数是组件）直接抛错。`slotContents()` 决定显示什么：没人声明的插槽什么都不显示；list 按 `ui.order[key] ?? order` 排（同值按 owner、id）；single 按 `priority` 取第一个插件在运行、没被隐藏的，一个都没有时 `SlotOutlet` 渲染它的 children（壳自己的内容）。贡献的 key 是 `<owner>|<slot>|<id>`（`contributionKey()`），页面是 `<owner>|page|<tab>`（`pageContributionKey()`）
- **外框**：`SlotOutlet` 的 `wrap` 由插槽的主人画：Dashboard 卡片（`tool/dashboard/client/DashboardPage.tsx` 的 `SlotCard`，flex-wrap，`size` 对应 `basis-72 grow` / `basis-[37rem] grow-[2]` / `basis-full`：一行剩下的宽度按比例分给这一行的卡片，纯协议模式下 QQ 资源卡返回 null，NTQQ 账号卡就自己占满一行，用 grid 会在右边留一个空洞）、设置弹框的一节（标题是 `options.title`）；提示栏和 WebQQ 的按钮不包外框。外框是 `.slot-frame`、组件在 `.slot-body` 里，`index.css` 的 `.slot-frame:has(> .slot-body:empty) { display: none }` 让组件返回 null 时外框一起消失。这条规则必须在 `@layer utilities` 里：放在 components 层会输给 `.flex` 这类工具类，层的先后压过特异性
- **用户偏好**：实例 `plugins.json` 的 `ui: { approved, hidden, order }`（`store.ts` 的 `normalizeUi()` 丢掉格式不对的），`PluginService.uiPrefs()` / `updateUiPrefs(patch)`。patch 是增量的 `{ approve, revoke, hide, show, order }`（`order` 里的 null 删掉那个位置），几个标签页同时改不会互相覆盖。改完发 `plugins/ui` 事件，SSE 以 `{ type: 'ui', data }` 推给前端，存在 `pluginList.ts` 那个 store 的 `prefs` 里（第一次和插件列表一起拉，免得隐藏的东西闪一下）；批准变了再发一次 `plugins/changed`（刷新列表，`webuiApproved` 在状态里）。`approve` 只收已安装、带 WebUI 模块的包；`revoke` / `hide` 等不检查 key，插件卸掉后留下的旧 key 无害。批准是按包名的，不跟版本走：插件后端启用时就在跑，批准管的是用户想不想让它动 WebUI，不是沙箱
- **出错上报**：`PluginBoundary` 带 `failure: { key, where }` 时把渲染错误记进 `plugin-host/failures.ts`（按 key），点"重试"时清掉，插件模块重新运行（`run()`）时清掉它的全部；挂载成功不清，因为每条消息都渲染一次的插槽（chain 的环节）会让它一会儿报一会儿清。插件页"界面"的顶部、对应的行和插件卡片读它。插槽里的贡献用 `inline` 的错误样式（一行字加"重试"，不另套卡片），页面和配置编辑器用卡片
- **界面视图**：插件页顶部"插件列表 / 界面"切换，"界面"上的数字是待批准的包加上出错的数目。`components/plugins/WebuiExtensions.tsx` 画，数据在 `extensions.ts` 里整理：`slotGroups()` 给每个贡献算状态（显示中 / 已隐藏 / 插件没在运行 / 被覆盖），`moved()` 上移下移时把整个插槽重新编号成 0、10、20…，`orphans()` 是放进没人声明的插槽里的贡献，`webuiPackages()` 是带 WebUI 模块的包（每个包一行，待批准的在前）
- **内置插件的前端**见下一节。侧边栏一个写死的条目都没有，全是插件页面，按 `order` 排：Dashboard 0，NTQQ 协议 5，OneBot 11 / Satori / Milky / 邮件通知 / QQ 官方机器人 10 ~ 14，日志 20，其他配置 30，插件 40，WebQQ 50，第三方默认 100，关于 1000。任何插件页面都能 `#<tab>?fullscreen` 单独打开（`ctx.pageHref(id, { fullscreen: true })`）：`App` 只渲染这一页，没有侧边栏和标题，页面用 `usePageView().fullscreen` 知道自己是这样打开的
- **页面**（owner 2026-10-30）：插件启用了，它的页面就在侧边栏里，不管它在等依赖、出错还是正在启动；没运行的原因由页面自己说。`visiblePages()` 分两种用途：侧边栏（`'sidebar'`）列启用中插件的页面，插件列表还没加载时当作启用；能不能打开（`'open'`，`App` 渲染 tab 用）不看状态，停用的插件不占侧边栏，但卡片上的"前往设置"还能进去先配好再启用。`PluginPage` 按插件状态画：**设置页**（`page({ settings: true })`）照常渲染，上方一行提示（停用 / 出错 / 文件缺失、版本不兼容 / 在等别的插件）；**功能页**要插件在运行，没运行时整页换成原因卡片（`PluginNotRunning`），`PageOptions.header` 也不画。"在等别的插件"按 `meta.ts` 的 `waitingFor()` 说（顶部提示 `StatusNotices.tsx` 用的同一个）：缺的服务由哪个条目提供（manifest 的 `implements`），停用的排前面（"需要先启用「NTQQ 协议」"，按钮去插件页），否则用它给服务起的名字（"要等 NTQQ 账号登录后才会运行"，按钮去它的设置页）；只缺 bot 自己随后会起来的服务（登录后一两秒内的 `app`、`store` 等）时说不出提供者，设置页不提示，功能页显示"正在启动"和转圈，免得一闪而过。原来功能页要插件 active 才进侧边栏，WebQQ 在 NTQQ 没登录时整个入口都不见
- **文件路由**：`PluginRoutes` 用 `webuiServer.route('/plugin-webui', ..., { public: true })` 挂在 `/api` 之外，因为 `import()` 发不了自定义请求头；但它会带同源 cookie，所以 `servePluginAsset()` 校验 `webui_token` cookie（存的就是密码哈希，和 `X-Webui-Token` 同值），走 API 同一个 `checkToken()`：原来它自己比对，错了不计数、锁定期间照样放行，等于一个不限次数的猜密码入口。只允许 GET / HEAD，`webuiAsset()` 只放行入口所在目录及其子目录，包的界面没被批准时抛 `PluginForbiddenError`，回 403。dev 下 Vite 也代理了 `/plugin-webui`
- **路由表的 public 选项**：`route(prefix, handler, { public: true })` 存进另一张表，由一个注册在 `/api/*` 分发之后、静态文件之前的 `*` 中间件分发。public 路由不能在 `/api` 下，非 public 路由必须在 `/api` 下（以前挂到别处会静默不生效）
- **插件列表**是一个共享 store（`plugin-host/pluginList.ts`），只由 `usePluginHost()` 订阅一条 SSE；插件页、侧边栏、设置页提示都读它，不再各自拉取。SSE 断了浏览器会自己重连（bot 重启也是），但中间的变化不重放：`openPluginStream()` 在第二次及以后的 `connected` 上重新拉一遍列表和偏好。没有这一步时，bot 重启后插件在头一两秒里陆续起来，浏览器约 3 秒后才重连，页面一直停在旧状态
- **字段控件**：`SchemaField` 先查 `useFieldRenderer(role)`；表单自己处理的 role（`BUILTIN_ROLES`）不让插件覆盖。`role('host')` 是表单自带的监听地址选择（`HostSelector`：本机地址下拉或手填，docker 下固定监听全部），三个适配器的 host 字段都用它。secret 字段收到的是掩码时，聚焦会全选（输入即替换），旁边有「清空」：表单记下路径，保存时作为 `clear` 发出去，存的值才真的删掉（单发空串或掩码都是"保留"）。嵌套对象自己是带标题的框，外面不再多一行同样的标签
- **SDK 的运行时**是 `plugin-host/sdk.tsx`：`usePluginContext` / `usePluginStatus` / `usePluginConfig` / `SchemaForm` / `SchemaSettings` / `HostInput` / `usePlugins` / `useBots` / `usePageView` / `useSidebar` / `StatusNotice` / `Slot` / `useSlotMatches` / `Icon`（`Slot` 是 `views.tsx` 的 `SlotOutlet` 套一层，`wrap` 收到的贡献换成 `{ id, plugin, options }`）；`ctx.fetch` / `authUrl` / `pageHref` 在 `plugin-host/context.tsx`（`ctx.fetch` 就是外壳 `utils/api.ts` 的 `authorizedFetch`，`apiFetch` 也是在它上面加的 JSON 处理）。侧边栏收起状态和当前 tab 在 `stores/layoutStore.ts`，`App` 写、SDK 读。第三方模块经 import map 的 shim 拿到它（shim 的导出名列在 `plugin-host/sdkExports.ts`，`test/webui/plugins/sdk.test.ts` 核对它、`sdk.tsx` 和 SDK 里 `declare` 的值三者一致），内置插件的 `client/` 经 FE `vite.config.ts` 的 alias 直接拿到同一个模块
- `PluginBoundary` 给插件组件提供 `usePluginContext()` 的上下文（按贡献的 owner，所以别的插件声明的插槽里，贡献拿到的是它自己的 ctx）、套 Suspense，并兜住渲染错误；页面按 tab id 各自一个边界，一页出错不会带到同一插件的下一页

### 外壳和核心页面

owner 2026-10-29：WebUI 也是插件。外壳（`src/plugin/internal/service/webui/FE` 的 `App`、侧边栏、路由、注册表、登录弹框、主题、提示栏和设置弹框的框子）不是插件，也不可能是：加载插件的东西不能自己是插件。其余都按插件注册：

- **核心页面**：插件页、其他配置、关于属于 `builtin:webui`，代码在 `src/plugin/internal/service/webui/FE/core/`。它们要读注册表、批准状态、bot 设置这些外壳内部的东西，开放进公开 SDK 就等于谁都能做，所以不走 ctx，而是 `registerCorePages()`（`main.tsx` 在 `startBuiltinClients()` 之前调）直接写进注册表。插件页和其他配置带 `locked`：不看插件状态总在侧边栏里、用户也隐藏不了，管住插件、改回 WebUI 端口都靠它们；关于页能隐藏
- **管理面只开放追加**：插件页声明 `plugins.toolbar`（「重新扫描」旁边）和 `plugins.card.actions`（每张卡片自己的按钮前面，props 是这张卡的插件），都是 list；没有 single / keyed / chain 的插槽，批准、开关、「界面」视图不让任何插件换掉，否则一个插件就能把自己从列表里藏起来，或者替自己点批准
- **Dashboard 和日志是普通内置插件**：能停用。停用 Dashboard 后侧边栏第一个页面成了默认页
- **启动等插件列表**：`App` 在登录检查和第一次插件列表都回来之后才画主界面（之前是一个转圈）。侧边栏现在全是插件页面，先画再等列表的话条目会一个个冒出来、往下挤
- **默认页**：地址栏没有 tab 时，打开侧边栏排第一的页面（`activeTab` 未设置时取 `pluginPages[0]`），列表回来之前不写地址栏
- **页面标题区**：`App` 在每页上方留着桌面端的标题区（`mb-8 hidden md:block`），页面可以用 `PageOptions.header` 往里放东西（`PluginPageHeader`，它自己的错误边界）；Dashboard 的 `header` 就是 `dashboard.header` 插槽，默认内容是原来的「Dashboard / 欢迎使用 Lucky Lillia Bot」。这样所有页面的上方间距和以前一样

### keyed 和 chain 插槽

- **keyed**：贡献带 `match`（键），`Slot` 带 `match` 问要哪个键；`slotContents()` 在 `match` 相同、插件在运行、没被隐藏的里按 `priority` 取第一个，没有就画 `Slot` 的 children。`useSlotMatches(name)`（`slotMatches()`）给出当前有贡献的键，WebQQ 用它让"只含它自己不会画的元素"的消息也有气泡（`hasValidContent` 之外再看这个）
- **chain**：`SlotOutlet` 用 `reduceRight` 从里往外包，最里面是 children，每个环节拿到 `next`（后面画好的），排在前面的在最外层；用户的排序照样生效。环节的边界带 `passThrough={next}`：加载中和抛错后都直接显示 `next`，一个坏环节不会把整条消息弄没，错误照样上报
- **SDK 类型**：chain 插槽在 `SlotMap` 的 props 里写 `next`，`SlotProps` 把它 `Omit` 掉，声明方渲染 `Slot` 时不用传
- **WebQQ 的两个**：`webqq.message.element` 包在每个消息元素外（`MessageElementRenderer` 先问插槽，键是 `String(elementType)`，原来的画法改名 `BuiltinElement` 当 children）；`webqq.message.bubble` 包在每条消息的气泡外（`MessageBubble.tsx`）。插件拿到的消息是 `utils/slotMessage.ts` 转的 `WebQQMessage`（按消息对象缓存，memo 不失效），元素是 NT 的原样（`WebQQElement`）。`examples/plugins/webui-demo` 往前一个放了 markdown（14）的原文渲染，往后一个放了"折叠长消息"

### 内置插件的界面

owner 2026-10-28：插件的界面由插件自己维护，或者只给 schema、由 WebUI 渲染；WebUI 里不再写某个插件专用的页面。原来 OneBot / Satori / Milky / 邮件的设置页是插件化之前的 WebUI 页面，插件化时只是改成经 `ctx.page()` 注册，代码留在 `components/config/`、直接用 WebUI 内部的 hook 和组件，后来的 NTQQ、官方机器人页照着写了，现在都搬走了：

- **位置**：每个内置插件的界面在它代码旁边的 `client/`（`src/plugin/internal/adapter/onebot11/client/`、`src/plugin/internal/adapter/satori/client/`、`src/plugin/internal/adapter/milky/client/`、`src/plugin/internal/tool/email-notification/client/`、`src/plugin/internal/protocol/qq-official/client/`、`src/plugin/internal/protocol/nt-protocol/client/`、`src/plugin/internal/tool/webqq/client/`、`src/plugin/internal/tool/dashboard/client/`、`src/plugin/internal/tool/logs/client/`）。入口 `client/index.ts(x)` 跟第三方的 `llbot.webui` 模块一样默认导出 `apply(ctx)`，另外导出 `name`（它属于哪个内置条目）
- **只用公开的 SDK**：`client/` 里只能 import `@luckylillia/plugin-sdk/webui`、`react` / `react-dom`、`lucide-react`、自己的文件和后端的类型（`common/types`），不能碰 `src/plugin/internal/service/webui/` 下的任何东西。`test/unit/plugin-clients/builtinClients.test.ts` 检查这条，也检查目录名、`builtin.ts` 定义的条目名和 `client/` 导出的 `name` 三者对得上。SDK 不够用就给 SDK 加（`usePluginConfig`、`SchemaSettings` 等就是这么来的），第三方插件同样能用
- **怎么选**：配置就是普通表单的，只注册一个 `SchemaSettings` 设置页（Satori、Milky），要多点东西就往里塞：标题旁的链接、分组（`sections`）、表单下面的内容（邮件的测试按钮）、某个复杂字段用 `ctx.field()` 注册的控件（官方机器人的订阅事件，`role('qq-official-intents')`）。配置界面跟 schema 对不上的才自己画（OneBot 的连接卡片、NTQQ 的登录流程），数据照样走 `usePluginConfig()`
- **加载**：`plugin-host/builtins.tsx` 用 `import.meta.glob('src/plugin/internal/*/*/client/index.{ts,tsx}')` 找到它们，随 WebUI 一起打包，不经 `/plugin-webui` 下载：内置插件跟 WebUI 同一个发行包，不存在版本对不上，开发时也有 HMR。`main.tsx` 在首次渲染前调 `startBuiltinClients()` 注册，`App` 读地址栏的 tab 时这些页面已经在注册表里（`builtinPageKeys()`），原来写死的 `BUILTIN_PAGE_IDS` 删了。注册不调用 bot，所以登录前注册也没关系
- **构建要点**：`client/` 在 FE 包外面，FE `vite.config.ts` 用 `resolve.dedupe` 让它们用 FE 的 React（仓库根没有装 react），`server.fs.allow` 放开仓库根；FE `tsconfig.json` 的 `include` 加了 `../../../*/*/client/**/*`，`paths` 把 `react` / `lucide-react` / `zustand` / `@tanstack/react-virtual` 指到 FE 的 node_modules（`client/` 用到的第三方包装在 FE 的 `package.json` 里，`dedupe` 也要列上）；根 `vitest.config.ts` 同样把 `zustand` alias 到 FE 的 node_modules，测试才能 import WebQQ 的 store；根 `tsconfig.json` 排除 `src/**/client`（后端 tsc 没有 React 类型）；`index.css` 用 `@source '../../../*/*/client/**/*.{ts,tsx}'` 让 Tailwind 扫到这些文件。`@source` 写成目录 glob（`../../*/client`）不生效，要带文件扩展名，而且必须放在所有 `@import` 之后。后端不加载 `client/`，改它们只触发 Vite 的 HMR，不会让 `tsx watch` 重启 bot
- **WebQQ**（约 8000 行）按原来的相对目录搬进 `src/plugin/internal/tool/webqq/client/`（`components/WebQQ/`、`stores/`、`utils/`、`types/`），内部 import 不用改；原来伸向外壳的几处换成插件自己的：`client/context.ts`（`apply()` 时存下 ctx，给不在组件里的 API 函数和 store 用；`showToast`）、`components/common/`（自己的 `Portal`）、`utils/api.ts`（`apiFetch` 换成 `ctx.fetch()` 上的同样语义），带 token 的图片 / 音频 / 文件 / SSE 地址用 `ctx.authUrl()`。`WebQQEntry.tsx`（`React.lazy` 加载：WebQQ 约占 WebUI 包的三分之一，单独一个 chunk，第一次打开页面才下载。bot 更新后，开着的旧页面要的是旧构建的 chunk，已经没了，`React.lazy` 还会记住失败、"重试"没用：`main.tsx` 监听 `vite:preloadError` 刷新整页，一分钟最多一次，免得别的原因的失败死循环）先问自己的 `/api/webqq/self` 拿到账号，按账号恢复 store（原来是 `App` 做的），再按设置用 `useSidebar()` 收起侧边栏；全屏按钮 `window.open(ctx.pageHref('webqq', { fullscreen: true }))`，原来的 `#webqq-fullscreen` tab 和 `WebQQFullscreen` 删了。它的两项设置是浏览器本地的（`stores/settingsStore.ts`，localStorage 的键没变，原来的值还在），放进设置弹框的 `settings.sections` 插槽（标题由弹框画）。它还声明了 `webqq.chat.actions`：`ChatWindow.tsx` 顶栏右边渲染 SDK 的 `Slot`，props 是当前的 `chat`（`chatType` / `peerId` / `name`），`examples/plugins/webui-demo` 往里放了一个"复制号码"按钮
- **外壳不再认得哪个插件**：主界面的账号原来只在页面加载时取（`/api/config` 的 `selfInfo`），所以登录后要刷新整页；现在侧边栏按 `/api/bots` 显示在线的账号（第一个，还有别的标 `+N`），Dashboard 只剩运行时间、LLBot 和系统资源，NTQQ 账号的统计和 QQ 进程资源是 NTQQ 插件挂进 `dashboard.cards` 插槽的两张卡片（账号 `wide`、QQ 资源，共用 `client/stats.ts` 的一个轮询），WebQQ 自己拿账号，于是登录后不用刷新，原来的 `useQQAccount` / `useAccountReload` 删了，NTQQ 页登录成功只提示一句。关于页不再显示 QQ 版本号（在 NTQQ 卡片上）
- **顶部状态提示**（`components/layout/StatusNotices.tsx`）只按插件状态说通用的：在等别的插件提供的服务（按提供者分组，提供者停用时说"需要启用「X」"，否则用它在 manifest 里给服务起的名字，`llbot.service.labels`，比如 NTQQ 的 `account` 是"NTQQ 账号登录"，没起名就说"要等「X」就绪"）、`notice`（"QQ 官方机器人还没有填写 AppID 和 AppSecret"）、运行出错、没有启用任何协议端。只有插件自己知道的放进 `shell.notices` 插槽，用 SDK 的 `StatusNotice` 画一行（它在自己指向的页面上不显示）：NTQQ 插件说账号没登录或已离线（只在没有任何账号在线、也没有插件在等它时），官方机器人说正在连接或没连上开放平台。提示栏用 `empty:hidden`，`SlotOutlet` 不带 `wrap` 时不包外层元素，全都不说话时整栏消失。插件卡片的等待原因（`meta.ts` 的 `pendingReason()`）同样按提供者和标签说，原来写死的"等待 QQ 登录 / 需要先启用 NTQQ 协议"删了

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

- `test/unit/plugin/service.test.ts`：在 gitignore 的 `.tmp/` 下现场生成插件包，覆盖启停、配置校验、失败隔离、SDK 不兼容、缺依赖、自带 cordis、重载与重载失败、包被删除、多实例，以及内置条目（core 停不掉、standby 部分不随开关启停）。放在仓库内是为了让夹具插件能向上解析到仓库的 `node_modules`
- `test/unit/plugin/configWrite.test.ts`：只存差异、`describe` 的字段、rev / 409
- `test/unit/common/schemaDiff.test.ts`、`jsonFile.test.ts`：差异规则（含 dict 整体替换）与文件原语
- `test/unit/bootstrap/builtins.test.ts`：用真实的内置插件表和 mock 的协议层 / 配置（`builtin:nt-protocol` 在条目文件里停用，免得真协议去抢 `qqProtocol`），验证登录前全部 pending、登录后拿到与改造前相同的配置、停用后端口真的释放、同端口再启用不 `EADDRINUSE`、core 条目停不掉
- `test/unit/bootstrap/ntProtocol.test.ts`：`builtin:nt-protocol` 整体（协议层换成假的）：登录前后各有哪些服务、停用后全部消失且依赖方（含邮件通知）回到 PENDING、再启用再登录恢复；`test/unit/qqProtocol/protocolStop.test.ts`：直连 / PMHQ 协议停用时的清理，以及再启用复用同一个 `DirectProtocolClient`
- vitest 自己接管了模块加载，`registerHooks` 对被它转换的模块不生效，所以子模块热重载和"仓库外的插件"只能在真 Node 下验证：`npx tsx test/manual/plugin-runtime.mts`（裸 `Context` + `TimerService` + `PluginService`，插件建在系统临时目录，JS / TS 各一个，改子模块后重载）
- 插件前端：`test/webui/plugins/registry.test.ts`（可见性、排序、隐藏、single / keyed 取谁、chain 的顺序、核心页面不可隐藏、拒绝缺 id / 重复 id / 非字符串的 match / 重复声明、取最新注册）、`extensions.test.ts`（"界面"视图的状态、上下移、没人声明的、待批准的包）、`host.test.ts`（模块 apply 抛错时撤掉它注册过的）、`test/webui/routes/pluginAssets.test.ts`（cookie 校验、Content-Type、越界 404、没批准 403）、`plugins.test.ts`（`/ui`）、`routeTable.test.ts`（public 路由）；批准和偏好的持久化在 `test/unit/plugin/service.test.ts` 的 webui 部分和 `store.test.ts`。端到端用示例插件 `webui-demo`（页面 / Dashboard 卡片 / WebQQ 聊天按钮 / 字段控件）和 `custom-config`（自定义配置界面）按上面的不登录方法验证
- 生产 bundle 的冒烟：`node dist/llbot.js --pmhq-port 1` 不会登录（PMHQ 端口没人监听，协议层只会重连），插件运行时照常在登录前加载；cwd 放到 dist 之外的空目录，就能验证解析兜底
