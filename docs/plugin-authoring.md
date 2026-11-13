# 插件开发指南

先做一个收到 `ping` 就回复 `pong` 的插件。下面给出全部文件，放进已有的 LuckyLillia Bot 即可使用。

## 最小可运行插件

在 Bot 的 `data/plugins/` 下创建 `ping` 目录，只放两个文件：

```text
data/plugins/ping/
  package.json
  index.js
```

**`package.json`**：声明插件包、入口和服务依赖。

```json
{
  "name": "luckylillia-plugin-ping",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "peerDependencies": { "@luckylillia/plugin-sdk": "^1.0.0" },
  "llbot": {
    "title": "Ping 示例",
    "service": { "required": ["bots"] }
  }
}
```

**`index.js`**：监听消息，匹配后回复。

```js
import { h } from '@luckylillia/plugin-sdk'

export const inject = ['bots']

/** @param {import('@luckylillia/plugin-sdk').Context} ctx */
export function apply(ctx) {
  ctx.on('bot/message', async (session, next) => {
    if (session.stripped.content !== 'ping') return next()
    await session.send(h.text('pong'))
  })
}
```

这个示例直接使用 JavaScript，无需编译。SDK 由宿主提供，插件目录无需执行 `npm install`。若使用源码运行 Bot，环境准备见[准备仓库与 SDK](#准备仓库与-sdk)。

1. 启动 Bot，在 WebUI「插件」的「本地安装」中，点击真实插件目录旁的「扫描」。
2. 找到「Ping 示例」，完成信任确认并启用。
3. 用另一个账号向已连接的 Bot 发送 `ping`，应收到 `pong`。官方机器人群聊中发送 `@机器人 ping`。

插件只处理匹配的消息，其余消息由 `next()` 交给后续插件。`session.stripped.content` 会去掉开头对机器人的 @，`session.send()` 使用收到消息的账号回复当前会话。

## 读懂这个示例

插件是一个带 `llbot` 清单的 npm 包，后端遵循 [cordis 4](https://github.com/cordiverse/cordis) 的插件约定。`package.json` 告诉宿主从哪里加载、依赖哪些服务；服务就绪后，宿主调用 `apply(ctx, config)`。

| 对象 | 从哪里取得 | 用来做什么 |
|---|---|---|
| `ctx` | 宿主传入 `apply()` | 注册事件、指令，访问 `ctx.bots`、`ctx.http` 等服务 |
| `session` | 消息或事件监听器的回调参数 | 读取本次事件、回复当前会话、等待用户回答 |
| `bot` | 消息中用 `session.bot`；后台用 `ctx.bots.get(sid)` | 代表一个具体的机器人账号，执行发送、查询和群管理 |

`bot/message` 是传给 `ctx.on()` 的事件名。同一宿主可以有多个账号，发送和管理操作需要由某个具体的 `bot` 执行；`session.send()` 已经带上本次事件的账号和会话信息。

实际的 `bot`、`session` 对象由宿主和协议端创建，无需导入。SDK 导出的 `Bot`、`Session` 是 TypeScript 类型，需要显式标注时使用 `import type { Bot, Session } from '@luckylillia/plugin-sdk'`。

### 接下来读什么

| 你要完成的事 | 阅读位置 |
|---|---|
| 建立带类型、构建和测试的项目 | [开发流程](#开发流程) |
| 理解入口、依赖和资源清理 | [插件基础](#插件基础) |
| 接收消息、处理指令和管理账号 | [消息与指令](#消息与指令)、[管理操作与平台接口](#管理操作与平台接口) |
| 保存配置、文件或数据表，调用外部 API | [配置与数据](#配置与数据)、[HTTP 与代理](#http-与代理) |
| 兼容不同平台，调用其他插件的服务 | [跨平台写法](#跨平台写法)、[依赖与提供的服务](#依赖与提供的服务) |
| 提供页面、配置界面或 Dashboard 卡片 | [扩展 WebUI](#扩展-webui) |
| 调试、测试和发布插件 | [开发与测试](#开发与测试)、[打包与发布](#打包与发布)、[排错](#排错) |

## 插件能做什么

以下是宿主和内置插件提供的常用能力；后端功能所需的服务要在 [inject 和清单](#声明服务依赖)中声明。

| 能力 | 调用入口 | 所需服务 |
|---|---|---|
| 接收消息和其它事件 | `ctx.on('bot/message', ...)`，其它事件见[事件入口](#事件入口) | `bots` |
| 回复、主动发送、等待用户回答 | `session.send()` / `session.reply()`、`bot.sendMessage()`、`session.prompt()` | `bots` |
| 发送前处理、扩展元素降级 | `ctx.on('bot/before-send', ...)`、`ctx.on('bot/fallback', ...)` | `bots` |
| 指令、参数、权限、冷却、平台菜单 | `ctx.command()` | `commands` |
| 群管理和平台接口 | `bot.kickGuildMember?.(...)` 等可选方法、`internalOf(bot, ...)` | `bots` |
| 配置表单和校验 | 模块导出的 `Config` | 无 |
| 文件与数据表 | `ctx.storage`、`ctx.model`、`ctx.database` | 文件无需服务；数据表需要 `database` |
| HTTP 和文件下载 | `ctx.http` | `http` |
| 定时、延时、防抖、节流 | `ctx.interval()`、`ctx.timeout()`、`ctx.debounce()`、`ctx.throttle()` | `timer` |
| 提供共享能力 | `Service` 子类 | 按服务需求 |
| 页面、配置编辑器和插槽 | `@luckylillia/plugin-sdk/webui` | 浏览器模块 |
| `HTTP API`、`webhook` | `ctx.webuiServer.route()` | `webuiServer` |
| 日志 | `ctx.logger('插件名')` | 无 |

插件运行在 Bot 的 Node.js 进程中，没有沙箱。首次启用第三方插件需要用户信任；其 WebUI 模块随插件启用自动加载。配置、生效范围、消息顺序、插件多实例和热重载由宿主管理。

跨平台接口不保证每个平台拥有相同能力。扩展元素有默认降级，但管理方法、事件订阅、媒体格式和主动消息额度仍由平台决定。插件市场不执行依赖的安装脚本，发布前需要验证安装产物可以直接运行。

## 开发流程

需要持续开发时，使用带 TypeScript、构建和测试的脚手架。下面按仓库内开发的流程另建 `my-plugin` 项目；[仓库外开发](#在仓库外开发)是另一种可选方式。验证新项目之前，先停用开头的「Ping 示例」，避免两个插件同时处理 `ping`。

### 准备仓库与 SDK

`@luckylillia/plugin-sdk` 已发布到 npm，可以在[独立目录中开发](#在仓库外开发)。下面介绍使用 Bot 源码联调的方式：需要 Node.js 22.15 或以上，以及安装好的仓库依赖。仓库使用 Yarn 4 和 `node_modules`；新检出的仓库可先执行：

```sh
# Bot 仓库根目录；需要本机已安装 Corepack
corepack yarn install
npm run build:sdk
```

`build:sdk` 生成 SDK 类型、运行时入口和测试工具。修改 SDK 源码后也要重新运行。本文中的 `npm run`、`npm test` 仅执行脚本，不重新安装依赖。

### 创建插件

```sh
# Bot 仓库根目录
node packages/plugin-sdk/bin/luckylillia-plugin.mjs create data/plugins/my-plugin
cd data/plugins/my-plugin
npm test
npm run build
```

默认包名为 `luckylillia-plugin-my-plugin`。脚手架支持 `--name`、`--description`、`--author`，未指定作者时使用 Git 的 user.name。

在已安装根依赖的 Bot 仓库内，模板可以直接向上使用仓库的 `node_modules`，无需重复执行 `npm install`。在独立目录中开发时，按脚手架提示安装依赖即可。

`data/plugins/` 是默认扫描目录，Bot 的开发监视器也已排除它，修改插件不会因此重启整个 Bot。`data/` 不进入仓库 Git；插件需要独立版本管理时可作为自己的项目管理。

| 生成文件 | 作用 |
|---|---|
| `package.json` | npm 元数据、SDK 版本、插件清单、脚本 |
| `src/index.ts` | 配置、指令和消息中间件 |
| `test/index.test.ts` | 不登录 QQ 的逻辑和降级测试 |
| `tsconfig.json` | 把源码编译到 lib |
| `vitest.config.ts` | 仅查找本插件 test/**/*.test.ts，不继承父项目测试配置 |
| `.gitignore` | 忽略依赖和产物 |

### 带配置和指令的示例

接下来给插件增加可配置的问候语和 `hello` 指令。以下内容完整替换生成项目的 `src/index.ts`；保留模板的 `package.json`，它已声明 `bots` 和 `commands` 服务。

```ts
import { Context, h, Schema } from '@luckylillia/plugin-sdk'

export const name = 'my-plugin'
export const inject = ['bots', 'commands']

export interface Config {
  greeting: string
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('你好').description('问候语'),
})

export function apply(ctx: Context, config: Config) {
  ctx.command('hello [name:text]', '向指定的人打招呼')
    .action(({ session }, name?: string) => {
      const target = name || session.event.user?.name || session.userId || '朋友'
      return h.text(config.greeting + '，' + target + '！')
    })

  ctx.on('bot/message', async (session, next) => {
    if (session.stripped.content !== 'ping') return next()
    await session.send(h('markdown', {}, '**pong**'))
  })
}
```

`/hello 小明` 默认也可以不写斜杠，前缀在「指令」设置页统一配置。ping 使用 `stripped.content` 匹配，因此能处理开头带对机器人的 @ 的消息。

### 测试和构建

将[完整测试文件](#完整测试文件)保存为 `test/index.test.ts`，然后在插件目录运行：

```sh
npm test
npm run build
```

测试会验证指令、消息匹配和元素降级，无需登录 QQ；构建完成后，再放到 Bot 中验证真实收发。

### 在 Bot 中验证

```sh
# 终端一：插件目录，持续编译
npm run dev
```

```sh
# 终端二：Bot 仓库根目录
npm run dev -- --plugin-hmr
```

在 WebUI「插件」的「本地安装」中，点击真实插件目录旁的「扫描」，然后在「已安装」中启用新插件并完成信任确认。卡片齿轮可编辑配置、设置生效范围。用已连接的 Bot 发消息验证，错误查看插件卡片和日志页。前端模块随插件启用自动加载，详见[界面加载](#界面加载)。

## 插件基础

先了解插件如何挂载、何时获得服务，以及停用时怎样释放资源。

### 后端入口

后端支持 cordis 原生插件形状：命名导出的 `apply`、默认导出函数、带 `apply` 的对象，或 Service 子类。通常采用[TypeScript 示例](#带配置和指令的示例)的命名导出：

| 导出 | 用途 |
|---|---|
| `name` | cordis 插件名称；WebUI 展示名由清单控制 |
| `inject` | 插件启动时必须就绪的服务 |
| `Config` | 运行时配置 schema |
| `apply(ctx, config)` | 挂载逻辑，config 已补默认值并校验 |

Context 连接服务、事件和生命周期。通过自己的 `ctx` 注册监听器、命令、子插件和资源，宿主卸载插件时会一并撤销。模块顶层应以定义为主，避免 import 时建立连接或启动长期任务。

`ctx.plugin(plugin, config)` 挂载受当前插件生命周期管理的子插件。使用其它独立插件的能力时，通过服务注入和类型导入，不直接 import 其入口代码。

### 声明服务依赖

例如要访问 `ctx.bots` 和 `ctx.http`，在后端入口声明：

```ts
export const inject = ['bots', 'http']
```

在 `package.json` 的 `llbot.service` 中填写相同的必需服务：

```json
{
  "llbot": {
    "service": {
      "required": ["bots", "http"],
      "optional": ["greetings"],
      "implements": []
    }
  }
}
```

`inject` 决定运行时等待哪些服务；清单 required/optional/implements 让 WebUI 不执行代码也能说明服务依赖、找到提供者并提示冲突。required 与顶层 `inject` 保持一致，但清单不代替实际注入。插件包已安装、版本匹配不代表服务已就绪；仍需等待提供者启用并完成初始化。

可选逻辑放在局部 `ctx.inject(['服务名'], callback)`：服务出现时挂载这部分，消失时清理。不要将可选服务列入顶层 `inject`，只有可选功能需要的插件也不要列入必需的 `llbot.dependencies`。使用其他插件服务时，从其包导入类型并声明 peer dependency，必需的插件另列入 `llbot.dependencies`；运行时通过 `ctx` 访问，不直接 import 其插件入口。

### 生命周期与清理

`inject` 中的服务全部就绪后执行 `apply`。服务消失会卸载依赖方，恢复后重新挂载。平台临时离线表现为 `bot.status` 变化，通用插件不需要因此重启。

通过 `ctx` 注册的事件、命令、定时器和子插件会自动清理。其它资源使用 `ctx.effect`：

```ts
import { watch } from 'node:fs'
import type { Context } from '@luckylillia/plugin-sdk'

export function watchFile(ctx: Context, filename: string) {
  ctx.effect(() => {
    const watcher = watch(filename, () => ctx.logger('my-plugin').info('文件已变化'))
    return () => watcher.close()
  })
}
```

`ctx.interval(task, delay)`、`ctx.timeout(task, delay)`、throttle 和 debounce 由 timer 提供，也随调用方清理。全局定时器、子进程、端口和 WebSocket 必须登记 disposer。异步请求要处理异常，需要取消时用 AbortController 并在卸载时 abort。

**后端不要依赖 `apply` 的返回值清理。** cordis 对可构造函数采用构造调用，函数声明形式的 `apply` 返回值不是可靠的 disposer。普通插件使用 `ctx.effect`；Service 子类可在 `[Service.init]` 返回清理函数。浏览器端 WebUIPlugin 有独立约定，可以返回 cleanup。

停用、改配置、重载均可重复发生。不要把某次挂载的 Context、Bot、连接保存到无法清理的模块级单例中；持久数据放存储或数据库。

## 消息与指令

本节先说明账号和事件对象，再介绍消息监听、回复和指令。平台能力差异见[跨平台写法](#跨平台写法)。

### 账号与会话

先从事件取得 `session.bot`，或通过 `ctx.bots.get(sid)` 选择明确的账号。`sid` 由平台名和机器人 ID 组成，例如 `qq:100001`。

#### Bot 身份

Bot 表示一个平台上的一个机器人身份，`ctx.bots` 是可迭代的集合。处理消息用 `session.bot`，后台任务选择配置里明确指定的 `sid`，不需要隐式的“当前账号”。

| 字段 | 含义 | 示例 |
|---|---|---|
| `platform` | 平台名称 | `ntqq`、`qq` |
| `selfId` | 平台上的机器人 ID | 普通 QQ 号、官方 AppID |
| `sid` | `platform:selfId`，集合唯一键 | `ntqq:12345`、`qq:100001` |
| `user` | Bot 自身用户资料，可缺省 | `name`、`avatar` |
| `status` | 当前状态 | `Status.ONLINE` |
| `features` | 原生能力列表 | `message.markdown` |

`ctx.bots` 支持 `size`、`get(sid)` 和遍历。后台发送可以使用：

```ts
import { h, type Context } from '@luckylillia/plugin-sdk'
import { Status } from '@satorijs/protocol'

export async function notify(ctx: Context, sid: string, channelId: string, text: string) {
  const bot = ctx.bots.get(sid)
  if (!bot || bot.status !== Status.ONLINE) return false
  await bot.sendMessage(channelId, h.text(text))
  return true
}
```

调用方需声明 `bots` 服务依赖。对象已注册不代表在线，在线也不保证平台允许主动消息；仍应处理发送异常和额度限制。不要随意选择集合中的第一个 Bot。

#### Session

| 字段 | 用途 |
|---|---|
| `bot`、`platform`、`selfId` | 本次事件所属 Bot |
| `type`、`timestamp` | 事件类型和时间 |
| `userId`、`channelId`、`guildId`、`messageId` | 事件中的 ID，可能为空 |
| `isDirect` | 是否私聊 |
| `content` | 元素标记字符串，无消息时为空 |
| `elements` | 解析后的元素数组 |
| `stripped` | 去掉开头引用、对 Bot 的 @ 及后续空白；包含 content、atSelf |
| `event` | 原始中立事件，字段为 snake_case |

常用 event 字段包括 user、member、guild、channel、message、operator、button、`referrer`。例如 `event.member?.roles` 是已知群角色。并非所有事件都有消息、用户或会话，调用回复和管理方法前要检查相应 ID。

#### 动态状态与标识符

`bot/status` 通知注册、注销和状态变化。判断通知中的对象是否仍有效，使用 `ctx.bots.get(bot.sid) === bot`：注销对象的 status 可能仍是此前状态，同一 `sid` 也可能已换成新对象。

插件启动时可能已经有 Bot，也可能集合为空。需要为每个 Bot 初始化资源时，应检查当前集合并订阅后续通知，对重复事件保持幂等；对象替换或移除时清理其资源。定时任务在执行时重新 `get(sid)`，避免使用已卸载对象。

ID 一律按字符串处理，不能假设可转换为 QQ 号。官方用户和群是 openid，频道有独立 ID。跨平台索引至少包含平台；数据不应在多个 Bot 间共享时，推荐 `[bot.sid, userId]` 或 `[bot.sid, channelId, userId]` 作为复合键。同一人在不同平台或 AppID 下不一定拥有相同身份。

### 收发消息

#### 消息中间件与 next

匹配失败时调用 `next` 继续处理；匹配成功后可以消费消息，或回复后继续传递：

```ts
import { Context } from '@luckylillia/plugin-sdk'

export const inject = ['bots']

export function apply(ctx: Context) {
  ctx.on('bot/message', async (session, next) => {
    const content = session.stripped.content
    if (!content.startsWith('echo ')) return next()
    await session.reply(content.slice(5))
    // 本分支消费消息。希望后续插件也处理时，在这里 await next()。
  })
}
```

`await next()` 会等待后续链完成，可以在前后执行逻辑。它表示继续处理，不是发送完成回调；同一中间件不要对同一消息多次调用 `next`。

#### 元素与发送

SDK 导出 `@satorijs/element` 的 h。使用 `h.text(value)` 发送纯文本，`h.parse(markup)` 解析明确约定为元素标记的字符串。不要把普通用户输入直接拼进 XML 式元素属性。

以下片段放在消息回调中，并从 SDK 导入 `h`：

```ts
await session.send([
  h('at', { id: session.userId }),
  h.text(' 结果如下：'),
  h.image('https://example.com/result.png'),
])
await session.reply(h.text('这是一条引用回复'))
```

| 方法 | 行为 |
|---|---|
| `session.send(content)` | 发到触发会话，保留 `referrer` |
| `session.reply(content)` | 同上，并引用触发消息 |
| `session.sendQueued(content, delay?)` | 同 Bot、同频道排队，发送后默认间隔 1000ms |
| `session.prompt(timeout?)` | 等待同 Bot、同频道、同用户的下一条消息，默认 60 秒 |
| `bot.sendMessage(channelId, content, options?)` | 明确指定会话，返回消息资源数组 |
| `bot.sendPrivateMessage?.(userId, content, options?)` | 可选私聊方法，调用前检查 |

SendOptions 支持 quote（消息 ID）和 `referrer`（被动回复信息）。已有 Session 时优先 send/reply；自己调用 Bot 时可传 `{ referrer: session.event.referrer }`。返回值可能包含多条消息，不保证只有一个数字 ID，缓冲中的流式片段也可能暂时没有 ID。

**等待回答与排队发送**

```ts
await session.send('请输入标题，30 秒内有效。')
const answer = await session.prompt(30_000)
await session.send(answer === undefined ? '等待超时。' : h.text('收到：' + answer))
```

prompt 返回 `stripped.content`。回答不再进入 `bot/message`，但 `bot/session` 旁路仍能看到。相同 Bot、频道、用户的新等待会使旧等待以 `undefined` 结束。仅投递 @ 消息的群里，回答也要 @ Bot。

`sendQueued` 只控制发送节奏，不增加平台额度。连续发送时逐条 await，避免大量并发发送。

#### 事件入口

| 事件 | 分发方式 | 内容 |
|---|---|---|
| `bot/message` | 顺序中间件 | 别人发来的消息 |
| `bot/event` | 并行通知 | 成员变化、撤回、申请、互动和 Bot 自己的消息 |
| `bot/session` | 并行旁路 | 所有事件，先于消息路由；仍受生效范围过滤 |
| `bot/status` | 并行通知 | Bot 注册、注销和状态变化 |
| `bot/before-send` | 顺序变换 | 插件即将发出的元素 |
| `bot/fallback` | 按顺序询问 | 不支持的扩展元素如何替代 |

Bot 自己的消息不进 `bot/message`，避免回复循环；它们可能出现在 `bot/event` 和 `bot/session`。旁路不受中间件消费影响。

下列片段放在已导入 h、`inject` bots 的插件 `apply` 中：

```ts
ctx.on('bot/event', async (session) => {
  if (session.type !== 'guild-member-added' || !session.userId || !session.channelId) return
  await session.send([h('at', { id: session.userId }), h.text(' 欢迎加入')])
})
```

#### 发送前改写

下面的监听器放在已导入 `h`、声明 `bots` 依赖的 `apply` 中：

```ts
ctx.on('bot/before-send', (bot, channelId, content, next) => {
  content.push(h.text(' [自动回复]'))
  return next()
})
```

可原地修改 content、处理 `await next()` 的结果，或返回 [] 取消发送。OneBot、Milky 客户端的发送和 Satori relay 不调用插件的发送前改写及自定义降级。Satori relay 仍应用宿主内置元素降级。

#### 生效范围和处理顺序

用户打开独立的 **「消息处理顺序」** 设置页（`#message-order`，由内置插件 `builtin:message-order` 提供），用上下箭头排序，点击 **「保存顺序」** 后立即生效，无需重启。插件 1 在插件 2 前面，且插件 1 调用了 `next`，插件 2 才能收到。

显式排序的插件优先，未排序监听器按注册先后排在后面。`ctx.on(..., { prepend: true })` 只调整未排序部分，不能覆盖用户排序。列表显示实际注册消息监听器的插件。

**所有 `ctx.command` 注册的指令统一在「指令」这一行执行。** 它们不会分别列在所属插件的消息处理行中。要在指令匹配前过滤，把过滤插件移到「指令」上方；普通插件排序不改变同名指令的注册顺序。

每个插件条目的配置弹窗提供平台、Bot、群、用户和私聊的生效范围。范围影响 `bot/message`、`bot/event`、`bot/session`、指令匹配和 `bot/before-send`。它不是代码沙箱，不为任意 HTTP 接口、后台任务或直接平台调用提供业务授权；主动任务仍需自己选择和校验目标。

一个监听器失败不使整条链失败：在 `next` 之前抛错会继续后面的插件，错误记录在日志和卡片；已经完成的处理不会回滚。故意消费消息时正常返回，不要靠异常阻断。

### 指令

在 `inject` 和清单的 `required` 中声明 `commands`，然后使用 `ctx.command(def, description?, config?)`：

```ts
import { Context, h } from '@luckylillia/plugin-sdk'

export const inject = ['commands']

export function apply(ctx: Context) {
  ctx.command('repeat <text:text>', '重复文本', { cooldown: 3000 })
    .alias('复述')
    .option('times', '-n <count:posint> 重复次数', { fallback: 1 })
    .action(({ options }, text: string) => {
      const count = Math.min(Number(options.times), 5)
      return h.text(Array.from({ length: count }, () => text).join('\n'))
    })
}
```

调用 `/repeat -n 2 你好` 或 `复述 --times 2 你好`。这个示例以纯文本展示输入；要保留参数中的 @ 等元素，再明确使用 `h.parse`。

用户还可以在内置「指令」页为每条指令添加多个自定义别名，每行一个，不含前缀，点击「保存配置」后立即生效。自定义别名与 `.alias()` 声明的别名叠加，原名仍可用；共用参数、权限、冷却和生效范围。别名按插件条目和注册原名保存，停用或重载不丢失，也不影响其他插件的同名指令。`ctx.commands.list()` 返回全部生效别名，可用于插件自己的帮助菜单。

#### 参数和选项

`<name:type>` 必需，`[name:type]` 可选，省略类型使用 string。

| 类型 | 结果 |
|---|---|
| `string` | 一个词，引号中的空白保留 |
| `text` | 后续全部文本 |
| `number` | 数字 |
| `integer` | 整数 |
| `posint` | 大于 0 的整数 |
| `natural` | 大于等于 0 的整数 |
| `user` | @ 或输入中的用户 ID |

支持英文单双引号、中文弯引号和「…」包住含空白参数。string/text 保留元素标记。解析失败发送原因和用法。

option(name, syntax, { fallback? }) 的 --name 总能使用，syntax 可以声明短选项和一个参数；无参数是布尔开关，出现时为 true。action 的 argv 含 session、command、options、args，普通参数也作为其后位置参数传入。

action 返回的字符串或元素会发送到触发会话；也可自行 send 并不返回内容。如果这条消息不由本指令处理（例如图片检测命令没带图），`return argv.next()` 将原消息交给后续消息中间件；直接返回 `undefined` 会结束本次处理。抛错时记录所属插件错误，用户收到「执行指令时出错了。」。卸载自动注销，提前注销调用命令对象 dispose()。

#### 权限、冷却和菜单

- authority 声明插件的默认权限，省略时为 everyone；admin 允许群主、管理员和主人；owner 只允许「指令」设置中的主人。在「指令」页的主人列表中，每行选择平台并填写用户 ID，可以添加、删除。NTQQ 填 QQ 号，QQ 官方机器人填用户 openid；选「全部平台」时匹配所有平台上的该 ID。配置仍存为 `owners: string[]`，如 `ntqq:12345`、`qq:用户openid`，裸 ID 表示全部平台；已有 `luckylillia:` 前缀会按 `ntqq:` 处理。
- 用户可在「指令」页的“谁能用”中覆盖每条指令的权限，保存后立即生效，选择“默认”恢复插件声明。权限按插件条目和指令原名保存，原名及所有别名共用，同名的其他插件指令不受影响。`ctx.commands.list()` 的 `authority` 是生效权限，`defaultAuthority` 是插件默认权限。
- cooldown 单位毫秒，当前按“指令名 + 平台 + 用户 ID”记录，同一用户跨群调用同名指令也共享冷却，并非每频道或每 Bot 独立。
- hidden: true 不同步到平台菜单，不禁用指令，也不从指令管理页隐藏。
- 默认 / 前缀并允许无前缀，用户可修改。匹配前移除开头对 Bot 的 @。
- 名称或别名后可以是空白、消息结束或图片、@ 等真正的消息元素，如 `/查图<img src="…"/>`；元素原样保留在参数和 session 中。继续拼接普通文字（如 `查图呀`）不匹配，转义后的 `<img>` 文本也不当元素边界。
- 同名指令先按插件生效范围筛选，再按名称长度、注册先后匹配；冲突可在指令页查看。
- 官方机器人启用由插件提供单聊菜单/群指令面板后，同步非 hidden 指令。菜单展示不代替运行时授权。

没有内置 help 指令。需要时自己注册，可通过 `ctx.commands.list()` 获取名称、别名、说明、用法、权限等，并决定展示哪些内容。中间件顺序详见[生效范围和处理顺序](#生效范围和处理顺序)。

## 配置与数据

配置由用户编辑；文件和数据表用于插件运行时保存数据。根据需要选择对应入口，并留意多个插件条目之间的共享规则。

### 配置

导出 `Config: Schema<Config>` 同时获得启动校验和 WebUI 表单。description 作为字段标题，没写时显示字段名。用户保存前，宿主校验完整生效值；失败时错误显示在字段旁，正在运行的实例保留旧配置。

配置变化后撤销旧挂载、以新配置启动，通常无需自己监听配置文件。其它 Standard Schema 实现（例如 zod）也能校验，但 WebUI 使用 JSON 编辑器。

#### 表单控件

表中省略 `Schema.` 前缀，例如 `string()` 实际写作 `Schema.string()`。

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
| `string().role('host')` | 监听地址：本机地址下拉，或手填 |
| `.role('xxx')`，且有插件用 `ctx.field('xxx', ...)` 注册了控件 | 那个控件（见"扩展 WebUI"；`ms` / `table` / `radio` / `checkbox` / `secret` / `slider` / `textarea` / `host` 不能被覆盖） |
| 其它（`any`、`is(...)`、无法判断的 union） | JSON 编辑框 |

hidden 字段不显示，但已有值仍保存、生效。deprecated、experimental 显示标签。自定义 role 见[自定义配置与字段](#自定义配置与字段)。

#### 密钥与保存语义

`role('secret')` 的已保存值不会明文返回给 WebUI。原掩码或空白提交都保留旧值，删除时使用「清空」并保存。数组中的密钥同样由宿主管理，不能自行把掩码当真实值写入。后端 config 收到实际密钥；WebUI 打码不代表磁盘加密。

配置存于当前 Bot 实例的 `plugins.json`，只记录相对默认值的差异。嵌套 object 逐字段比较，array、dict、union 和标量整体比较；升级后新的默认值会影响没有显式覆盖的字段。

**插件配置以条目为单位，不随消息的 Bot 自动切换。** 一个条目可处理多个 Bot，需要分账号行为时，使用生效范围或在配置中按 `sid` 区分。多个条目有独立配置，但文件目录的共享规则不同，见[多实例](#多实例)。

### 数据目录

`ctx.storage` 为当前插件提供数据目录，首次调用时创建，不需要等待 Bot 上线：

```ts
const shared = await ctx.storage.dir()
const sameShared = await ctx.storage.dir('global')
const perBot = await ctx.storage.dir('bot', session.bot)
const explicit = await ctx.storage.dir('bot', 'qq:100001')
```

| 调用 | 当前 Bot 实例中的路径 |
|---|---|
| `dir()`、`dir('global')` | `plugin-data/<包键>/shared/` |
| `dir('bot', bot或sid)` | `plugin-data/<包键>/bots/<平台>+<selfId>/` |

global 表示当前 Bot 实例内该插件的共享目录，不是整台机器共享。实例根目录是 `data/instances/<实例名>/`，包名中的 `/` 替换成 `+`，例如 `@scope/foo` 对应 `@scope+foo`。

同包的多个插件条目共用上述目录，不自动按条目 ID 分区。需要隔离时自行设计配置子空间；多个条目写同一文件需处理并发。卸载保留数据，数据目录不应放在代码或前端产物目录内。

`dir('bot', sid)` 接受未注册的 `sid`，因此它是身份分区，不是登录检查。官方机器人的群聊、单聊和频道共用同一 `qq:<AppID>` 目录；插件需要按会话分区时使用带命名空间的 `channelId`。

**旧 NT 插件数据兼容：** 优先使用 `bots/ntqq+<QQ号>/`，不存在时依次沿用 `bots/luckylillia+<QQ号>/`、更早的 `<包键>/<QQ号>/`。旧 `luckylillia:<QQ号>` 入参也归一到这套路径。不会移动、合并或删除原文件，多个目录同时存在时仍按上述顺序选择。插件始终以返回路径为准，不自行拼路径。

`ctx.baseUrl` 指向共享目录的 file URL，供按 URL 解析相对路径的生态插件使用。应在 `apply` 或构造阶段读取：服务方法中的 Context 可能是调用方；`ctx.storage` 按定义代码的插件定位，不会误用调用方的数据目录。

### 数据库

声明 `database` 服务依赖后，通过 `ctx.model` 定义数据表，通过 `ctx.database` 读写。数据位于当前 Bot 实例的 `database.db`，所有 Bot 共用，不依赖登录。插件使用自己的表名前缀和显式身份键；NT 协议内部消息库不属于该公共服务。

下面保存每个 Bot 上每个用户的偏好：

```ts
import { Context, h } from '@luckylillia/plugin-sdk'

declare module '@cordisjs/plugin-database' {
  interface Tables {
    my_plugin_preferences: { key: string; value: string }
  }
}

export const inject = ['commands', 'database']

export function apply(ctx: Context) {
  ctx.model.extend('my_plugin_preferences', {
    key: 'string',
    value: 'string',
  }, { primary: 'key' })

  ctx.command('记住 <value:text>', '保存自己的偏好')
    .action(async ({ session }, value: string) => {
      if (!session.userId) return
      const key = JSON.stringify([session.bot.sid, session.userId])
      await ctx.database.upsert('my_plugin_preferences', [{ key, value }])
      return h.text('已保存')
    })

  ctx.command('回忆', '读取自己的偏好').action(async ({ session }) => {
    if (!session.userId) return
    const key = JSON.stringify([session.bot.sid, session.userId])
    const [row] = await ctx.database.get('my_plugin_preferences', { key })
    return h.text(row?.value ?? '还没有保存')
  })
}
```

常用操作是 get/create/set/upsert/remove。SDK 导出数据库类型，表合并到 `@cordisjs/plugin-database`；开发依赖需提供对应库的类型。余额、计数等并发更新不能用无保护的“先读再写”代替原子操作或事务。

### 多实例

| 层次 | 隔离内容 |
|---|---|
| Bot 实例，启动时 `--instance <名字>` | settings/plugins/数据库/插件数据/WebUI 密码，由一个进程使用 |
| 同一 Bot 实例内的插件条目 | 启停、配置、生效范围、排序和运行状态 |

第三方插件包可添加多个条目，分别处理不同 Bot 或群。条目不等于独立代码副本，也不自动获得单独文件目录；同名服务、同端口、同文件仍可能冲突。

不同 Bot 实例的端口要避免冲突，配置不随换号切换。前端包级 hook 默认使用第一个条目，详见[页面与入口](#页面与入口)。实例布局见 [配置存储](config-storage.md)。

## HTTP 与代理

声明 `http` 服务依赖后，通过 `ctx.http` 发送请求。内置「代理」为该服务应用代理规则；全局 fetch 不自动使用这些规则。

```ts
import { Context, h } from '@luckylillia/plugin-sdk'

export const inject = ['commands', 'http']

export function apply(ctx: Context) {
  const api = ctx.http.extend({
    baseURL: 'https://api.example.com/v1',
    timeout: 10_000,
    headers: { accept: 'application/json' },
  })
  ctx.command('天气 <city>', '查询天气').action(async (_, city: string) => {
    const data = await api.get<{ text: string }>('/weather', { params: { city } })
    return h.text(data.text)
  })
}
```

示例 URL、响应结构需替换为实际服务。Key 放入 secret 配置，不硬编码或输出日志。

| 方法（在 `ctx.http` 或 `api` 上调用） | 行为 |
|---|---|
| `get/delete(url, config?)` | 解析后的响应内容 |
| `post/put/patch(url, data?, config?)` | 对象、数组按 JSON 发送，返回解析结果 |
| `head(url, config?)` | `Headers` |
| `request(method, url, config?)` | `{ url, status, statusText, headers, data }` |
| `fetch(url, init?, config?)` | 原始 Response，适合流和自定义处理 |
| `file(url, config?)` | `{ data: ArrayBuffer, type, filename? }`，支持 http(s)、data URL |
| `extend(config)` | 继承当前设置的新客户端，headers 合并 |
| `proxy(url, config?)` | 同步取得原生客户端应使用的代理地址；直连为 `''`，不发请求 |

默认按 `Content-Type` 解析 JSON、文本或字节；`responseType` 可指定 json/text/arraybuffer/stream。请求参数支持 params、data、signal、redirect。

除 `fetch` 外，非 2xx 响应会抛出 `HttpError`，可查看 `response.status`、`response.data`。网络错误查看 `code`，例如 `ECONNREFUSED`、`ENOTFOUND`、`ETIMEDOUT`。`HttpError` 是类型接口，不能用于 `instanceof`；`fetch` 保留原生响应语义，需要自行检查 `response.ok`。

`proxyAgent: ''` 表示直连；HTTP(S) 或 SOCKS5 地址覆盖默认代理，也可传给 `extend()`。这些代理由「代理」插件实施，停用时全部直连。file 在响应类型不明确时检查文件头，例如 QQ 图片返回 application/octet-stream 的情况。

原生浏览器等自行联网的客户端使用 `ctx.http.proxy(target)` 读取当前生效的地址，不需要读取其他插件的配置文件。该方法沿用 `baseURL`、`extend()` 和单次设置的合并规则，并遵循默认代理对本机、内网地址的跳过规则；无效代理会抛错。返回值可能包含代理账号密码，只交给后端原生客户端，不能放进日志或前端响应。调用方负责让原生客户端正确应用地址、认证和直连结果，并在重新建立连接时重新解析。

## 跨平台写法

### 通用元素与扩展元素

文本、at、quote、img、audio、video、file、p、br、message forward 等使用 Satori 元素形状。媒体格式、上传和合并转发仍由平台决定。四种扩展元素有统一能力声明和默认降级：

| 元素 | 写法 | 默认降级 |
|---|---|---|
| Markdown | `h('markdown', {}, '# 标题\n**粗体**')` | 转成通用文字、格式和图片元素 |
| 按钮 | `h('button', { text: '/sign' }, '签到')` | 指令提示或链接；回调按钮丢弃 |
| 卡片 | `h('card', { title, url, desc, image, prompt })` | 带链接的标题、描述和图片 |
| QQ 表情 | `h('face', { id: '13', name: '呲牙' })` | `[呲牙]`；未写 `name` 时为 `[表情]` |

**平台支持。** 官方机器人支持 Markdown 和按钮。卡片在官方群聊、单聊中转换为 Markdown（加粗的标题链接、描述和图片，原生 ark 需申请权限），在频道中使用 ark。QQ 账号和官方频道支持原生 QQ 表情。

**Markdown 降级。** 去掉 Markdown 标记后，粗体、链接、代码和图片仍保留为通用元素；列表使用“• ”，引用使用“｜”。

**按钮写法。** 一行按钮使用 `h('button-group', {}, [...])` 包裹，按钮类型决定点击行为：

| `type` | 相关字段 | 点击行为与降级 |
|---|---|---|
| 未指定或 `input` | `text`，缺省为按钮文字 | 点击发送指令；降级为“签到（发送「/sign」）”，文字与指令相同时为“「签到」” |
| `link` | `href` | 打开链接；降级为链接 |
| `action` | `id` | 产生 `interaction/button`，从 `session.event.button` 读取；没有通用降级行为，默认丢弃 |

官方专用按钮字段可通过 `action` 设置，优先于通用属性，详见 SDK 的 `ButtonAttrs`。

### 能力与流式回复

`bot.features` 中的 `message.markdown`、`message.button`、`message.card`、`message.face` 控制上述降级。其它能力只提供决策依据：

| 能力 | 含义 |
|---|---|
| `message.forward` | 合并转发 |
| `message.stream` | markdown stream 流式回复 |
| `message.proactive` | 支持主动发送，仍受平台额度和授权限制 |
| `guild.plain` | 群没有独立子频道，群 ID 同时作为会话 ID |

对同一回复使用相同 Session：

```ts
await session.send(h('markdown', { stream: true }, '第一部分。'))
await session.send(h('markdown', { stream: 'end' }, '\n最后一部分。'))
```

官方单聊把片段追加成一个气泡，群聊先缓冲、结束后合并。最终片段用 `stream: 'end'`，否则最后片段后 10 秒自动结束。缓冲期间发送结果可能没有 ID。不支持 `message.stream` 的 Bot 会逐片发送独立消息，应先判断能力决定逐片还是汇总发送。

Session 带回 `referrer`，能区分同一频道内并行生成的不同回复；仅使用频道最近消息可能关联错误。

### 自定义降级

`bot/fallback` 在 `bot/before-send` 后运行。宿主对不支持的 markdown/card/face 和每行按钮询问监听器，首个返回内容者生效；`undefined` 继续尝试或采用默认降级，空字符串丢弃。返回结果直接发送，不再递归降级。

```ts
ctx.on('bot/fallback', (bot, channelId, element) => {
  if (element.type !== 'face') return
  return h.text('表情：' + (element.attrs.name || element.attrs.id || '未知'))
})
```

渲染插件可调用自己的服务将 markdown 变为图片，再返回 h.image(png, 'image/png')。可选渲染服务用局部 `ctx.inject` 挂监听。不要返回目标平台仍不能处理的扩展元素。

### QQ 平台差异

#### 账号与资源 ID

NTQQ 的 `platform` 为 `ntqq`，提供普通 QQ 身份；官方机器人的 `platform` 为 `qq`，每个 AppID 只提供 `qq:<AppID>` 一个 Bot，统一承载群聊、单聊和频道。频道资源 ID 带 `qqguild:` 前缀，与群聊的数据空间隔离；它不是单独的 Bot 或平台。中立层允许同平台不同 `selfId`；可配置的账号数量由具体消息源插件决定。

官方机器人的 ID 约定如下，Bot 方法和会话使用同一套 ID：

| 对象 | ID 示例 |
|---|---|
| 群聊及其用户 | 群 openid、用户 openid，保持原值 |
| 单聊会话 | `private:<openid>` |
| 频道、子频道、频道用户、频道消息 | `qqguild:<腾讯原始 ID>` |
| 频道私信会话 | `private:qqguild:<私信 guild ID>_<私信 channel ID>` |
| 频道私信事件中的 `guildId` | `qqguild:<来源频道 ID>_<私信 guild ID>` |
| Bot 自身用户及对它的 @ | AppID，与 `bot.selfId` 一致 |

将 Session 或 Bot 返回的资源 ID 原样传给 Bot 方法；频道消息里的 `at`、`sharp`、`quote` 也使用对应的 ID。分页的 `next`、事件的 `referrer`、按钮 ID 和按钮数据都是不透明值，原样传回，不自行添加前缀。Satori 客户端同样只看到一个 `qq` login，频道消息通过这套资源 ID 区分。

OneBot、Milky、Satori 是对外传输协议，多开一个连接不等于多登录一个 QQ。Satori 可把中立层多个 Bot 作为不同 login 提供给外部客户端。

#### 消息与回复限制

- 官方群通常投递 @ Bot 的消息；全量群消息需要相应权限和订阅条件。匹配指令统一用 `stripped.content`，不假设原始内容以指令文本开头。
- 当前被动回复记账采用群消息 5 分钟 5 条、单聊 60 分钟 4 条，实际以平台响应为准。流式另有处理。没有可用被动目标时可能转主动发送，主动发送受每用户或群每月 4 条等限制和授权约束。`message.proactive` 不代表无限额度。
- send/reply 优先带回触发事件的 `referrer`；延时任务仍可能超过有效期，应处理失败。
- qq:ark24、qq:markdown、qq:rawmarkdown 等是平台专有元素；NT 商城表情和原始卡片是 ntqq:market-face、ntqq:ark。其它平台通常仅保留其子内容，不保证原样转发。
- 收到的 QQ 表情可转换为 face，NT 收到官方 markdown/按钮也会解为扩展元素，原始 ark 保留平台前缀。

具体事件、权限、媒体、菜单和格式见 [QQ 官方机器人](official-qq-bot.md)。

## 管理操作与平台接口

### 通用管理方法

Bot 只保证 `sendMessage`，标准管理方法均为可选。调用前检查接口和所需 ID：

```ts
if (session.guildId && session.userId && session.bot.muteGuildMember) {
  await session.bot.muteGuildMember(session.guildId, session.userId, 60_000)
}
```

| 功能 | 方法 |
|---|---|
| 消息查询和删除 | `getMessage`、`getMessageList`、`deleteMessage` |
| 用户好友 | `getUser`、`getFriendList`、`deleteFriend`、`handleFriendRequest` |
| 群和频道 | `getGuild`、`getGuildList`、`getChannel`、`getChannelList`、`createChannel`、`updateChannel`、`deleteChannel`、`createDirectChannel` |
| 群成员管理 | `getGuildMember`、`getGuildMemberList`、`muteGuildMember`、`kickGuildMember`、`muteChannel` |
| 申请和角色 | `handleGuildRequest`、`handleGuildMemberRequest`、`getGuildRoleList`、`setGuildMemberRole`、`unsetGuildMemberRole` |
| 表情回应和菜单 | `createReaction`、`deleteReaction`、`getReactionList`、`updateCommands` |

列表通常返回 `{ data, next? }`，将 `next` 用于下一页；禁言时长为毫秒。方法存在不代表当前 Bot 有平台权限。完整参数见 [Bot 类型](../packages/plugin-sdk/src/universal.ts)。

### 平台独有的接口：bot.internal

没有通用方法的能力走 `bot.internal`，推荐 `internalOf(bot, platform)` 获得对应类型，平台不匹配时返回 `undefined`：

#### NTQQ

以下片段中的 `session` 来自消息或事件回调：

```ts
import { internalOf } from '@luckylillia/plugin-sdk'

const internal = internalOf(session.bot, 'ntqq')
if (internal && session.guildId && session.userId) {
  await internal.setGroupCard({
    group_id: session.guildId,
    user_id: session.userId,
    card: '新名片',
  })
}
```

NT internal 使用 OneBot 11 action，含 go-cqhttp/LLOneBot 扩展。名称转为驼峰，`set_group_card` 对应 `setGroupCard`，`_send_group_notice` 对应 `sendGroupNotice`；参数仍是一个 OneBot 字段对象。返回 action 的 data，失败抛异常。消息 ID 参数可接收 `session.messageId`，但 OneBot 响应中的 message_id 仍可能是数字。无需开启 OneBot 对外适配器。

下面列出常用入口。代码中使用驼峰方法名，全部接口和参数见 [SDK internal](../packages/plugin-sdk/src/internal.ts)。

| 用途 | 方法示例 |
|---|---|
| 戳一戳、合并转发、OCR | `sendPoke`、`getForwardMsg`、`ocrImage` |
| 群名片、头衔和群资料 | `setGroupCard`、`setGroupSpecialTitle`、`getGroupHonorInfo` |
| 群公告和精华消息 | `sendGroupNotice`、`getGroupNotice`、`setEssenceMsg` |
| 群文件和相册 | `uploadGroupFile`、`getGroupRootFiles`、`getGroupAlbumList` |
| 好友资料和自身状态 | `sendLike`、`setFriendRemark`、`setOnlineStatus` |
| 私聊文件和闪传 | `uploadPrivateFile`、`getFlashFileInfo`、`downloadFlashFile` |
| 凭据和扫码 | `getCookies`、`getCredentials`、`scanQrcode` |

已有标准方法的 action、版本、状态、缓存和配置等辅助接口也在 internal 中；仅连接专用 .handle_quick_operation/get_event 不提供。可用标准方法时优先使用，完整类型见 [SDK internal](../packages/plugin-sdk/src/internal.ts)，不依赖固定的 action 总数。

#### 官方机器人

官方 qq 的 internal 合并群聊、单聊和频道 REST API，参数仍使用腾讯原始 ID，按方法签名传位置参数，与 NT 的 OneBot 对象参数不同。`sendMessage/deleteMessage` 是群聊接口，频道用 `sendGuildMessage/deleteGuildMessage`；`internalOf(bot, 'qq')` 包含全部接口，不再有 qqguild 平台。原始平台事件通过 `bot/event` 的 internal 类型提供，`event._type` 是平台事件名，`event._data` 为原始数据。

标准 Bot 方法使用上面的资源 ID；只有调用原始 `internal` 接口时才去掉 `qqguild:` 前缀。例如查询频道的接口权限：

```ts
import { internalOf } from '@luckylillia/plugin-sdk'

const qq = internalOf(session.bot, 'qq')
if (qq && session.guildId?.startsWith('qqguild:')) {
  const guildId = session.guildId.slice('qqguild:'.length).split('_')[0]
  const permissions = await qq.getGuildApiPermissions(guildId)
}
```

SDK 的 `QQInternal` 包含全部官方接口；`QQGuildInternal` 仅作为已弃用的旧类型导出保留，不能再用 `internalOf(bot, 'qqguild')` 获取接口。

## 依赖与提供的服务

访问服务统一通过 `ctx`。内置服务的声明见[声明服务依赖](#声明服务依赖)；需要其他独立插件提供能力时，还要声明插件包关系。

| 你需要声明什么 | 放在哪里 |
|---|---|
| 运行时要等待的服务 | 后端 `inject`，清单 `llbot.service.required` |
| 必须安装的独立插件 | `llbot.dependencies`，填写包名和版本范围 |
| SDK 或插件 API 的兼容版本 | `peerDependencies` |
| 插件自己使用的普通 npm 库 | 包顶层 `dependencies` |

### 声明插件包依赖

依赖另一个外部插件时，在 `llbot.dependencies` 里写它的完整 npm 包名和 semver 版本范围。例如 `lucky-lillia-plugin-aiimgdetector`（源码位于 Bot 同级的 `LuckyLillia.Plugins/lucky-lillia-plugin-aiimgdetector`）需要 AI 服务插件：

```json
{
  "peerDependencies": {
    "@luckylillia/plugin-sdk": "^1.0.0",
    "lucky-lillia-aiprovider": "^1.0.0"
  },
  "llbot": {
    "dependencies": {
      "lucky-lillia-aiprovider": "^1.0.0"
    },
    "service": { "required": ["bots", "ai", "http"] }
  }
}
```

`llbot.dependencies` 是必需的插件包关系，宿主按扫描到的插件包检查是否已安装、版本是否匹配；WebUI 同时展示包名、要求的版本和提供者状态。缺包或版本不匹配时不会运行消费者。字段只能填写插件包名和 semver 范围，不接受 Git、文件路径、URL 或 npm 别名；内置的 `bots`、`database` 等服务按[服务依赖](#声明服务依赖)声明。

市场如何安装和检查这些依赖，见[市场兼容性](#市场兼容性)。

`peerDependencies` 保留 SDK 和插件 API 的兼容声明，开发时另行提供其类型；它本身不触发插件市场安装。普通 npm 库写在包顶层的 `dependencies`，安装到这个插件自己的 `node_modules`。不要用普通库依赖代替 `llbot.dependencies`。

### 提供服务

一个完整的服务插件入口：

```ts
import { Context, Service } from '@luckylillia/plugin-sdk'

declare module 'cordis' {
  interface Context {
    greetings: Greetings
  }
}

export default class Greetings extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greetings')
  }

  greet(name: string) {
    return '你好，' + name
  }
}
```

清单声明 `"implements": ["greetings"]`，可用 `"labels": { "greetings": "问候服务" }` 提供面向用户的名称。消费者导入对应类型后 `inject` greetings，调用 `ctx`.greetings.greet('小明')。

同一服务域不能注册同名服务。两个启用条目提供同名服务时，WebUI 提示冲突，后注册者可能失败。服务需要多实例时，应设计服务域或自己的实例 API，不能仅复制同名提供者。

### 可选媒体转换

安装并启用 `lucky-lillia-plugin-ffmpeg` 后可以使用 `ctx.ffmpeg`：`probe()` 读取媒体信息、`decodeAudio()` / `encodeAudio()` / `transcodeAudio()` 转换音频、`thumbnail()` 生成 PNG 封面。SDK 导出对应的 `FFmpegAPI`、`FFmpegAudioFormat` 和 `FFmpegMediaInfo` 类型。Bot 不内置这个插件；只有媒体功能需要时，用局部 `ctx.inject(['ffmpeg'], ...)` 挂载这部分，并在不可用时给用户安装提示或使用自己的 fallback。插件全部功能都依赖转换时才放入顶层 `inject` 和必需依赖。完整行为与工程布局见 [native-ffmpeg.md](native-ffmpeg.md)。

### 使用外部 AI 服务

AI 由独立插件提供。需要调用时安装服务提供者、声明插件包依赖和 `ai` 服务依赖，再通过 `ctx.ai` 使用；模型选择、类型和完整例子见 [AI 插件开发](ai-plugins.md)。

## 扩展 WebUI

只需要自动配置表单时，在后端导出 `Config` 即可。要增加页面、Dashboard 卡片、自定义配置编辑器或表单控件，再为插件编写浏览器模块。

前后端示例都把上下文参数命名为 `ctx`，但它们运行在不同位置，提供的 API 也不同：

| 上下文 | 导入来源 | 用途 |
|---|---|---|
| 后端 `Context` | `@luckylillia/plugin-sdk` | 使用 `ctx.bots` 等服务、读写文件、注册 HTTP 接口 |
| 前端 `WebUIContext` | `@luckylillia/plugin-sdk/webui` | 注册页面和插槽，通过 SDK 或 HTTP 获取后端数据 |

两者都由宿主传给各自的 `apply(ctx)`；React 组件中用 `usePluginContext()` 获取前端上下文。浏览器不能直接调用后端的 `ctx.bots` 或文件系统。例如，前端的 `useBots()` 返回用于展示的账号信息，不是可以发送消息的后端 `Bot` 对象。

### 页面与入口

在 `package.json` 的 `llbot.webui` 中声明浏览器入口，例如：

```json
{
  "llbot": {
    "webui": "webui/index.js"
  }
}
```

以下内容可直接保存为 `webui/index.js`，不需要打包。前端入口默认导出 `apply(ctx)`，由它注册页面：

```js
import { createElement } from 'react'
import { SchemaSettings, useBots } from '@luckylillia/plugin-sdk/webui'

function BotsPage() {
  const bots = useBots()
  if (bots === null) return createElement('p', null, '正在读取账号…')
  return createElement('div', { className: 'card', style: { padding: 20 } },
    bots.length ? bots.map(bot => createElement('p', { key: bot.sid },
      bot.sid + ' · 状态 ' + bot.status,
    )) : createElement('p', null, '尚无已注册的账号'),
  )
}

/** @param {import('@luckylillia/plugin-sdk/webui').WebUIContext} ctx */
export default function apply(ctx) {
  ctx.page({ id: 'bots', title: '账号列表', icon: 'users', component: BotsPage })
  ctx.page({ id: 'settings', title: '示例设置', component: SchemaSettings, settings: true })
}
```

界面的显示条件取决于注册方式：

| 注册方式 | 何时显示或可用 |
|---|---|
| `ctx.page({ id, title, component, icon?, order?, header? })` | 插件启用时列入侧边栏；未运行时，页面内容换成等待或错误原因 |
| `ctx.page({ ..., settings: true })` | 后端未运行时也能配置；停用后从侧边栏移除，但配置弹窗仍可打开它 |
| `ctx.slot(name, contribution)` | 插件运行时显示贡献 |
| `ctx.declareSlot(name, declaration)` | 声明自己界面中供其他插件扩展的位置 |
| `ctx.config(Editor)` | 替代配置弹窗的自动表单，插件停用时也能配置 |
| `ctx.field(role, Field)` | 模块加载后，相应 `role` 字段使用该控件 |

一个包共享一个前端模块。`usePluginStatus()` 和 `usePluginConfig()` 默认面向该包的第一个条目，不会自动提供多条目选择器。为多个条目做业务界面时，需要自行设计条目选择和对应接口；每个后端条目不会自动生成一个页面实例。

### 界面加载

第三方 WebUI 模块随插件启用自动加载。打开停用插件的配置弹窗时，也会按需加载它的模块，以便使用自己的配置编辑器或设置页。模块加载失败时，配置弹窗回退到通用表单。

卸载插件或删除它的 WebUI 入口后，模块注册的页面、插槽、编辑器和字段控件会被移除。

界面布局偏好保存在 Bot 实例的 `plugins.json` 中，同一实例的不同浏览器共享这些设置。页面排序和插槽显示偏好的入口分别见[页面布局与侧边栏](#页面布局与侧边栏)和[插槽](#插槽)。

### 页面布局与侧边栏

`page.id` 在包内唯一，实际地址为 `#<包名>:<id>`。`ctx.pageHref(id, { fullscreen: true })` 生成不带侧边栏及标题的独立页面地址；组件用 `usePageView().fullscreen` 判断布局。`header` 是宽屏页面上方的标题区域，插件未运行时不渲染。

侧边栏的 `order` 从小到大排列，默认 `100`；同位置按插件名排序。常用参考位置如下：

| 页面 | `order` |
|---|---|
| Dashboard | `0` |
| NTQQ | `5` |
| 适配器及其他协议设置 | `10`–`14` |
| 日志 | `20` |
| 插件 | `40` |
| WebQQ | `50` |
| WebUI 设置 | `900` |
| 关于 | `1000` |

用户在 **WebUI 设置 → 侧边栏** 中调整顺序和隐藏，用户设置的位置优先于插件的 `order`。隐藏不阻止通过页面地址或配置弹窗打开页面；没有指定 hash 时，打开侧边栏第一项。

第三方插件卡片的齿轮始终打开配置弹窗，生效范围和已有实例都在这里管理。注册设置页后，弹窗中的自动表单换成「打开设置页」。内置插件的齿轮可直接跳到自己的设置页。

WebUI 自身是内置插件 `builtin:webui`。主题、侧边栏、监听地址和端口、访问密码、退出入口都在侧边栏的 `#webui` 页面，WebUI 插件卡片的齿轮也跳到这里。侧边栏隐藏该页面后，仍可从插件卡片打开。插件自己的设置则放在它的卡片和页面中。

### 前端 SDK

从 `@luckylillia/plugin-sdk/webui` 导入以下 Hook 和组件，完整类型见 [webui.ts](../packages/plugin-sdk/src/webui.ts)。

**读取状态和控制布局：**

| `Hook` | 返回内容 |
|---|---|
| `usePluginContext()` | 当前插件的前端 `WebUIContext` |
| `usePluginStatus()` | 当前包第一个条目的 `disabled`、`state`、`error`、`notice` 等；未加载时为 `undefined` |
| `usePlugins()` | WebUI 列出的全部条目；未加载时为 `null` |
| `useBots()` | 账号的 `sid`、`platform`、`selfId`、`status`、`name`、`avatar`；未加载时为 `null`，宿主约每 5 秒更新 |
| `usePluginConfig()` | 配置草稿、schema、错误和保存操作 |
| `usePageView()` | 当前页面是否以 `fullscreen` 模式打开 |
| `useSidebar()` | 侧边栏的 `collapsed` 状态和 `setCollapsed` |
| `useSlotMatches(name)` | `keyed` 插槽当前可用的键 |

**复用界面组件：**

| 组件 | 用途 |
|---|---|
| `SchemaForm` | 自动表单，可用 `fields` 限定顶层字段 |
| `SchemaSettings` | 包含插件标题、说明、表单和保存按钮的设置页 |
| `SelectInput` | 统一样式的下拉框 |
| `HostInput` | 监听地址输入，与 `role('host')` 相同 |
| `PathInput` | Bot 所在机器的路径输入及浏览 |
| `DurationInput` | 以天、时、分、秒编辑时长，保存单位为秒 |
| `StatusNotice` | 插件页顶部提示，可带 `action` 和本插件的目标 `page` |
| `Slot` | 渲染已声明的插槽 |
| `Icon` | 显示支持的 lucide 图标，接受 `name`、`size`、`className` |
| `Lightbox` | 图片放大查看，支持左右键、Esc 关闭及加载失败提示 |

`StatusNotice` 放在插件自己的页面，宿主没有插件专用的全局提示栏。`Lightbox` 接受 `images`（`{ url, caption? }[]`）、`index`、`onIndex` 和 `onClose`。表单组件的参数见下一节。

### 自定义配置与字段

#### 选择配置界面

| 需求 | 用法 | 保存由谁负责 |
|---|---|---|
| 直接使用完整设置页 | `ctx.page({ ..., component: SchemaSettings, settings: true })` | `SchemaSettings` |
| 自己编写设置页 | 页面组件调用 `usePluginConfig()` | 页面调用 `config.save()` |
| 替换配置弹窗里的表单 | `ctx.config(Editor)` | 宿主配置弹窗 |
| 只替换某一类字段控件 | `ctx.field(role, Field)` | 所在的表单或页面 |

`SchemaSettings` 支持以下参数：

- `fields`：只显示指定的顶层字段。
- `sections: [{ title, fields, collapsed?, description? }]`：按组显示字段。`description` 是标题旁的说明文字，折叠后仍可见。
- `links: [{ label, href }]`：标题旁的链接。
- `children`：表单下方的内容，可以是节点，也可以是接收配置状态的函数。

#### 自己编写设置页

`usePluginConfig<T>()` 返回 `value`（加载前为 `null`）、`setValue`、`schema`、`error`、`errors`、`saving`、`save` 和 `clearSecret`。`setValue()` 只修改草稿，调用 `save()` 才提交：

```tsx
import { usePluginConfig } from '@luckylillia/plugin-sdk/webui'

export function SettingsPage() {
  const config = usePluginConfig<{ greeting: string }>()
  if (config.value === null) return <p>{config.error || '正在读取配置…'}</p>
  return <div>
    <input className="input-field" value={config.value.greeting}
      onChange={event => config.setValue({ greeting: event.target.value })} />
    {config.errors.greeting && <p>{config.errors.greeting}</p>}
    <button type="button" className="btn-primary" disabled={config.saving}
      onClick={() => void config.save()}>保存</button>
  </div>
}
```

保存成功后，后端以新配置重启；失败时显示 toast 或字段错误。发生 revision 冲突时重新加载配置，避免覆盖其他位置刚保存的内容。

`ctx.config(Editor)` 注册的是**配置弹窗内部**的编辑器，接收 `{ value, onChange, schema, defaults, errors }`。编辑器只负责编辑并调用 `onChange()`，保存由弹窗完成。`value` 已补默认值，错误以 `a.b` 路径为键，根路径是 `''`。使用自定义界面时，仍建议导出后端 `Config` 做校验。

#### 常用输入组件

- `SelectInput`：`options` 为 `{ value, label }[]`，使用 `===` 比较选项值。`placeholder` 默认是「请选择」，`className` 加在按钮上。下拉框使用该组件，避免原生 `<select>` 的系统菜单样式。
- `PathInput`：`select: 'directory'` 选目录，默认选文件；`accept: ['.exe']` 限定扩展名，弹窗仍允许显示所有文件；`start` 指定值为空时的初始路径。它调用受保护的 `/api/fs/list`，只列 Bot 所在机器上的文件名。浏览器自身的文件对话框指向浏览器所在机器，不能代替该组件。
- `DurationInput`：`maxDays` 默认 `1`，设为 `0` 去掉天数；`showSeconds: false` 隐藏秒。它保存的单位是**秒**，而 schema 的 `role('ms')` 保存**毫秒**，使用时需要换算。

#### 自定义字段控件

下面的控件对应后端的 `Schema.string().role('color')`：

```tsx
import type { FieldProps, WebUIContext } from '@luckylillia/plugin-sdk/webui'

function ColorField({ value, onChange, error }: FieldProps<string>) {
  return <label>
    <input type="color" value={value} onChange={event => onChange(event.target.value)} />
    {error && <span>{error}</span>}
  </label>
}

export default function apply(ctx: WebUIContext) {
  ctx.field('color', ColorField)
}
```

`FieldProps` 还提供 `meta`，包含 `description`、`default`、`role` 选项等。控件会影响所有使用该 `role` 的字段，命名应明确；内置的 `ms`、`table`、`radio`、`checkbox`、`secret`、`slider`、`textarea`、`host` 不能被覆盖。

### 插槽

插槽是界面所有者显式开放的扩展位置。插件可以往插槽中注册组件，称为一项「贡献」。例如，下面的入口为 Dashboard 增加一张账号状态卡片：

```js
import { createElement } from 'react'
import { useBots } from '@luckylillia/plugin-sdk/webui'

function OnlineCount() {
  const bots = useBots()
  return createElement('p', null, '在线账号：' + (bots?.filter(bot => bot.status === 1).length ?? 0))
}

/** @param {import('@luckylillia/plugin-sdk/webui').WebUIContext} ctx */
export default function apply(ctx) {
  ctx.slot('dashboard.cards', {
    id: 'online-count', title: '账号状态', icon: 'users',
    size: 'normal', order: 100, component: OnlineCount,
  })
}
```

#### 显示方式与可用位置

插槽的「基数」决定如何处理多个贡献，以及能否替换或包装原内容：

| 基数 | 行为 | 贡献参数 |
|---|---|---|
| `list` | 所有贡献按顺序显示 | `order` 小的在前 |
| `single` | 只显示优先级最高者，无贡献时显示默认内容 | `priority` 大的优先 |
| `keyed` | 为当前渲染的键选择一个贡献 | `match` 指定键，`priority` 决定优先级 |
| `chain` | 层层包装，排前面的在外层 | 按 `order` 排序，组件接收 `next` |

| 插槽 | 基数 | 组件收到的 props | 选项及外框 |
|---|---|---|---|
| `plugins.toolbar` | `list` | 无 | 统一插件页筛选栏的附加工具按钮 |
| `plugins.views` | `list` | `PluginsViewProps`：`{ configAction, showDetails }` | 必需 `title`，以紧凑工具按钮打开独立视图，可返回统一列表 |
| `plugins.catalog` | `list` | `PluginCatalogProps`：`{ loadCatalog, onChange }` | 提供目录数据和包操作，组件不绘制界面 |
| `plugins.install` | `list` | `{ onInstalled }` | 宿主本地安装弹框内的上传控件 |
| `plugins.card.actions` | `list` | `{ plugin }` | 每张卡片的附加按钮，组件自行筛选目标 |
| `dashboard.cards` | `list` | 无 | `title`、`icon`、`size`；Dashboard 绘制卡片和标题 |
| `dashboard.header` | `single` | 无 | 替换 Dashboard 标题 |
| `webqq.chat.actions` | `list` | `{ chat }` | `chat` 含 `chatType`、`peerId`、`name` |
| `webqq.message.element` | `keyed` | `{ element, message? }` | `match` 为 NT 元素类型字符串；引用预览可能没有 `message` |
| `webqq.message.bubble` | `chain` | `{ message, next }` | 包装整个消息气泡 |

Dashboard 的 `size` 可为 `normal`、`wide`、`full`，约占三分之一、三分之二或整行；同行剩余空间按比例分配。卡片和标题由 Dashboard 绘制，贡献组件只画内部内容。插件管理页只开放追加位置，没有替换管理功能的入口。

`plugins.catalog` 为统一插件列表提供数据，组件返回 `null`。`loadCatalog` 仅在用户浏览「未安装」或「全部插件」时为真；提供者应按需获取目录，在 effect 中调用 `onChange(state)` 发布 `PluginCatalogState`，卸载时调用 `onChange(null)`。快照包含目录 `items`、已安装包 `installed`、更新信息 `updates`、各自的加载/错误状态、`busy`，以及 `retry()`、`refresh()`、`install(name, version)`、`update(name)`、`uninstall(name, options?: { keepConfig?: boolean })`；三个包操作返回 `Promise<boolean>`。宿主卸载弹框默认勾选「保留配置」，确认时显式传入 `keepConfig`；省略该选项按 `false` 处理。`PluginCatalogItem` 继承详情元数据，另含精确 `version`、可选 `category`、`repository` 和内置条目名 `builtin`。宿主负责合并本地条目、包与目录、去除重复包、筛选、分页、卡片和详情；默认已安装列表不等待目录网络。

`plugins.install` 的组件始终显示在「本地安装」弹框的真实目录与扫描按钮下方，不再使用上传/扫描标签切换。成功后调用 `onInstalled()`，由宿主刷新列表、清空全部筛选并回到「已安装」。实际目录由宿主接口读取，扫描也由宿主提供；市场停用时仍可查看目录和扫描。

`plugins.views` 的 `configAction(id)` 接收插件条目 ID，返回 `{ open(): void; label: string }` 或 `undefined`。可以从 `usePlugins()` 取得条目，使用返回的 `label` 绘制按钮，点击时调用 `open()`，由宿主打开与插件列表齿轮相同的配置弹框或设置页；没有动作时隐藏按钮。同包多实例应先让用户选择条目 ID，不能把 npm 包名当作 ID。`PluginsViewProps` 类型从 `@luckylillia/plugin-sdk/webui` 导入。

`showDetails(source)` 打开与插件列表 Info 相同的详情弹框，也可展示未安装的包。`source` 使用 SDK 的 `PluginDetailsSource`：必填 `name`、`title`，可选 `version`、`description`、`author`、`icon`、`iconUrl`、`screenshots` 和异步 `load()`。`title` 和作者等信息固定在弹框顶部，不随正文滚动；其下始终先显示 `description` 简介，再显示截图。简介立即展示，不等待详情加载。不提供 `load()` 时直接复用已有元数据，未安装卡片使用目录中的内容，不显示加载动画。需要另行读取详情时，`load()` 返回 `PluginDetailsContent`：`{ markdown?, base, screenshots }`，其中 `base` 是 Markdown 相对图片路径的 URL 基准目录，带结尾斜杠；无 Markdown 时可用空字符串。宿主负责异步加载状态、失败提示与重试，以及图片放大；非空 Markdown 保留在截图之后默认折叠的「完整说明」中，用户点击展开，不替换简介。若 Markdown 的第一个内容块是一级标题，详情中省略该块，避免重复显示主标题；后续标题和其他内容保留。

`PluginMetaRow` 从 `@luckylillia/plugin-sdk/webui` 导入，可复用宿主卡片的元数据行。必填 `title`，可选 `category`、`author: { name, url? }`、`packageName`、`repository`、`className`；分类使用 `llbot.category` 的分类值，缺省显示「其他」，省略包名或仓库地址则隐藏对应链接。通过 `children` 添加紧跟包/仓库链接的内容，例如 Info 按钮；链接与附加内容组成不拆行的一组。组件只展示传入的数据，不发起请求。

#### 贡献的标识、顺序与错误处理

- `id` 必填，在本插件的同一插槽中唯一，版本间应保持稳定。
- `label` 用于错误提示，默认取 `title`，其次取 `id`。
- `order` 默认 `100`，`priority` 默认 `0`。
- `keyed` 必须填写 `match`，例如 WebQQ 的 markdown 元素是 `'14'`。

`chain` 组件不修改内容时返回 `next`，修改时包装或替换它；出错的层会被跳过。普通贡献有独立的错误边界和重试入口。组件返回 `null` 时，外框也不显示。插槽未声明、声明方或贡献方没运行时，贡献不会显示。

Dashboard 已为 `dashboard.cards` 开启卡片管理：点击 Dashboard 插件卡片的齿轮，即可调整卡片顺序、显示开关或恢复默认。点击保存后写入实例的界面偏好并立即生效，取消不保存；这些操作只影响显示，不改变贡献插件的运行状态。自己的插槽如何提供这一入口，见下一节。

#### WebQQ 提供的数据

WebQQ 插槽的 props 使用以下专用数据结构，不是后端 `Session`：

| 类型 | 内容 |
|---|---|
| `WebQQChat` | `chatType`：`1` 私聊、`2` 群、`100` 临时会话；`peerId` 是好友或群 ID，另有 `name` |
| `WebQQMessage` | `msgId`、`msgSeq`、`chatType`、`peerId`、`senderUin`、`senderName`、`time`、`text`、`self`；`time` 的单位是秒 |
| `WebQQElement` | 保留原始 `elementType` 及对应的 NT 字段 |

### 声明自己的插槽

希望其他插件扩展自己的页面时，使用 `<插件>.<位置>` 命名插槽，向 `SlotMap` 合并类型，并在页面中用 `Slot` 渲染：

```tsx
import { Slot, type WebUIContext } from '@luckylillia/plugin-sdk/webui'

interface Item { id: string; title: string }

declare module '@luckylillia/plugin-sdk/webui' {
  interface SlotMap {
    'my-plugin.item.actions': { props: { item: Item }; options: {} }
  }
}

function ItemPage() {
  const item = { id: 'demo', title: '示例条目' }
  return <div>
    <span>{item.title}</span>
    <Slot name="my-plugin.item.actions" props={{ item }} />
  </div>
}

export default function apply(ctx: WebUIContext) {
  ctx.declareSlot('my-plugin.item.actions', {
    title: '条目按钮', description: '每个条目旁的按钮', cardinality: 'list',
  })
  ctx.page({ id: 'items', title: '条目', component: ItemPage })
}
```

`Slot` 的显示选项：

- `children`：提供默认内容。
- `wrap(element, { id, plugin, options })`：绘制每项贡献的外框；`chain` 不使用 `wrap`。
- `match`：渲染 `keyed` 插槽时指定当前键。
- `props`：传给贡献组件的数据。`chain` 的 props 类型包含 `next: unknown`，但渲染 `Slot` 时不必传入 `next`。

`useSlotMatches(name)` 列出 `keyed` 插槽当前有贡献的键。每项贡献使用来源插件的前端上下文，并有独立的错误边界。

声明 `list` 插槽时，可以设置 `configurable: true`。宿主会在**声明者的插件配置弹窗**中提供该插槽的排序、显示开关和恢复默认；保存后立即生效，不改变插件运行状态。未开启该选项的插槽没有逐项管理入口。

### 后端接口与鉴权

前端需要读取业务数据或执行操作时，在后端注入 `webuiServer`，用带 `fetch` 方法的对象注册 HTTP 接口：

```ts
import { Context } from '@luckylillia/plugin-sdk'

export const inject = ['webuiServer']

export function apply(ctx: Context) {
  ctx.webuiServer.route('/api/my-plugin', {
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname !== '/api/my-plugin/stats' || request.method !== 'GET') {
        return Response.json({ success: false, message: 'not found' }, { status: 404 })
      }
      return Response.json({ success: true, data: { count: 42 } })
    },
  })
}
```

处理函数接收完整 URL。使用 Hono 时应设置 `basePath('/api/my-plugin')`，或通过 `route(prefix, app)` 匹配完整路径。路由随插件卸载，也可调用注册时返回的函数提前移除。

`/api/` 下的接口自动受 WebUI 登录保护。提供 webhook 时，用 `{ public: true }` 挂到 `/api/` **之外**，例如 `/my-plugin/webhook`；签名、密钥和业务授权由插件检查。

在 React 组件中调用 `usePluginContext()`，即可使用以下前端 API 访问后端：

| API | 用途 |
|---|---|
| `ctx.api<T>(path, { method?, body? })` | 携带 WebUI 登录，返回响应 `{ success, data }` 中的 `data` |
| `ctx.fetch(path, init?)` | 携带登录的原始 `fetch`，用于二进制、上传、流和自定义错误 |
| `ctx.authUrl(path)` | 为图片、视频、下载等不能设置请求头的位置生成带鉴权 URL |
| `ctx.events(path, listeners)` | 订阅 SSE，按事件名回调，返回关闭函数 |
| `ctx.toast(message, type?)` | 显示 `success`、`error` 或 `warning` 提示，默认 `success` |
| `ctx.pageHref(id, options?)` | 生成本插件页面的 URL |

路由自己返回的 `401` 或 `403` 会传给调用方；只有 WebUI 的鉴权拒绝才触发登录流程。组件创建的订阅应在 `useEffect` 的清理函数中关闭，模块卸载时也会关闭 SDK 登记的 SSE。

### 打包、样式和文件边界

#### 共享依赖与构建

宿主通过 import map 提供 `react`、`react/jsx-runtime`、`react-dom` 和 `@luckylillia/plugin-sdk/webui`。打包时四者必须设为 `external`，避免混入另一份 React 导致 Hook 错误；其他依赖可以打包：

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'webui',
    lib: { entry: 'client/index.tsx', formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'react-dom', '@luckylillia/plugin-sdk/webui'],
    },
  },
})
```

TSX 工程还需要 React 类型和 JSX 编译配置，例如 `jsx: 'react-jsx'`。前后端可以使用独立的 `tsconfig`。简单模块可以使用 `createElement` 免构建；需要代码拆分时可用 `React.lazy`，宿主已提供 `Suspense`。

`llbot.webui` 入口所在的**整个目录及子目录**都会提供给已登录 WebUI 的浏览器。前端产物独立放在 `webui` 中，不与后端代码、数据、密钥混放。

#### 样式与资源清理

可复用宿主的语义 class：`card`、`btn-primary`、`btn-glass`、`input-field`、`switch-toggle`、`text-theme`、`text-theme-secondary`、`text-theme-muted`、`text-theme-hint`。颜色可用 `var(--accent)` 等主题变量。宿主 Tailwind 不扫描插件源码，不保证任意工具类存在；其他布局使用 `style` 或局部 CSS。

只在自身页面和已声明的插槽中绘制，不修改宿主 DOM 或注入全局样式。弹层可 portal 到 `body`，但需完整清理。优先复用 `useBots()` 和 `usePlugins()`；自有轮询通常不快于 5 秒，多组件共享数据时共用请求。

前端入口允许返回清理函数。重载时会撤销旧注册并重新导入，无需刷新页面；入口抛错时，本次注册回滚。渲染错误只影响对应区域，并在插件卡片中显示，用户可重试。模块导入失败时，配置弹窗回退到自动表单。

#### 在宿主中验证

至少检查启用后的自动加载、配置保存、后端未运行时的设置页、错误提示、停用和热重载。无需登录 QQ 的宿主验证方法见 [WebUI 管理面](plugin-system.md#webui-管理面)。

## 开发与测试

日常开发先编译并热重载，自动化测试验证消息和业务逻辑；平台实际权限、额度和上传结果仍需连接平台验证。

### 开发

`--plugin-dir <目录>` 在默认 `data/plugins` 外增加扫描目录，可指定多次。`--plugin-hmr` 开热重载，也可在实例 `plugins.json` 顶层设 `hmr: true`；否则手动点卡片重载。

源码 Bot 的 tsx 可加载 .ts；发布版 Bot 使用已构建 JS。推荐开发和发布共用 lib 入口并开 tsc watch，也可添加 development 条件：

```json
{
  "main": "lib/index.js",
  "exports": {
    ".": { "development": "./src/index.ts", "default": "./lib/index.js" },
    "./package.json": "./package.json"
  }
}
```

源码 Bot 优先加载存在的 development 源码，发布版使用 JS。development 不代替发布构建。

仓库 npm run dev 排除 data、examples 和同级 LuckyLillia.Plugins，其它目录插件被 tsx 加载后可能触发整个进程重启。直接调用 tsx 时将排除参数放在入口前：

```sh
npx tsx watch --exclude "./data/**" --exclude "/path/to/plugins/**" src/main/main.ts --plugin-dir /path/to/plugins --plugin-hmr
```

重载会重新导入插件包及子模块，清理旧挂载资源。频繁 ESM 重载会累积模块缓存，开发进程应适时重启。仅改展示元数据通常重新扫描即可，行为变化需要重载。

#### 在仓库外开发

可以直接使用 npm 上的 SDK 和脚手架，无需克隆 Bot 仓库：

```sh
npx -p @luckylillia/plugin-sdk luckylillia-plugin create my-plugin
cd my-plugin
npm install
npm run build
npm test
```

需要联调尚未发布的 SDK 源码时，先在 Bot 仓库运行 `npm run build:sdk`，再将插件的 `devDependencies.@luckylillia/plugin-sdk` 改为 `file:<Bot仓库>/packages/plugin-sdk` 并重新安装依赖。将 `<Bot仓库>` 替换为实际路径，含空格时给参数加引号。保留 `peerDependencies` 中的 SDK 兼容版本；file 路径仅用于本地开发依赖。

### 测试

`@luckylillia/plugin-sdk/testing` 使用宿主的消息、Session、指令、HTTP、默认降级逻辑和只记录发送结果的假 Bot。适合验证消息匹配、参数、元素、平台分支和数据分区。下面的完整测试对应[带配置和指令的示例](#带配置和指令的示例)。

#### 完整测试文件

保存为插件的 `test/index.test.ts`：

```ts
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createTestApp, type TestApp } from '@luckylillia/plugin-sdk/testing'
import * as plugin from '../src/index.js'

let app: TestApp

beforeEach(async () => {
  app = await createTestApp()
  await app.ctx.plugin(plugin, { greeting: '早上好' })
})

afterEach(() => app.dispose())

it('解析指令参数并使用配置', async () => {
  const bot = app.bot()
  expect(await bot.receive('/hello 小明')).toEqual(['早上好，小明！'])
  expect(await bot.receive('没有匹配的消息')).toEqual([])
})

it('发送原生 markdown 或默认降级内容', async () => {
  const official = app.bot({ platform: 'qq', features: ['message.markdown'] })
  const plain = app.bot()
  expect(await official.receive('ping')).toEqual(['<markdown>**pong**</markdown>'])
  expect(await plain.receive('ping')).toEqual(['<p><b>pong</b></p>'])
})
```

运行 `npm test`。以下测试工具和用例可继续加到这个文件中。

#### 测试工具

| API | 用途 |
|---|---|
| `await createTestApp()` | 带 bots/commands/http/timer 的 Context 和临时存储 |
| `await app.ctx.plugin(plugin, config)` | 挂载被测插件 |
| `app.bot({ platform?, selfId?, features?, internal? })` | 注册假 Bot，默认 test:bot |
| `bot.receive(content, options?)` | 模拟消息，等待处理完成并返回期间发送的元素标记 |
| `bot.sent` | 全部发送记录，含 channelId/content |
| `bot.emit(type, data?)` | 模拟成员、按钮等其它事件 |
| `app.commands` | 可修改 prefixes/bare/owners |
| `app.dataDir` | 临时数据目录 |
| `await app.dispose()` | 清理测试环境和临时数据 |

receive 支持 userId/name/guildId/channelId/event，未给 `guildId` 是私聊，给了为群聊。一个 app 里每个 `sid` 必须唯一；创建多个相同平台 Bot 时指定不同 `selfId`。

以下用例可以追加到起步测试文件：

```ts
it('群内 @ 不影响 ping 匹配', async () => {
  const bot = app.bot({ platform: 'qq', selfId: '100001', features: ['message.markdown'] })
  expect(await bot.receive('<at id="100001"/> ping', {
    guildId: 'group-openid', userId: 'user-openid',
  })).toEqual(['<markdown>**pong**</markdown>'])
})
```

测试 internal 调用时传入 vi.fn(async (...) => ...) 等 mock。权限测试可通过 event.member.roles 补充角色，或给测试 Bot 增加所需可选方法。

#### 异步问答

不能先 await 完发起 prompt 的 receive，再发送回答。先保留 Promise，等待问题发出后提交下一条消息。下面可追加到起步测试文件，并从 vitest 导入 vi：

```ts
it('等待同一用户回答', async () => {
  app.ctx.on('bot/message', async (session, next) => {
    if (session.stripped.content !== '开始问答') return next()
    await session.send('答案是什么？')
    const answer = await session.prompt(1000)
    await session.send(answer ?? '超时')
  })
  const bot = app.bot()
  const conversation = bot.receive('开始问答')
  await vi.waitFor(() => expect(bot.sent.length).toBe(1))
  await bot.receive('42')
  await conversation
  expect(bot.sent.map(message => message.content)).toEqual(['答案是什么？', '42'])
})
```

#### 测试边界

工具不提供真实登录、上传、平台连接、平台额度、数据库或 WebUI。依赖数据库/AI/自定义服务时，按目标挂临时真实服务或 mock。HTTP 默认真实出网，需隔离时使用 http/fetch-init、本地服务器或服务 mock。

测试环境没有完整 PluginService，不自动模拟清单扫描、插件信任、生效范围、WebUI 消息排序和市场安装。普通中间件可测试 `next`，宿主范围和排序需集成测试或实际 WebUI 验证。

bot.sent 是发送前改写及默认降级后的元素标记，不是最终平台上传载荷。声明 features 仅表示假 Bot 接受原生元素，不能证明真实平台权限或能力。

前端还应验证启用后的自动加载、保存、后端未运行时的设置页、错误提示、停用和热重载。无需登录 QQ 的完整宿主验证方法见 [WebUI 管理面](plugin-system.md#webui-管理面)。

## 打包与发布

先检查包清单和产物，再发布到 npm，并按需要登记到插件市场。

### 包结构

一个插件包同时包含清单、后端产物，以及可选的 WebUI 和介绍素材：

```text
my-plugin/
  package.json
  src/index.ts
  lib/index.js
  test/index.test.ts
  tsconfig.json
  vitest.config.ts
  client/index.tsx     可选：WebUI 源码
  webui/index.js       可选：WebUI 产物
  assets/icon.png      可选：图标和演示图片
  docs/details.md      可选：WebUI 介绍
```

#### 插件清单

在 `package.json` 中添加 `llbot` 字段，宿主才会将这个 npm 包识别为插件。下面是完整示例，未使用的字段可以省略：

```json
{
  "name": "luckylillia-plugin-my-plugin",
  "version": "0.1.0",
  "description": "问候和消息处理示例",
  "author": { "name": "作者", "url": "https://example.com" },
  "type": "module",
  "main": "lib/index.js",
  "files": ["lib", "webui", "assets", "docs"],
  "keywords": ["luckylillia-plugin"],
  "peerDependencies": { "@luckylillia/plugin-sdk": "^1.0.0" },
  "llbot": {
    "title": { "zh": "问候示例", "en": "Greeting example" },
    "description": "演示配置、指令和跨平台消息",
    "category": "chat",
    "icon": "assets/icon.png",
    "details": "docs/details.md",
    "screenshots": [{ "src": "assets/demo.png", "caption": "群聊中的效果" }],
    "preview": false,
    "hidden": false,
    "service": { "required": ["bots", "commands"] },
    "webui": "webui/index.js"
  }
}
```

填写时区分 npm 包信息和 `llbot` 的宿主约定：

- `name` 使用合法的 npm 包名。脚手架默认生成 `luckylillia-plugin-*`，也可使用 `lucky-lillia-aiprovider` 等名称或 npm scope。
- `main` 或 `exports["."]` 指向后端入口。ESM 的 `.js` 文件需要 `"type": "module"`。
- SDK 的 `peerDependencies` 用于兼容性检查。插件包依赖和服务依赖的声明见[依赖与提供的服务](#依赖与提供的服务)。
- `llbot.hidden` 从 WebUI 列表隐藏条目，`llbot.preview` 显示开发中标记，两者都不是权限设置。

#### 分类

`llbot.category` 决定安装后的插件在 WebUI「插件列表」中的分类：

| 值 | WebUI 分类 | 用途 |
|---|---|---|
| `protocol` | 协议端 | 登录平台、注册 Bot 的消息源 |
| `adapter` | 适配器 | 对外提供 OneBot、Satori、Milky 等协议 |
| `chat` | 消息互动 | 自动回复、复读、游戏 |
| `tool` | 工具 | 通知、黑名单、独立工具 |
| `service` | 依赖组件 | 为其它插件提供共享服务 |
| `other` | 其他 | 其它或未指定分类 |

分类按表中顺序显示。未知值记录警告并归入「其他」，插件仍可加载。

市场使用登记时选择并保存在目录中的 `category`，分类值和顺序与上表一致。统一插件列表支持分类筛选，卡片显示分类标签；旧目录未填写分类时归入「其他」。目录中的未知分类会使目录校验失败，建议登记选择与包内 `llbot.category` 保持一致。

#### 名字、作者、图标和详情

##### 名字与作者

`llbot.title` 是卡片、配置弹窗和详情中显示的名字，支持字符串或语言映射，WebUI 使用中文。未设置时取去掉插件前缀的包名。

`llbot.description` 可以直接填写字符串，例如 `"description": "自动回复消息"`，脚手架默认使用这种写法。需要多语言时，也支持 `{ "zh": "自动回复消息", "en": "Auto-reply to messages" }`。未填写时使用包顶层的 `description`。

包顶层的 `author` 支持 npm 的字符串 `名字 <邮箱> (https://主页)`，也支持对象 `{ name, email, url }`。作者显示在卡片元数据行和详情中，仅为 HTTP(S) URL 生成链接。

插件页使用「已安装」（默认）/「未安装」/「全部插件」切换统一列表，所有项共用同一种卡片及元数据行，依次显示分类、作者、npm 和仓库链接。已安装插件的仓库地址来自包顶层 `repository`，规范化为 HTTP(S) 网页地址；无法转换时隐藏链接。未安装项使用目录中的元数据，打开详情不另行请求市场。Info 紧挨 GitHub/仓库图标，与包链接成组，手机换行不拆开；操作行依次排列设置、重载和卸载按钮；同包多个实例分别显示卡片，配置直接对应各自条目。Info 始终提供，未安装或没有配置入口时隐藏齿轮。

##### 图标与详情素材

| 字段 | 支持的内容 | 显示方式 |
|---|---|---|
| `llbot.icon` | 支持的 lucide 图标名，或包内 `.png`、`.jpg`、`.jpeg`、`.gif`、`.webp`、`.svg` 图片 | 建议图片为正方形、至少 96px；裁切填满圆角方块，插件未运行时变灰 |
| `llbot.details` | 包内 Markdown 路径 | 在详情的「完整说明」中展示，默认折叠；Info 入口不依赖此字段 |
| `llbot.screenshots` | 路径或 `{ src, caption }` 组成的数组 | 在简介之后显示演示图片及其说明；图片可放大查看，Markdown 位于其后的「完整说明」中，默认折叠 |

详情 Markdown 支持标题、段落、列表、表格、代码、引用和图片，保留段落内换行，不执行 HTML。链接支持 HTTP(S) 和 `mailto`；图片支持相对 Markdown 的包内路径及 HTTP(S) URL。

统一插件卡片始终提供 Info，使用同一个详情弹框。未声明 `llbot.details` 和 `llbot.screenshots` 时，列表直接展示已有元数据，不发详情请求。主标题使用 `llbot.title`（未安装项使用目录的 `title`），与作者等信息固定在弹框顶部，不随正文滚动；其下依次显示 `description` 简介、截图。简介立即展示，不等待详情加载。插件列表读取已安装包中 `llbot.details` 指定的 Markdown（如 README），非空正文放在截图之后默认折叠的「完整说明」中，用户点击展开。若 Markdown 的第一个内容块是一级标题，详情中省略该块，避免在正文中重复显示主标题；后续标题、二级及以下标题和其他内容保留，源文件不变。本地详情读取失败时可重试。未安装项直接展示已有目录数据中的简介和截图，不额外请求详情或远端 README。点击演示图片或 Markdown 图片均可放大查看。

素材必须已经存在于包中，路径不能越界。文件缺失或类型错误会记录警告并忽略该项。发布时将素材目录加入 `files`。安装前的市场展示还有独立字段，见[市场图标和预览图](#市场图标和预览图)。

修改清单或图片后需要重新扫描；详情 Markdown 在下次打开详情时重新读取。图片经 `/plugin-assets/` 提供，需要 WebUI 登录。

##### 可用图标名

`llbot.icon` 可使用下列图标名；未知名字回退为拼图图标：

```text
bell              book            book-open       bot         brain       calendar    clock
cloud             code            cpu             database    dice-5      file-text   gamepad-2
gift              globe           hand            heart       image       info        languages
layout-dashboard  mail            message-square  messages-square  milk    music       network     puzzle
radio             repeat          scroll-text     search      send        settings    shield-ban
sliders           smartphone      smile           sparkles    star        store       terminal
timer             trophy          users           wrench      zap
```

### 构建

#### 后端

模板使用 `tsc`，将 `src` 编译到 `lib`。保持 `moduleResolution: Bundler`：当前 cordis 声明中有不带后缀的相对导入，`NodeNext` 可能造成类型解析不完整。

自己的相对导入仍写 `.js`，例如 `import { format } from './format.js'`。TypeScript 会定位到 `format.ts`，生成的 Node ESM 也能正常解析；`Bundler` 模式不会替产物补扩展名。

使用打包工具时，下列共享包及其子路径必须设为 `external`：

```text
@luckylillia/plugin-sdk
cordis
cosmokit
schemastery
@standard-schema/spec
@satorijs/element
@satorijs/protocol
```

宿主将这些导入统一解析到自身副本。打入另一份 `Context`、`Service` 或元素运行时会破坏注入和对象身份，也可能被宿主拒绝。其它第三方依赖可打包，或声明在 `dependencies` 中供安装器安装。

浏览器模块有另一组 `external`，见[打包、样式和文件边界](#打包样式和文件边界)。有独立前端构建时，将其命令加入插件的 `build` 脚本，避免只发布旧的 WebUI 产物。

#### 检查发布产物

在插件目录执行：

```sh
npm test
npm run build
npm pack --dry-run
```

检查打包列表，确认后端和前端入口存在，`files` 包含实际使用的 `lib`、`webui`、`assets`、`docs`，且没有带入用户数据或凭证。

发布前还应在干净目录验证完整产物，特别是 ESM 导入、动态模块、静态资源和浏览器子模块。开发机已经执行过依赖安装脚本，不代表市场安装后能直接运行；安装器的限制见[市场兼容性](#市场兼容性)。

### 发布

#### 发布到 npm 和插件市场

插件可作为 npm 包通过 `npm publish` 发布，公共 scoped 包需相应公开发布设置。模板里的 `luckylillia-plugin` keyword 可保留，但不是市场收录条件。

默认市场从 npm 包 `@luckylillia/market` 读取目录。要让插件出现在 Bot 的市场中：

1. 完成[产物检查](#检查发布产物)，将插件发布到 npm。
2. 到 [LuckyLillia.Market](https://github.com/LuckyLilliaDev/LuckyLillia.Market) 创建「注册插件」Issue，提交 npm 包名并选择插件分类。分类选项与上文 `llbot.category` 的六个值一致；目录按登记选择保存 `category`，自动更新版本时保留，建议与包内声明保持一致。登记检查会从发布包读取 `llbot`、标题、简介、作者和公开 GitHub 仓库地址。
3. 检查通过后生成登记 PR。维护者合并并发布目录包后，用户才能在 Bot 市场中搜索到插件。

目录的 `plugins.json` 统一保存展示信息和通过检查的精确版本，每个插件条目的 `version` 必须是完整版本号，不能填写 `latest` 或版本范围。Bot 不再读取旧的 `versions.json`。更新插件时也要推进目录版本；只发布新的 npm 版本不会让 Bot 提示更新。

用户在统一插件列表中组合安装状态、来源、关键词和分类筛选。分类标签显示当前筛选结果的各类数量，分类行的「全部」显示总数；修改搜索或筛选回到第一页，每页最多 12 项。分类筛选只影响浏览，不改变安装版本或依赖检查。

#### 市场图标和预览图

市场目录中的 `icon` 和 `screenshots` 用于安装前浏览，都是可选字段，接受包内图片相对路径或 HTTP(S) 地址。`screenshots` 的格式与 `llbot.screenshots` 相同，支持路径或 `{ src, caption }` 对象组成的数组。

登记时，`LuckyLillia.Market` 将 npm 发布版本的 `llbot.icon`、`llbot.screenshots` 路径原样保存到目录。作者需在 `package.json.llbot.icon` 和注册 Issue 的 icon 栏填写一致的图标信息。

使用包内图片时，目录只保存路径，不包含图片文件。Bot 按插件包名和目录的精确版本拼接 jsDelivr 地址，并对文件名各段编码，因此图片必须包含在对应 npm 版本的发布产物中。

没有图片时可以省略字段，也可填写 `icon: ""`、`screenshots: []`。图标缺省或加载失败时显示默认图标；旧目录的 `examples` URL 数组仍兼容。

未安装卡片的 Info 入口始终可用，没有截图也可查看介绍。弹框直接展示已加载目录中的元数据、简介和截图，打开时不再请求详情或 npm 清单，也不下载远端 README。图片仍按目录中记录的地址正常加载；包内图片使用目录指定的精确 npm 版本生成 jsDelivr URL，点击可放大查看。

#### 市场兼容性

##### 目录与版本

从市场目录安装时只用目录指定的精确版本，并校验 SDK 的 `peerDependencies`。目录版本需要更高 Bot 能力时会说明，不强行加载，也不回退 npm 历史版本。

从目录安装的插件和自动补装的插件依赖，都必须位于用户配置的市场目录中，且包内有 `llbot` 清单。只有 npm 下载地址不能绕过目录。安装期间使用同一份目录快照；界面提交的版本与刷新后的目录不一致时，需要刷新后重新操作。本地压缩包的主包不要求收录，见下面的「从本地压缩包安装」。

##### 插件包依赖

`llbot.dependencies` 使用完整 npm 包名和 semver 范围，声明要独立安装的插件。它只接受插件包名和版本范围，不接受 Git、文件路径、URL 或 npm 别名。具体填写方式见[声明插件包依赖](#声明插件包依赖)。

安装器先检查整棵插件依赖树，再安装缺少的包：

- 先复用已扫描到且版本兼容的插件包，包括本地开发的目录联接，并递归检查它们声明的依赖。
- 缺少的包必须能在配置的市场目录中按完整包名找到；目录指定的精确版本必须同时满足依赖范围和宿主 SDK。不会下载未收录版本或回退 npm 历史版本。
- 目录缺包、目录版本不满足依赖范围、已安装版本不匹配、循环依赖或版本要求冲突，都会中止安装。安装器不会为满足依赖自动替换已有插件。
- 插件依赖与消费者安装在插件根目录下的同一层，作为独立插件管理。新安装的条目保持停用，用户需要分别信任、启用和配置。

`peerDependencies` 保留 SDK 和插件 API 的兼容声明，本身不触发市场安装。普通 npm 库应写在包顶层 `dependencies`，不能用它代替 `llbot.dependencies`。

##### 普通 npm 依赖与安装脚本

| 声明 | 市场的处理方式 |
|---|---|
| `dependencies` | 安装到插件自己的依赖树 |
| `optionalDependencies` | 不适合当前系统或安装失败时可跳过 |
| `bundleDependencies` | 使用包内已有内容 |
| SDK、cordis 等共享包 | 使用宿主提供的副本，不安装第二份替代运行时 |

普通 npm 依赖只支持 npm 源版本和 npm 别名，不支持 Git、本地路径或任意 URL。用于本地开发的 `file:` 依赖不能变成发布包的运行时依赖。

市场不执行 `install`、`postinstall`。需要现场编译或通过脚本下载原生二进制的依赖，应调整为随包提供产物，或按平台提供预编译的 `optionalDependencies`。

##### 更新与卸载

只有目录版本高于已装版本且兼容时，市场才提供更新；本地开发链接不由市场更新。更新会替换整个插件包，并重载已启用的条目。

「插件」统一筛选栏可手动「检查更新」，也可勾选「只看可更新」；页面打开期间每 10 分钟检查，切回页面时补查过期结果。只有点击卡片上的「更新」才安装。更新请求同时锁定当前版本和目标版本，如果另一窗口已更新或目录版本已变化，会提示刷新后重试，避免覆盖或降级。

统一筛选栏依次排列安装、来源、状态和分类四行，使用相同的紧凑点击标签，左侧行名对齐。来源可选「全部 / 内置插件 / 第三方插件」，状态可选「全部 / 已启用 / 未启用 / 需要处理」；搜索框在整个筛选区底部，旁边是「只看可更新」。未安装模式隐藏状态行和更新筛选。进入页面默认显示已安装条目，无需等待目录网络；浏览未安装或全部插件时才加载完整市场目录，随后在本地统一筛选和分页。内置身份按宿主登记的官方包映射判断，与作者填写的分类无关。

已安装且有配置入口的条目直接在统一卡片中打开设置。停用的第三方插件也能配置，无需先启用；同包多个实例分别保留各自卡片，齿轮打开对应条目的配置。尚未安装或没有本地条目的包不显示设置入口。

Bot 随附的官方内置插件也有独立的 npm 包名和版本，参与同一套检查更新。它们更新后需要重启 Bot，界面显示已下载版本及当前运行版本；原有条目和配置保留，不能卸载或用本地压缩包覆盖。普通插件不应使用内置包的保留名称或声明 `llbot.builtin`。

插件从目录移除后，已安装的包会保留，卡片不再显示不在市场目录中的常规提示；兼容性问题、请求失败和更新未加载等实际错误仍保留。点击卸载会打开独立确认弹框，默认勾选「保留配置」；确认后删除插件文件并从已安装列表移除全部条目。保留时，重新安装会恢复各条目的配置和生效范围，全部保持停用，启用需重新信任；取消勾选则删除配置。两种选择都会清除信任、消息处理顺序和界面布局偏好，保留插件数据目录；取消弹框不发卸载请求。

#### 从本地压缩包安装

在 WebUI「插件」筛选栏右侧点击「本地安装」，直接在目录下方的上传区域选择或拖入电脑上的 ZIP、`.tgz` 或 `.tar.gz`，不需要切换标签。先构建插件，再用 `npm pack` 生成 npm 包（文件位于 `package/` 下），或把 `package.json`、构建产物和素材直接压成 ZIP；ZIP 顶层就是 `package.json`，不要再套一层文件夹。包内需有有效的 `name`、完整 `version`、`llbot` 和入口文件。

选择或拖入文件后，在同一弹框勾选信任确认，再点击「安装插件」上传；无需打开第二层确认框。本地包不受市场收录和目录版本限制，但仍检查 SDK 兼容性并按上述规则处理依赖；缺少的插件依赖只能从市场目录补装。没有待补装的插件依赖时，不需要访问市场目录。支持随包提供 `bundleDependencies`，不执行安装脚本。

同名包会替换市场管理目录里的旧版本，已启用的条目会尝试重载；开发目录和链接不被覆盖。新装插件默认停用，仍需在「已安装」中信任并启用。上传和解压都流式写入磁盘，不设固定的文件大小、解压总量或条目数上限；请确保 Bot 所在磁盘有足够空间容纳压缩包和解压后的文件。

#### 手动安装与脚手架

手动安装时，将完整插件包放进 Bot 的插件目录（默认 `data/plugins/`，以「本地安装」弹框显示的实际绝对路径为准），允许一层 npm scope 目录。包中需要清单、构建产物和运行时依赖，不能只复制入口源码。点击目录旁的「扫描」，成功后清空全部筛选并返回「已安装」，再启用新插件；目录查询和扫描均不依赖市场插件。

SDK 已发布，可在任意独立目录使用下面的命令创建插件：

```sh
npx -p @luckylillia/plugin-sdk luckylillia-plugin create my-plugin
cd my-plugin
npm install
npm test
```

## 排错

| 现象 | 检查方向 |
|---|---|
| npm 找不到 SDK | 使用仓库本地 SDK，或配置 file 开发依赖 |
| 缺 SDK/testing 导出 | 在 Bot 根目录 build:sdk，避免读取旧 lib |
| 测试找不到用例 | 保留插件 vitest.config.ts，避免继承父配置 |
| 插件扫描不到 | 检查目录、llbot、入口和构建产物 |
| 等待依赖 | 先核对 llbot.dependencies 的包是否已安装且版本匹配，再看 `inject`、required 和提供者状态；bots 存在不代表已有在线 Bot |
| 指令不响应 | 检查 commands、前缀、范围、前置中间件，以及统一的「指令」行顺序 |
| 官方群不匹配 | 检查订阅权限和 @，使用 `stripped.content` |
| 跨 Bot 数据混用 | 身份键应包含 `sid`，避免只用 userId/selfId |
| 发送失败 | 检查状态、权限、媒体、`referrer` 和主动额度 |
| 配置保存无效 | 查看校验、运行失败；自定义页是否真正 save |
| 密钥留空仍存在 | 留空保留，使用清空并保存 |
| 页面或插槽不显示 | 入口路径、运行状态、声明、id/match、模块错误 |
| hooks 报错 | React/SDK 是否正确 external |
| 插件样式缺失 | 宿主不扫描插件 Tailwind，改用语义 class 或局部 CSS |
| 停用仍有任务 | 检查定时器、连接和在途请求的 disposer |
| 改插件重启整个 Bot | tsx 是否排除了插件目录 |
| 本机运行、市场安装失败 | files、依赖、安装脚本、静态资源是否齐全 |

## 示例与参考

- [SDK 导出](../packages/plugin-sdk/src/index.ts)、[消息类型](../packages/plugin-sdk/src/universal.ts)、[指令](../packages/plugin-sdk/src/commands.ts)、[WebUI](../packages/plugin-sdk/src/webui.ts)、[测试类型](../packages/plugin-sdk/src/testing.ts)
- [最小可运行插件](#最小可运行插件)、[带配置和指令的示例](#带配置和指令的示例)：完整源码与开发流程
- [WebUI 扩展](#扩展-webui)：自定义配置界面、页面、字段与插槽
- [echo 测试夹具](../test/fixtures/plugins/echo/src/index.ts)、[hello 测试夹具](../test/fixtures/plugins/hello/src/index.ts)：消息中间件、定时器与热重载验证
- [AI 插件文档](ai-plugins.md)：共享 AI 服务和消费者

加载、作用域、路由等宿主细节见 [插件系统](plugin-system.md)。普通插件通过 SDK 使用能力，不直接导入 Bot 仓库内部实现。
