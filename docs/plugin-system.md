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
| `packages/plugin-sdk/` | `@luckylillia/plugin-sdk`，yarn workspace，单独发 npm |
| `examples/plugins/` | dogfood 插件（不进 dist） |

`PluginService` 在 `src/main/main.ts` 里紧跟 `ConfigService` 挂载，早于协议层和登录。插件需要登录后才有的服务就自己 `inject`，没就绪时 fiber 停在 PENDING，cordis 会在服务出现后自动拉起 —— 运行时不关心登录状态。

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
- vitest 自己接管了模块加载，`registerHooks` 对被它转换的模块不生效，所以子模块热重载和"仓库外的插件"只能在真 Node 下验证：`npx tsx test/manual/plugin-runtime.mts`（裸 `Context` + `TimerService` + `PluginService`，插件建在系统临时目录，JS / TS 各一个，改子模块后重载）
- 生产 bundle 的冒烟：`node dist/llbot.js --pmhq-port 1` 不会登录（PMHQ 端口没人监听，协议层只会重连），插件运行时照常在登录前加载；cwd 放到 dist 之外的空目录，就能验证解析兜底
