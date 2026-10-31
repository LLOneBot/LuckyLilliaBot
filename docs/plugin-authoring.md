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
    "category": "chat",                 // 插件页的分类，见下面的表；不写或写错都归"其他"
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

`category` 决定插件在 WebUI 插件页的哪个分类里（按下表的顺序排，类型是 SDK 的 `PluginCategory`）：

| 值 | 插件页显示 | 放什么 |
|---|---|---|
| `protocol` | 协议端 | 登录账号、把一个平台连进来的（注册 `ctx.bots` 的 bot），比如 NTQQ 协议、QQ 官方机器人 |
| `adapter` | 适配器 | 让外部框架通过某个机器人协议接入，比如 OneBot 11、Satori、Milky |
| `chat` | 消息互动 | 收到消息后做出回应：自动回复、复读、小游戏 |
| `tool` | 工具 | 为自己启用的功能：WebQQ、通知、黑名单 |
| `service` | 依赖组件 | 给其他插件提供服务（`service.implements`），比如数据库、渲染 |
| `other` | 其他 | 不属于以上的 |

不认识的值扫描时会给一条警告，插件照常加载、归到"其他"。

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
| `string().role('host')` | 监听地址：本机地址下拉，或手填 |
| `.role('xxx')`，且有插件用 `ctx.field('xxx', ...)` 注册了控件 | 那个控件（见"扩展 WebUI"；`ms` / `table` / `radio` / `checkbox` / `secret` / `slider` / `textarea` / `host` 不能被覆盖） |
| 其它（`any`、`is(...)`、无法判断的 union） | JSON 编辑框 |

`.hidden()` 的字段不显示（值照样保存、照样生效，只能改 `plugins.json`）；`.deprecated()` / `.experimental()` 会显示成小标签。`role('secret')` 的字段已经存过值时，表单里是掩码，旁边有「清空」：直接留空或原样提交都是保留原值，点了「清空」再保存才删掉。

`llbot.icon` 目前支持：`bell` `book` `book-open` `bot` `brain` `calendar` `clock` `cloud` `code` `cpu` `database` `dice-5` `file-text` `gamepad-2` `gift` `globe` `hand` `heart` `image` `info` `languages` `layout-dashboard` `mail` `message-square` `milk` `music` `network` `puzzle` `radio` `repeat` `search` `send` `settings` `shield-ban` `sliders` `smartphone` `smile` `sparkles` `star` `terminal` `timer` `trophy` `users` `wrench` `zap`，其它名字显示为拼图图标。

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
  - `labels`：提供的服务对用户来说是什么，如 `{ "account": "NTQQ 账号登录" }`。在等这个服务的插件，卡片和顶部提示就说"等待：NTQQ 账号登录""要等 NTQQ 账号登录后才会运行"；没写时说"要等「你的插件」就绪"

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

`Session` 常用字段：`type`、`userId`、`channelId`、`guildId`（私聊为空）、`messageId`、`isDirect`、`content`（元素标记字符串）、`elements`（解析后的元素，取 @ 可以用 `h.select(session.elements, 'at')`）、`event`（原始 Satori 事件，snake_case），以及 `send()` / `reply()`（引用回复）。两者都带上事件的 `referrer`（Satori 的被动回复信息）：QQ 官方机器人只能被动回复，靠它回复触发的那条消息；自己调 `bot.sendMessage()` 时可以传 `{ referrer: session.event.referrer }` 达到同样效果。

`ctx.bots` 里是已登录的账号（`Bot`）。`sendMessage` 一定有，其它能力（`deleteMessage`、`getGuild`、`getGuildMember`、`muteGuildMember`、`kickGuildMember`、`handleGuildMemberRequest`、`createReaction`……）按平台支持情况提供，用之前先判断 `if (bot.muteGuildMember)`。这些可选方法和 Satori 的 API 同名、参数顺序也一样（好友、群、成员、角色、消息列表、表态……，见 SDK 的 `Bot`）。QQ 账号的 `platform` 是 `luckylillia`（外部 Satori 客户端看到的是 `llonebot`，由 Satori 适配器换），私聊的 channelId 形如 `private:<QQ号>`，群的 channelId 就是群号。

### 跨平台写法

同一份插件要在 QQ 账号（NTQQ）和 QQ 官方机器人上都能用，按下面写。

**按指令匹配用 `session.stripped.content`**：它去掉了开头的引用、对机器人的 @ 和后面的空白（`atSelf` 说有没有 @ 它）。官方机器人在群里只收得到 @ 它的消息，直接用 `session.content` 会多一个 `<at>`。

**Satori 标准元素**（文本、`at`、`quote`、`img`、`audio`、`video`、`file`、`p`、`br`、`message forward`……）照常用。另外有四种扩展元素，任何 bot 都能发：平台原生支持的照原样发，不支持的在发送前换成下表的降级内容，插件不用分平台写：

| 元素 | 写法 | 原生支持 | 发不了时 |
|---|---|---|---|
| markdown | `h('markdown', {}, '# 标题\n**粗体**')` | 官方机器人 | 去掉标记的文字：粗体、链接、代码、图片照样是元素，列表写成"• "、引用写成"｜" |
| 按钮 | `h('button', { text: '/sign' }, '签到')`，一行用 `h('button-group', {}, [...])` 包起来 | 官方机器人 | 一行字：指令按钮写成"签到（发送「/sign」）"，文字和指令相同时写成"「签到」"；跳转按钮写成链接；回调按钮丢掉 |
| 卡片 | `h('card', { title, url, desc, image, prompt })` | 官方机器人：群聊、单聊发成 markdown（加粗的标题链接、描述、图片，ark 要申请），频道是 ark | 标题带链接、描述、图片 |
| QQ 表情 | `h('face', { id: '13', name: '呲牙' })` | QQ 账号、官方频道 | `[呲牙]`，没写 `name` 是 `[表情]` |

- 按钮分三种：没写 `type`（或 `input`）是**指令按钮**，点了就发出 `text`（默认是按钮上的字）；`type: 'link'` + `href` 是跳转按钮；`type: 'action'` + `id` 是回调按钮，点了不发消息，只来一个 `interaction/button` 事件（`session.event.button.id`）。要两边都能用就写指令按钮：降级后用户照着发，插件当普通消息处理，一份代码
- `bot.features` 说这个 bot 原生能发什么：`message.markdown` / `message.button` / `message.card` / `message.face` 对应上表；另外 `message.forward`（合并转发）、`message.stream`（`<markdown stream>` 流式回复）、`message.proactive`（没有消息可回复时也能发，官方机器人基本不行）只是告诉你，不会替你降级。想"能发按钮就发按钮，不能就换个说法"时看它：`if (session.bot.features.includes('message.button'))`
- 流式回复：对同一条消息多次发 `h('markdown', { stream: true }, '一段')`，官方机器人在单聊里把它们接成一个气泡，最后一片写 `{ stream: 'end' }`；不写也行，最后一片发出 10 秒后自动结束，只是这 10 秒里气泡上挂着"生成中"的点。群里平台没有流式，各片先攒着，结束时合成一条发出（攒着的那几次 `send()` 返回的结果没有 `id`）。要用 `session.send()` / `session.reply()` 发：它们带着事件的 `referrer`，官方机器人据此回复触发它的那条消息，同一频道里几段回复同时进行也不会串。没有 `message.stream` 的 bot（QQ 账号）每片就是一条普通 markdown 消息
- 降级可以自己做：`bot/fallback` 事件对每个发不了的 markdown / 卡片 / 表情和每一行按钮各问一次，返回要发的内容就用它（原样发出，不再降级），什么都不返回就用上面的默认降级，返回 `''` 是丢掉。最先返回内容的监听者生效。比如装了 puppeteer 时把 markdown 渲染成图片：

```ts
// puppeteer 在时才挂上，它没了自动撤掉
ctx.inject(['puppeteer'], (ctx) => {
  ctx.on('bot/fallback', async (bot, channelId, element) => {
    if (element.type !== 'markdown') return
    const source = element.attrs.content ?? element.children.map(child => child.attrs.content ?? '').join('')
    // 插件自己的渲染：markdown 转成 HTML 再截图，得到 PNG 的 Buffer
    const png = await renderMarkdown(ctx, source)
    return h.image(png, 'image/png')
  })
})
```

- 降级在 `bot/before-send` 之后做，`before-send` 里加进去的扩展元素也会降级。只管插件经 `bot.sendMessage` / `session.send()` 发的消息，OneBot、Milky、Satori 客户端发的不经过这里
- 收到的消息也是这套元素：官方机器人收到的 QQ 表情是 `face`（带 `name`），QQ 账号在群里收到别的官方机器人发的 markdown、按钮也解成 `markdown`、`button`，卡片是带一行文字（`[分享]标题` 这种）的 `luckylillia:ark`
- 只属于一个平台的元素带平台名前缀：官方机器人的 `qq:ark24`、`qq:markdown` 等（见下面），QQ 账号的 `luckylillia:market-face`（商城表情）、`luckylillia:ark`（原样的卡片 JSON）。别的平台不认识它们，只会发出它们的子元素（比如商城表情里的图片）

QQ 官方机器人（`platform` 是 `qq`，`selfId` 是 AppID，见 [official-qq-bot.md](official-qq-bot.md)）有几处不同：

- 用户、群都是 openid，没有 QQ 号；私聊 channelId 是 `private:<openid>`
- 群里一般只收得到 @ 它的消息，这些消息开头是 `<at id="<AppID>"/>`。按前缀匹配指令时用 `session.stripped.content`（`examples/plugins/echo` 就是这么做的）
- 回复收到的消息不占额度：群在消息发出 5 分钟内最多回 5 条，私聊 60 分钟内最多 4 条。`session.send()` / `reply()` 会自动挂到会话里最近能回复的消息上；没有能回复的（过了时限、用完次数，或者是定时推送）就作为主动消息发。主动消息每个用户或群每月 4 条，要用户开着「允许主动发送」、群主允许机器人主动发言，否则发不出去。所以能回复时就回复，一次回复也别拆成太多条
- markdown、按钮、卡片原生就能发（见上面"跨平台写法"）；另有 `qq:ark24`、`qq:markdown`（模板）、`qq:rawmarkdown` 等平台元素，写法同 Koishi 的 adapter-qq-crack（列表见 official-qq-bot.md §6）。别的平台不认识这些 `qq:` 元素，只会发出里面的文字
- 频道（QQ 频道）是另一个 bot：`platform` 是 `qqguild`，订阅了频道事件才有
- 入群申请是 `guild-member-request` 事件，用 `bot.handleGuildMemberRequest(session.messageId, true)` 同意
- 中立层没有的平台接口在 `bot.internal` 上（如 `bot.internal.getGroupMemberBlacklist(groupId)`），名字同 Koishi；平台的原始事件以 `internal` 事件出现在 `bot/event`：`session.event._type` 是 `qq/<事件名>`，`session.event._data` 是原始数据

### 平台独有的接口：`bot.internal`

Satori 没有的接口在 `bot.internal` 上，各平台不同，用之前先看 `bot.platform`：

- **QQ 账号**（`luckylillia`）：OneBot 11 的全部 action（含 go-cqhttp 和 LLOneBot 的扩展），和 OneBot 适配器用的是同一份代码，OneBot 适配器没开也能用。名字改成驼峰（`set_group_card` 是 `setGroupCard`，`_send_group_notice` 是 `sendGroupNotice`），参数是一个对象，字段同 OneBot 文档；返回 action 的 `data`，失败时抛出它的错误。要 `message_id` 的地方可以直接传 `session.messageId`；返回值里的 `message_id` 仍是 OneBot 的数字
- **QQ 官方机器人**（`qq` / `qqguild`）：开放平台的 REST 接口，方法名同 Koishi，参数按顺序传（见上面）

```ts
if (session.platform === 'luckylillia') {
  await session.bot.internal!.setGroupCard({ group_id: session.guildId, user_id: session.userId, card: '新名片' })
  await session.bot.internal!.setEssenceMsg({ message_id: session.messageId })
}
```

QQ 账号只有经 `internal` 才有的（Satori 没有对应方法的 75 个 action）：

| 类别 | action |
|---|---|
| 消息 | 戳一戳 `send_poke` / `group_poke` / `friend_poke`，转发单条 `forward_group_single_msg` / `forward_friend_single_msg`，读合并转发 `get_forward_msg`，`mark_msg_as_read`，`set_input_status`，`set_group_msg_mask`，`ocr_image`，`voice_msg_to_text`，表情 `get_recommend_face` / `fetch_custom_face`，AI 语音 `get_ai_characters` / `send_group_ai_record` |
| 群管理 | `set_group_card`，`set_group_special_title`，`set_group_portrait`，`set_group_remark`，`batch_delete_group_member`，`get_group_shut_list`，`get_group_at_all_remain`，`get_group_honor_info`，`get_group_system_msg`，`get_group_ignore_add_request`，打卡 `send_group_sign` / `get_group_signed_list` |
| 群公告、精华 | `_send_group_notice` / `_get_group_notice` / `_delete_group_notice` / `_get_group_notice_acklist`，`set_essence_msg` / `delete_essence_msg` / `get_essence_msg_list` |
| 群文件 | `upload_group_file`，`delete_group_file`，`move_group_file`，`rename_group_file`，`set_group_file_forever`，`create_group_file_folder`，`delete_group_folder`，`rename_group_file_folder`，`get_group_root_files`，`get_group_files_by_folder`，`get_group_file_url`，`get_group_file_system_info` |
| 群相册 | `get_group_album_list`，`create_group_album`，`delete_group_album`，`upload_group_album`，`get_group_album_media_list` |
| 好友和自己 | 点赞 `send_like`，`get_profile_like` / `get_profile_like_me` / `get_profile_like_count`，`set_friend_remark`，`set_friend_category`，`get_friends_with_category`，可疑好友申请 `get_doubt_friends_add_request` / `set_doubt_friends_add_request`，`set_qq_profile`，`set_qq_avatar` / `get_qq_avatar`，`set_online_status` |
| 私聊文件、闪传 | `upload_private_file`，`get_private_file_url`，`get_flash_file_info`，`download_flash_file`，`get_flash_file_download_urls`，`upload_flash_file`，`reshare_flash_file` |
| 其它 | `get_cookies`，`get_csrf_token`，`get_credentials`，`scan_qrcode` |

另外 Satori 已有对应的 29 个（发消息、撤回、群和成员信息、踢人、禁言……）和 OneBot 协议自己的辅助接口（版本、状态、缓存、配置等）也都在 `internal` 里；只有 OneBot 连接专用的 `.handle_quick_operation`、`get_event` 不在。能用 Satori 方法的就别用 `internal`：Satori 方法在官方机器人上也能用。

一条消息在某个中间件里抛错，会让这条消息的整条链中止（错误会记日志）。

## 扩展 WebUI

只要配置界面的插件什么都不用做：导出 schemastery 的 `Config` 就有自动表单。想往 WebUI 里加别的，有这些挂载点。WebUI 自己的页面也是这样挂上去的：Dashboard、日志都是内置插件，插件页、其他配置是 WebUI 这个核心插件的页面，侧边栏里没有写死的条目。

| 挂载点 | 注册 | 什么时候出现 |
|---|---|---|
| 侧边栏页面 | `ctx.page({ id, title, icon, component, order, header? })`；`header` 是画在页面上方标题区的组件（桌面端，Dashboard 的标题就在那） | 插件启用时；还没运行（在等依赖、出错）时页面换成原因，告诉用户该去启用或登录什么，`header` 不画 |
| 侧边栏设置页 | `ctx.page({ ..., settings: true })` | 插件启用时，没运行也照常显示，上方提示原因（在等哪个插件、出错）；停用后侧边栏不显示，但插件卡片的"配置"仍能打开，顶部提示设置暂不生效 |
| 插槽：WebUI 或别的插件声明、留给插件的位置（见下面"插槽"） | `ctx.slot('dashboard.cards', { id, component, ... })` | 插件运行时 |
| 自己的界面里留位置给别的插件 | `ctx.declareSlot(name, { title, cardinality })`，在界面里渲染 `<Slot name={name} />` | 声明它的插件运行、那块界面在屏幕上时 |
| 配置界面，替换自动表单 | `ctx.config(Editor)` | 一直可用，插件停用时也能配置 |
| 某个 role 的表单控件 | `ctx.field('color', Field)` | 所有插件的自动表单里 `.role('color')` 的字段 |

第三方插件的这些，都要用户在插件页**批准**它的界面后才会生效，用户还能隐藏、重排其中的每一项，见后面的"批准、隐藏和排序"。

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
  ctx.slot('dashboard.cards', { id: 'today', title: '今日统计', icon: 'trophy', component: StatsCard })
}
```

- 类型在 `@luckylillia/plugin-sdk/webui`：`WebUIContext`、`SlotMap`、`ConfigEditorProps`、`FieldProps` 等
- 同一个模块还提供运行时的值（WebUI 经 import map 交给插件）：
  - `usePluginStatus()`：本插件条目的状态（`disabled` / `state` / `error` / `notice` 等），跟着插件列表更新
  - `usePluginConfig()`：本插件的配置，`{ value, setValue, schema, errors, save(), saving, clearSecret() }`；`save()` 经 bot 按 Config 校验后保存、插件按新配置重启，结果用 toast 提示，被别处改过时会重新载入。自己画设置页时用它读写配置
  - `SchemaForm`：WebUI 按 schema 生成的表单（`fields` 只要其中几个顶层字段），`ctx.field()` 注册的控件照样生效
  - `SchemaSettings`：一整页设置，插件标题和说明、生成的表单、保存按钮；`links`（标题旁的链接）、`sections`（把几个顶层字段放进可折叠的分组）、`children`（表单下面的内容，函数形式拿到正在编辑的配置）。只要 schema 表单的设置页：`ctx.page({ id: 'settings', title: '设置', component: SchemaSettings, settings: true })`
  - `HostInput`：监听地址输入，跟 `role('host')` 同一个控件
  - `usePlugins()`：WebUI 列出的全部插件条目；`useBots()`：所有在线 / 不在线的账号（`/api/bots`，平台、selfId、状态），5 秒更新一次
  - `usePageView()`：当前页面是不是单独全屏打开的（`fullscreen`）；`useSidebar()`：收起 / 展开 WebUI 的侧边栏
  - `StatusNotice`：`shell.notices` 插槽里的一行，`action` 是按钮文字，`page` 是按钮打开的本插件页面 id（停在那一页时这一行不显示）
  - `Slot`：在自己的界面里渲染自己声明的插槽，见下面"插槽"；`useSlotMatches(name)`：keyed 插槽现在有贡献的键
  - `Icon`：按 lucide 名字画 `llbot.icon` 列表里的图标（`<Icon name="trophy" size={16} />`），不打包的插件也能用
- 内置插件的界面也只用这些（`src/plugin/internal/*/*/client/`，见 [plugin-system.md](plugin-system.md)"内置插件的界面"），可以照着写
- 组件里用 `usePluginContext()` 拿到同一个 ctx：`ctx.api(path, { method, body })` 带着 WebUI 登录调 Bot 的接口，返回 `{ success, data }` 里的 `data`；`ctx.fetch(path, init)` 是带登录的原始 `fetch()`（上传、二进制、要看错误响应时用）；两者只在 WebUI 的登录本身被拒时才弹密码框，自己的接口回 401 / 403 会原样到你手里；`ctx.authUrl(path)` 给路径加上登录参数，给 `<img>` / `<video>` / 下载链接这些发不了请求头的地方用；`ctx.events(path, { 事件名: data => {} })` 订阅 SSE（返回关闭函数，组件卸载时调它；插件的模块被卸载时还开着的会一起关掉）；`ctx.toast()`；`ctx.pageHref(id, { fullscreen })` 是本插件某个页面的地址，`fullscreen` 时不带侧边栏和标题（可以 `window.open()` 到新窗口）
- 页面的 tab id 是 `<包名>:<id>`，地址栏 `#<包名>:<id>` 能直接打开
- `order` 和内置的页面一起排：Dashboard 0、NTQQ 协议 5、OneBot 11 / Satori / Milky / 邮件通知 / QQ 官方机器人 10 ~ 14、日志 20、其他配置 30、插件 40、WebQQ 50、关于 1000；不填是 100。地址栏没有指定页面时打开排第一的
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

**文件服务**：`llbot.webui` 所在的目录（含子目录）整个经 `/plugin-webui/...` 提供，需要 WebUI 登录，用户没批准它的界面时回 403。把前端产物放在单独的目录里，不要和后端代码放在同一层。

**出错**：每个插件组件外面都有错误边界，抛错只影响它自己那一块，可以点"重试"；出错的贡献、页面和配置界面会列在插件页的"界面"和插件卡片上。模块导入失败时，配置弹窗会提示原因并退回自动表单。默认导出的函数抛错时，它抛错前注册的东西会全部撤掉（和 Bot 端插件的 `apply` 一样，要么都在、要么都不在），插件页的"界面"里显示原因。

**自定义配置界面**：`ctx.config(Editor)` 的组件收到 `{ value, onChange, schema, defaults, errors }`。`value` 是填好默认值的完整配置，改了就调 `onChange`。保存按钮、保存时按 schema 校验、只存改动过的字段，仍由 WebUI 和 Bot 负责；校验不过时，错误按路径（`a.b`，根是 `''`）放进 `errors` 传回来。所以自己画界面时也建议照样导出 `Config`。

### 插槽

插槽是界面上留给插件的位置，由那块界面的主人声明：WebUI 的、Dashboard 和 WebQQ 这些内置插件的，加上第三方插件声明的。**插件只能往声明过的插槽里放东西**，不改别处；能不能替换、包装别人的内容，看插槽的基数：

| 基数 | 显示什么 | 贡献的哪个字段起作用 |
|---|---|---|
| `list` | 每个都显示 | `order`，小的在前 |
| `single` | 只显示一个，没有贡献时显示插槽自己的内容 | `priority`，大的胜出 |
| `keyed` | 按键各显示一个：插槽问一个键（`Slot` 的 `match`），在 `match` 相同的贡献里取 `priority` 最大的，没有就显示插槽自己的 | `match`、`priority` |
| `chain` | 一层包一层：排在前面的在最外层，每个组件多拿到一个 `next`（里面已经画好的内容），可以原样返回、包一层、或者换掉 | `order` |

| 插槽 | 基数 | 组件的 props | 选项 | 外框 |
|---|---|---|---|---|
| `shell.notices` | list | 无 | 无 | 顶部提示栏里的行：用 `StatusNotice` 画，没事要说就返回 null，全都不说话时整栏消失 |
| `settings.sections` | list | 无 | `title`（必填） | 设置弹框（侧边栏的齿轮）里的一节，WebUI 画标题；放这个浏览器的偏好 |
| `plugins.toolbar` | list | 无 | 无 | 插件页顶部「重新扫描」旁边的按钮 |
| `plugins.card.actions` | list | `{ plugin }`（这张卡的条目） | 无 | 插件页每张卡片上的按钮，排在卡片自己的前面 |
| `dashboard.cards` | list | 无 | `title`、`icon`（lucide 名，同 `llbot.icon` 的列表）、`size`：`normal` 约一行的三分之一（默认）/ `wide` 三分之二 / `full` 整行 | Dashboard 画卡片、图标和标题，组件只画卡片里面；一行剩下的空间由这一行的卡片按比例分掉，所以返回 null 的卡片不会留下空洞。Dashboard 自己的三张卡也在这里，用户同样能隐藏、挪动 |
| `dashboard.header` | single | 无 | 无 | 替换 Dashboard 顶上的"Dashboard / 欢迎使用 Lucky Lillia Bot" |
| `webqq.chat.actions` | list | `{ chat: { chatType, peerId, name } }` | 无 | WebQQ 聊天窗口顶栏右边的按钮 |
| `webqq.message.element` | keyed | `{ element, message? }`：NTQQ 原样的消息元素、这条消息（引用里的预览没有） | 无 | 键是元素类型 `String(elementType)`，比如 markdown 是 `'14'`：换掉 WebQQ 对这种元素的画法，或者画出 WebQQ 不会画的。只有这种元素的消息也会显示出来 |
| `webqq.message.bubble` | chain | `{ message, next }` | 无 | 包在每条消息的气泡外面 |

插件页是用户管住插件的地方，只开放追加的插槽（上面两个 `plugins.*`），没有可以替换或包装的。

```js
ctx.slot('dashboard.cards', { id: 'today', title: '今日统计', icon: 'trophy', size: 'wide', component: StatsCard })
```

- `id`：同一个插件在同一个插槽里唯一，**版本之间不要改**：用户的隐藏和排序按 `<包名>|<插槽>|<id>` 记。没有 `id` 或者重复，`ctx.slot()` 直接抛错
- `label`：插件页"界面"里怎么叫它，不填用 `title`，再没有用 `id`
- `order`：list / chain 插槽里从小到大排（默认 100，内置插件的在 10 左右）；用户在插件页调过顺序，就按用户的
- `priority`：single / keyed 插槽里大的那个显示（默认 0）；用户把它隐藏了就轮到下一个，都没有了显示插槽自己的内容
- `match`：keyed 插槽里这个贡献画哪个键，没写的永远不显示（插件页会标出来）
- chain 的组件一定要用到 `next`：不打算改的就 `return next`；出错时这一层被跳过，直接显示 `next`
- 组件返回 null 时，WebUI 画的外框（卡片、设置的那一节）跟着不显示
- 放进一个没人声明的插槽的东西不会显示，插件页"界面"把它列在"找不到位置的内容"里（声明它的插件没装、没启用，或者界面没批准）
- 每个贡献有自己的错误边界：抛错只坏它自己那一格，外框还在，里面显示原因和"重试"；插件页的"界面"和这个插件的卡片上也会列出来，直到点"重试"或者插件重载

**声明自己的插槽**：自己的界面里有别的插件能加东西的地方，就声明一个，名字是 `<插件>.<位置>` 的点路径，比如 `my-plugin.item.actions`（名字已被声明会抛错）。在那个位置渲染 SDK 的 `Slot`：每个贡献带着它自己插件的 ctx，各自一个错误边界，用户隐藏和排序照样生效。

```tsx
import { Slot } from '@luckylillia/plugin-sdk/webui'

// 让声明方和往里放东西的插件都拿到 props 的类型
declare module '@luckylillia/plugin-sdk/webui' {
  interface SlotMap {
    'my-plugin.item.actions': { props: { item: Item }; options: {} }
  }
}

ctx.declareSlot('my-plugin.item.actions', { title: '条目按钮', description: '每个条目右边的按钮', cardinality: 'list' })

// 组件里
<Slot name="my-plugin.item.actions" props={{ item }} />
```

`Slot` 的 `wrap(element, { id, plugin, options })` 给每个贡献画外框（错误边界在外框里面，chain 没有外框），`children` 是插槽自己的内容：没有贡献时显示（single / keyed，或者 list 空着时），chain 里在最里层；keyed 插槽再给 `match`。chain 插槽在 `SlotMap` 的 props 里写上 `next: unknown`，渲染 `Slot` 时不用传它。往一个插槽里放东西前想知道它的键有没有人画，用 `useSlotMatches(name)`。

`examples/plugins/webui-demo` 每种都有一个：Dashboard 卡片（list）、WebQQ 聊天栏按钮（list）、markdown 元素的原文（keyed，`match: '14'`）、折叠长消息（chain）、自己卡片上的"打开示例页"（`plugins.card.actions`）。

### 批准、隐藏和排序

插件页的"界面"一栏让用户看到插件往 WebUI 里加了什么、加在哪，并且管得住：

- **批准**：第三方插件的 WebUI 模块要用户批准后才加载，它在 `/plugin-webui/` 下的文件在批准前回 403。插件的后端启用时就在跑了，批准管的是"它能不能动我的 WebUI"：批准后它的界面代码以 WebUI 的登录运行，能调 Bot 的接口。没批准时插件卡片和配置弹窗上有"批准界面"，配置弹窗先用通用表单；撤销批准后，它注册的一切马上撤掉。内置插件不用批准
- **隐藏**：每个插槽贡献、每个侧边栏页面都能关掉。页面关掉只是不在侧边栏里列出，插件卡片上的"前往设置"照样打得开
- **排序**：list / chain 插槽里上移 / 下移，"恢复默认顺序"回到插件自己的 `order`
- 插件页和其他配置这两个核心页面不能隐藏：要改回什么都得靠它们
- 这些存在实例的 `plugins.json` 的 `ui` 里（`approved` / `hidden` / `order`），所有浏览器都一样

### 约定

- 只在插槽和自己的页面里画：不往 `document` 加全局样式，不改 WebUI 自己的 DOM。弹层用 portal 挂到 `document.body` 可以（WebQQ 就这样）
- 外框由插槽的主人画：往 `dashboard.cards` 放的组件不要再套 `card`，往 `settings.sections` 放的不要再写一遍标题
- 数据走 SDK 和自己的接口：账号用 `useBots()`，插件状态用 `usePluginStatus()` / `usePlugins()`，其余调自己挂的后端接口（`ctx.api()`）。轮询不要快于 5 秒，几个组件读同一份数据时共用一个轮询（NTQQ 的两张 Dashboard 卡片共用 `/api/ntqq/stats` 的一个轮询）
- 样式见上面的"样式"：用 WebUI 的语义 class 和 CSS 变量，暗色主题才跟得上

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
