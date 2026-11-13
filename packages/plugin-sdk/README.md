# @luckylillia/plugin-sdk

编写 [LuckyLillia Bot](https://github.com/LuckyLilliaDev/LuckyLilliaBot) 插件用的 SDK。插件就是一个 [cordis](https://github.com/cordiverse/cordis) 插件，跑在 Bot 进程里。

```sh
npm install -D @luckylillia/plugin-sdk
```

`cordis`、`schemastery`、`@satorijs/element` 和 `@satorijs/protocol` 已声明为 SDK 的 `peerDependencies`，npm 7 及以上默认会自动安装，无需逐个列出。插件运行时，Bot 会将这些共享依赖统一解析到宿主使用的同一份运行时。

## 最小插件

`package.json`：有 `llbot` 字段的包才会被当成插件。

```json
{
  "name": "luckylillia-plugin-hello",
  "version": "1.0.0",
  "type": "module",
  "main": "lib/index.js",
  "peerDependencies": { "@luckylillia/plugin-sdk": "^1.0.0" },
  "llbot": { "description": "打个招呼", "icon": "hand" }
}
```

`src/index.ts`：

```ts
import { Context, Schema } from '@luckylillia/plugin-sdk'

export const name = 'hello'
export const inject = ['timer']

export interface Config {
  text: string
}

// WebUI 会按这个 schema 自动生成配置表单
export const Config: Schema<Config> = Schema.object({
  text: Schema.string().default('hello').description('打印内容'),
})

export function apply(ctx: Context, config: Config) {
  ctx.interval(() => ctx.logger('hello').info(config.text), 60_000)
}
```

`llbot.description` 可以直接填写字符串；需要多语言时，也支持 `{ "zh": "打个招呼", "en": "Say hello" }`。

打开 WebUI「插件」的「本地安装」，将构建产物放进弹框显示的实际插件目录（默认 `data/plugins/<目录名>/`），点击目录旁的「扫描」，再到「已安装」中启用。目录下方始终显示上传区域，可直接选择或拖入 ZIP、`npm pack` 生成的 `.tgz`，无需切换标签。上传或扫描成功后会清空筛选并返回「已安装」；目录显示和扫描不依赖市场插件。

## 插件详情

插件页使用「已安装」（默认）/「未安装」/「全部插件」切换统一列表，所有项共用同一种卡片；安装、来源、状态和分类使用四行相同的紧凑点击标签，左侧行名对齐，搜索框与「只看可更新」位于筛选区底部。已安装条目立即显示；浏览未安装或全部插件时才读取完整市场目录。卡片元数据依次显示分类、作者、npm 和仓库链接，Info 紧挨 GitHub/仓库图标，与包链接成组，手机换行不拆开；操作行依次排列设置、重载和卸载按钮；同包多实例分别保留卡片。已安装插件的仓库链接来自 `package.json` 顶层 `repository`，转换为 HTTP(S) 网页地址，无法转换时隐藏。

在 `llbot.details` 填写包内 Markdown 路径（如 `README.md`），在 `llbot.screenshots` 填写图片路径或 `{ src, caption }` 数组，并把这些文件包含在 npm 发布产物中。统一插件卡片始终提供 Info，使用同一个详情弹框；未声明详情和截图时，列表直接展示已有元数据，不发详情请求。主标题使用 `llbot.title`（未安装项使用目录的 `title`），与作者等信息固定在弹框顶部，不随正文滚动；其下依次展示简介、截图。简介立即显示，不等待详情加载。插件列表读取已安装包的 Markdown，放在截图之后默认折叠的「完整说明」中，用户可展开阅读，读取失败可重试。若 Markdown 的第一个内容块是一级标题，详情中省略该块，避免重复显示主标题；后续标题和其他内容保留，源文件不变。未安装项直接使用已有目录数据，不额外请求详情或远端 README。图片按其地址正常加载，可点击放大。

开发插件页扩展时，`@luckylillia/plugin-sdk/webui` 的 `PluginsViewProps.showDetails(source)` 可打开宿主详情弹框；`PluginDetailsSource` 提供包名、标题等元数据及截图，可选的 `load()` 返回 `{ markdown?, base, screenshots }`。不提供加载函数时直接展示已有数据；提供时由宿主统一处理加载和重试，图片展示同样由宿主负责。

`@luckylillia/plugin-sdk/webui` 的 `PluginMetaRow` 可复用同一元数据行：传入 `title` 及可选的 `category`、`author`、`packageName`、`repository`，通过 `children` 添加紧跟包/仓库链接的内容，例如 Info 按钮。组件只展示已有数据，不发起请求。

卸载确认弹框默认勾选「保留配置」。保留时，重新安装会恢复各条目的配置和生效范围，插件保持停用，启用时需重新信任；取消勾选则删除配置。卸载后条目从已安装列表移除，插件数据目录始终保留。

目录扩展使用 `plugins.catalog`：组件不绘制界面，按 `loadCatalog` 加载目录，通过 `onChange(PluginCatalogState)` 提供元数据和安装、更新、卸载动作，卸载时回传 `null`；筛选和卡片由宿主统一绘制。卸载动作为 `uninstall(name, options?: { keepConfig?: boolean })`，宿主显式传入是否保留配置，省略时按 `false` 处理。`plugins.install` 在「本地安装」弹框提供上传控件，成功后调用 `onInstalled()`。`plugins.views` 仍可提供独立工具视图，以筛选栏按钮打开并返回统一列表。

## 收发消息

事件和消息走平台无关的 Satori 模型，`inject: ['bots']` 后：

```ts
ctx.on('bot/message', async (session, next) => {
  if (session.content !== 'ping') return next()
  await session.reply('pong')
})
```

`bot/message` 是中间件链（不调 `next()` 就拦下这条消息），其它事件走 `bot/event`，发送前可以用 `bot/before-send` 改写。完整说明见仓库内 `docs/plugin-authoring.md`。

NTQQ 账号的 `session.platform` / `bot.platform` 是 `ntqq`，`bot.sid` 是 `ntqq:<QQ号>`；QQ 官方机器人使用 `qq`。调用 NTQQ 专属接口时可用 `internalOf(session.bot, 'ntqq')` 获得 `NTQQInternal` 类型。

## 必须遵守的几条

- **构建时把 `@luckylillia/plugin-sdk`、`cordis`、`schemastery`、`@satorijs/*` 标为 external。** Bot 在加载插件时会把这些包统一解析到自己那一份；如果打进了插件产物，插件里的 `Service` / `Context` 和 Bot 的不是同一个，加载会被拒绝。
- **清理逻辑交给 cordis 托管**：用 `ctx.on()`、`ctx.interval()`、`ctx.effect(() => dispose)` 注册的东西会在插件停用 / 重载时自动撤销。不要依赖 `apply` 的返回值做清理 —— `function apply() {}` 这种函数声明在 cordis 里会被当成构造函数调用，返回值会被丢弃。
- **登录后才可用的能力用 `inject` 声明**，没就绪时插件会停在等待状态，WebUI 会显示在等哪个服务。
