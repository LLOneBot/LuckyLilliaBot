# 编写插件

LuckyLillia Bot 的插件就是一个 [cordis 4](https://github.com/cordiverse/cordis) 插件，和 Bot 自己的各个模块跑在同一个 `Context` 上。Bot 侧的加载机制见 [plugin-system.md](plugin-system.md)。

## 包结构

```
luckylillia-plugin-foo/
  package.json
  lib/index.js        构建产物（ESM）
  src/index.ts
```

```jsonc
{
  "name": "luckylillia-plugin-foo",     // 约定 luckylillia-plugin-* 或 @scope/luckylillia-plugin-*
  "version": "1.0.0",
  "type": "module",                     // 缺了它 .js 会按 CommonJS 加载
  "main": "lib/index.js",               // 也认 exports["."]
  "peerDependencies": {
    "@luckylillia/plugin-sdk": "^1.0.0" // Bot 用它判断兼容性，不满足就不加载
  },
  "llbot": {                            // 有这个字段才算插件
    "description": { "zh": "...", "en": "..." },
    "icon": "puzzle",                   // lucide 图标名（kebab-case）
    "hidden": false,                    // true：能加载，但不在 WebUI 列表里显示
    "preview": false,                   // true：WebUI 标记为开发中
    "service": {                        // 见下文"依赖与提供的服务"
      "required": ["bots"],
      "optional": ["puppeteer"],
      "implements": []
    },
    "webui": "webui/index.js",          // 可选，见下文"扩展 WebUI"
  }
}
```

装插件 = 把这个目录放进 Bot 的 `data/plugins/`（可以有一层 `@scope/`），然后在 WebUI 插件页里启用。新放进去的插件默认是停用状态。

## 模块形状

就是 cordis 原生的插件形状，没有额外约定：

```ts
import { Context, Schema } from '@luckylillia/plugin-sdk'

export const name = 'foo'
export const inject = ['timer']          // 依赖的服务，没就绪前插件不会运行

export interface Config {
  interval: number
}

export const Config: Schema<Config> = Schema.object({
  interval: Schema.natural().role('ms').default(60_000).description('间隔'),
})

export function apply(ctx: Context, config: Config) {
  ctx.interval(() => ctx.logger('foo').info('tick'), config.interval)
}
```

也可以 `export default` 一个函数、一个带 `apply` 的对象，或者一个 `Service` 子类。

## 配置

- `Config` 是 schemastery 的 schema 时，WebUI 会自动生成配置表单；用户保存时 Bot 先按 schema 校验，不通过就拒绝保存并把错误标到对应字段上，正在运行的实例不受影响
- 配置变化时 cordis 会重启插件（先撤销旧实例注册的一切，再用新配置调用 `apply`），不需要自己监听配置变化
- 保存时只记录用户改过的字段，等于默认值的不落盘 —— 插件新版本改了默认值，用户会自动用上。按 schema 比较：嵌套的 `object` 逐个字段记，`array` / `dict` / `union` 改了任何一处就整体记下（插件新版本改了它们的默认值，已经改过的用户不会被带走）
- 用别的 Standard Schema 实现（比如 zod）也能校验，但 WebUI 只能给一个 JSON 编辑框

**多个账号**：插件配置跟着实例走，一个实例里不管登录哪个号都是同一份配置。要让另一个号用不同的配置，就用 `--instance` 另起一个实例跑它。插件需要按号区分行为时（比如只在某个号的群里生效），在插件自己的配置里按 selfId 区分。

表单支持的写法（`description()` 会作为字段标题，键名作为小字显示）：

| 写法 | 表单控件 |
|---|---|
| `string()`；`.role('secret')` / `.role('textarea', { rows: [2, 4] })` / `.pattern(re)` | 输入框 / 密码框 / 多行 / 实时正则校验 |
| `number()` / `natural()`；`.min()` `.max()` `.step()` | 数字框 |
| `natural().role('ms')` | 数字 + 单位（毫秒 / 秒 / 分钟 / 小时 / 天），存毫秒 |
| `percent()` | 滑块，显示百分比 |
| `boolean()` | 开关 |
| `union([const('a').description('甲'), 'b'])` | 下拉；`.role('radio')` 为单选 |
| `union([const(false), object({...})])` | 开关，打开后展开对象 |
| 各分支都是带同一个 const 键的 object | 顶部切换按钮 + 选中分支的字段 |
| `array(X)`；`array(object({...})).role('table')`；`array(union([const...])).role('checkbox')` | 可增删排序的列表 / 表格 / 多选 |
| `dict(X)`、`dict(X, union([...]))` | 键值对列表（第二个参数限定可选的键） |
| `object()`（嵌套）、`intersect([object, object])`、`.collapse()` | 分组框，`collapse` 默认折叠 |
| `tuple()`、`bitset()` | 定长一行 / 多选 |
| `.role('xxx')`，且有插件用 `ctx.field('xxx', ...)` 注册了控件 | 那个控件（见"扩展 WebUI"；`ms` / `table` / `radio` / `checkbox` / `secret` / `slider` / `textarea` 不能被覆盖） |
| 其它（`any`、`is(...)`、无法判断的 union） | JSON 编辑框 |

`.hidden()` 的字段不显示；`.deprecated()` / `.experimental()` 会显示成小标签。

`llbot.icon` 目前支持：`bell` `book` `book-open` `bot` `brain` `calendar` `clock` `cloud` `code` `cpu` `database` `dice-5` `file-text` `gamepad-2` `gift` `globe` `hand` `heart` `image` `languages` `mail` `message-square` `milk` `music` `network` `puzzle` `radio` `repeat` `search` `send` `settings` `shield-ban` `smile` `sparkles` `star` `terminal` `timer` `trophy` `users` `wrench` `zap`，其它名字显示为拼图图标。

## 生命周期与清理

插件被停用、改配置、重载时，cordis 会撤销它注册过的所有东西 —— 前提是这些东西是通过 `ctx` 注册的：

```ts
ctx.on('some/event', handler)                      // 事件监听
ctx.interval(task, 1000)                           // 定时器（ctx.setInterval 已废弃）
ctx.effect(() => {                                 // 其它资源：返回清理函数
  const server = startSomething()
  return () => server.close()
})
```

**不要靠 `apply` 的返回值做清理。** cordis 只要看到函数有 `prototype` 就当构造函数用 `new` 调用，`export function apply() {}` 这种函数声明正好有 `prototype`，返回值会被丢掉。用 `ctx.effect()`。

直接调 `setInterval` / 开端口 / 起子进程而不经过 `ctx`，停用后就会泄漏。

## 数据目录

插件自己的文件（缓存、下载的资源、自带的 sqlite……）放在 `ctx.storage` 给的目录里，不要自己拼 `data/` 下的路径：

```ts
const dir = await ctx.storage.dir()             // data/instances/<实例>/plugin-data/<包名>/shared/，这个实例里所有账号共用
const mine = await ctx.storage.dir('account')   // data/instances/<实例>/plugin-data/<包名>/<QQ号>/，每个账号一份
```

- 第一次调用时创建；同一个包的多个实例共用一个目录（多个实例、甚至同一个数据目录下的多个 Bot 进程可能同时写，需要的话自己处理并发）；卸载插件不会删它
- 包名里的 `/` 换成 `+`：`@scope/foo` → `@scope+foo`
- **`dir('account')` 只能在登录后的代码里用**：插件的 `inject` 里有 `account`，或者在 `ctx.inject(['account'], ctx => { ... })` 里调用。其它地方调用一律 reject —— 哪怕此刻正好已经登录：否则插件在登录后才启用时一切正常，下次 Bot 重启、插件先于登录启动时却报错，这种问题很难查
- `ctx.baseUrl` 指向共用目录（带结尾斜杠的 `file:` URL）。用 `new URL(path, ctx.baseUrl)` 解析相对路径的生态插件会把文件放到这里，比如在插件里 `ctx.plugin(SQLiteDriver, { path: 'my.db' })`。在 `apply` 或构造函数里读它：服务的方法被别的插件调用时，`ctx.baseUrl` 读到的是调用方的（`ctx.storage` 没有这个问题，总是归定义代码的插件）
- 这个目录不在插件代码目录里，写文件不会触发热重载
- 按账号的结构化数据也可以用 `ctx.database`

## 依赖与提供的服务

两处声明，作用不同：

- **`inject`**（模块导出）决定能不能运行：列出的服务都就绪后插件才会运行。cordis 4 里 `inject` 列的都算必需
- **`llbot.service`**（`package.json`）给 WebUI 看，不加载代码就能读到：
  - `required`：必需的服务，和 `inject` 保持一致
  - `optional`：有就用、没有也能跑的服务。插件内部用 `ctx.inject(['puppeteer'], ctx => { ... })` 写这部分逻辑，服务出现时才执行、消失时自动撤销
  - `implements`：本插件提供的服务。写 `Service` 子类的插件一定要声明 —— 服务名在构造函数里，不运行代码就读不到

插件页的配置弹窗会列出每个依赖：已经就绪的显示由谁提供（某个插件，或 Bot 自带）；缺的会找出声明了 `implements` 这个服务的插件，未启用的可以一键启用。两个启用中的插件 `implements` 同一个服务时卡片上会提示冲突 —— cordis 只认先起来的那个，后一个会报 `service "xxx" has been registered` 失败。

要调用别的插件提供的服务时，类型从那个插件的包里拿（npm `peerDependencies` + `import type`），运行时只靠 `inject`，不要直接 import 它的代码。

`inject` 里列的服务都就绪后插件才会运行。等待中的插件在 WebUI 显示为"等待依赖"，并列出还缺哪些服务 —— 比如登录后才存在的服务，登录前就会一直等着，登录后自动启动。

只想"登录后再运行"的插件可以 inject `account`：它在第一次登录成功后才可用（`ctx.account.uin` / `uid` / `nick`），之后断线重连也不会撤销，插件不会被反复重启。`database` 也是登录后才有（数据库文件按账号区分）。

## 收发消息

插件只和**中立层**打交道：事件是 [Satori](https://satori.chat/zh-CN/protocol/events.html) 事件，消息内容是 `@satorijs/element` 的元素。同一份插件代码以后也能跑在别的平台（比如 QQ 官方机器人）上。`inject: ['bots']` 即可使用。

```ts
// 中间件：别人发来的每条消息按注册顺序经过各个插件，不调 next() 就到此为止，后面的插件收不到
ctx.on('bot/message', async (session, next) => {
  if (!session.content.startsWith('echo ')) return next()
  await session.reply(session.content.slice(5))
})

// 其它所有事件（成员进群、撤回、表情回应、好友申请……）以及 bot 自己发出的消息
ctx.on('bot/event', async (session) => {
  if (session.type === 'guild-member-added') await session.send([h('at', { id: session.userId }), ' 欢迎'])
})

// 发送前改写：原地改 content 再交给 next()，或者处理 next() 的结果；返回 [] 取消发送
ctx.on('bot/before-send', (bot, channelId, content, next) => {
  content.push(h.text(' [bot]'))
  return next()
})
```

| 事件 | 分发方式 | 说明 |
|---|---|---|
| `bot/session` | parallel | 所有事件的旁路，不受中间件影响，给需要看到全部事件的插件（记录、转发）用 |
| `bot/message` | waterfall | 别人发来的消息。`ctx.on(..., { prepend: true })` 可以排到最前面（比如黑名单） |
| `bot/event` | parallel | 除上面之外的所有事件，包括 bot 自己的消息 |
| `bot/before-send` | waterfall | 只拦截插件经 `bot.sendMessage` / `session.send` 发出的消息，OneBot / Milky / Satori 客户端发的不经过这里 |
| `bot/status` | parallel | bot 注册、上线、离线 |

`Session` 常用字段：`type`、`userId`、`channelId`、`guildId`（私聊为空）、`messageId`、`isDirect`、`content`（元素标记字符串）、`elements`（解析后的元素，取 @ 可以用 `h.select(session.elements, 'at')`）、`event`（原始 Satori 事件，snake_case），以及 `send()` / `reply()`（引用回复）。

`ctx.bots` 里是已登录的账号（`Bot`）。`sendMessage` 一定有，其它能力（`deleteMessage`、`getGuildMember`、`muteGuildMember`、`kickGuildMember`、`createReaction`……）按平台支持情况提供，用之前先判断 `if (bot.muteGuildMember)`。QQ 账号的 `platform` 是 `llonebot`，私聊的 channelId 形如 `private:<QQ号>`，群的 channelId 就是群号。

一条消息在某个中间件里抛错，会让这条消息的整条链中止（错误会记日志）。

## 扩展 WebUI

只要配置界面的插件什么都不用做：导出 schemastery 的 `Config` 就有自动表单。想往 WebUI 里加别的，有四种挂载点：

| 挂载点 | 注册 | 什么时候出现 |
|---|---|---|
| 侧边栏页面 | `ctx.page({ id, title, icon, component, order })` | 插件运行时 |
| 侧边栏设置页 | `ctx.page({ ..., settings: true })` | 插件启用时（运行出错也算）；停用后侧边栏不显示，但插件卡片的"配置"仍能打开，顶部提示设置暂不生效 |
| 具名插槽，目前只有 Dashboard 底部的 `dashboard` | `ctx.slot('dashboard', Component)` | 插件运行时 |
| 配置界面，替换自动表单 | `ctx.config(Editor)` | 一直可用，插件停用时也能配置 |
| 某个 role 的表单控件 | `ctx.field('color', Field)` | 所有插件的自动表单里 `.role('color')` 的字段 |

**入口**：`llbot.webui` 指向一个 ES 模块（相对包根目录），默认导出一个函数：

```js
import { createElement as h } from 'react'
import { usePluginContext } from '@luckylillia/plugin-sdk/webui'

function StatsPage() {
  const ctx = usePluginContext()
  // ctx.api('/api/my-plugin/stats').then(...)
}

export default function apply(ctx) {
  ctx.page({ id: 'stats', title: '统计', icon: 'trophy', component: StatsPage })
  ctx.slot('dashboard', StatsCard)
}
```

- 类型在 `@luckylillia/plugin-sdk/webui`：`WebUIContext`、`ConfigEditorProps`、`FieldProps` 等
- 组件里用 `usePluginContext()` 拿到同一个 ctx：`ctx.api(path, { method, body })` 带着 WebUI 登录调 Bot 的接口，返回 `{ success, data }` 里的 `data`；`ctx.events(path, { 事件名: data => {} })` 订阅 SSE；`ctx.toast()`
- 页面的 tab id 是 `<包名>:<id>`，地址栏 `#<包名>:<id>` 能直接打开
- `order` 和 WebUI 自己的入口一起排：Dashboard 0、日志 20、其他配置 30、插件 40、关于 1000，内置的 OneBot 11 / Satori / Milky / 邮件通知是 10 ~ 13、WebQQ 50；不填是 100
- 注册了设置页的插件，插件页卡片上的"配置"会跳到这个页面，而不是打开配置弹窗
- 代码拆分用 `React.lazy()`，WebUI 渲染插件组件时套了 Suspense
- 插件重载时 WebUI 撤掉旧模块注册的一切，再导入新模块，页面不用刷新；`apply` 返回的清理函数也会在这时调用

**页面的后端接口**：后端 `inject: ['webuiServer']`，用 `ctx.webuiServer.route('/api/my-plugin', handler)` 挂接口。handler 只要有 `fetch(request)`（Hono 应用可以，手写也行），收到的是完整 URL。挂在 `/api/` 下的接口自动受 WebUI 登录保护，插件停用时自动摘除。`{ public: true }` 挂在 `/api/` 之外、不需要登录，留给 webhook 这类场景，访问控制要自己做。

**共享依赖**：WebUI 用 import map 把 `react`、`react/jsx-runtime`、`react-dom`、`@luckylillia/plugin-sdk/webui` 交给插件模块，插件组件和 WebUI 用的是同一份 React —— 两份 React 混用，hooks 会直接报错。打包时这四个必须标 external，其它依赖可以打进去。用 Vite：

```ts
// 插件仓库里的 vite.config.ts
export default defineConfig({
  build: {
    outDir: 'webui',
    lib: { entry: 'client/index.tsx', formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: { external: ['react', 'react/jsx-runtime', 'react-dom', '@luckylillia/plugin-sdk/webui'] },
  },
})
```

不打包也行：`examples/plugins/webui-demo` 和 `custom-config` 的前端就是手写的 ES 模块，用 `createElement`，不用 JSX。

**样式**：WebUI 的 Tailwind 只生成它自己源码里用到的 class，插件里写的 Tailwind 工具类不一定存在。能放心用的是语义 class（`card`、`btn-primary`、`btn-glass`、`input-field`、`switch-toggle`、`text-theme` / `text-theme-secondary` / `text-theme-muted` / `text-theme-hint`）和 CSS 变量（如 `var(--accent)`，暗色主题下自动切换），其余用 `style` 或插件自带的 CSS。

**文件服务**：`llbot.webui` 所在的目录（含子目录）整个经 `/plugin-webui/...` 提供，需要 WebUI 登录。把前端产物放在单独的目录里，不要和后端代码放在同一层。

**出错**：每个插件组件外面都有错误边界，抛错只影响它自己那一块，可以点"重试"。模块导入失败时，配置弹窗会提示原因并退回自动表单。

**自定义配置界面**：`ctx.config(Editor)` 的组件收到 `{ value, onChange, schema, defaults, errors }`。`value` 是填好默认值的完整配置，改了就调 `onChange`。保存按钮、保存时按 schema 校验、只存改动过的字段，仍由 WebUI 和 Bot 负责；校验不过时，错误按路径（`a.b`，根是 `''`）放进 `errors` 传回来。所以自己画界面时也建议照样导出 `Config`。

## 构建

**把下面这些包标为 external，不要打进产物：**

```
@luckylillia/plugin-sdk  cordis  cosmokit  schemastery  @standard-schema/spec  @satorijs/element  @satorijs/protocol
```

Bot 在加载插件时会把这些 import 统一解析到它自己那一份。如果打进了产物，插件里的 `Service`、`Context` 和 Bot 的不是同一个类，服务注入和事件都会对不上；Bot 检测到这种情况会拒绝加载。其它第三方依赖可以打进产物，也可以随插件带一个 `node_modules/`。

用 tsc 构建时 `moduleResolution` 请用 `Bundler`：cordis 4.0.0-rc.11 的类型声明里相对 import 不带扩展名，`NodeNext` 解析不了，会悄悄丢掉一些导出。

## 开发

两个启动参数：

- `--plugin-dir <path>`：在 `data/plugins/` 之外再扫一个目录，可以写多次
- `--plugin-hmr`：监听插件目录，文件一改就重载（也可以在实例的 `plugins.json` 里写 `"hmr": true`）。不开的话用 WebUI 的重载按钮

**用 Bot 源码开发**（tsx 能直接跑 `.ts`，`main` 可以指向 `src/index.ts`）：

```sh
yarn dev --plugin-dir /path/to/plugins --plugin-hmr
```

tsx watch 会监听所有经它加载的文件，插件也算：插件目录在仓库外时，改插件代码会让 tsx 重启整个 Bot。`yarn dev` 只排除了 `data/` 和 `examples/`，别的目录要自己排除（tsx 的选项得写在入口文件之前，所以不能接在 `yarn dev` 后面）：

```sh
npx tsx watch --exclude "./data/**" --exclude "/path/to/plugins/**" src/main/main.ts --plugin-dir /path/to/plugins --plugin-hmr
```

**用发布版 Bot 开发**：先把插件构建成 JS（构建工具开 watch），再启动 Bot 时带上 `--plugin-dir` 和 `--plugin-hmr`。

重载会重新导入整个插件包（包括子模块），但旧模块不会从内存里释放；频繁重载很多次后建议重启 Bot。

## 多实例

同一个插件包可以在 WebUI 里添加多个实例，每个实例有自己的配置，互不影响。
