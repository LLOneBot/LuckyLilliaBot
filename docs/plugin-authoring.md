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
    }
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
- 保存时只记录用户改过的字段，等于默认值的不落盘 —— 插件新版本改了默认值，用户会自动用上
- 用别的 Standard Schema 实现（比如 zod）也能校验，但 WebUI 只能给一个 JSON 编辑框

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
- `--plugin-hmr`：监听插件目录，文件一改就重载（也可以在 `data/plugins.json` 里写 `"hmr": true`）。不开的话用 WebUI 的重载按钮

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
