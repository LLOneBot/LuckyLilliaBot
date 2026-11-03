# AI 网关和 AICheck（外部插件）

两个都是 `examples/plugins/` 下的外部插件，不是内置插件。和别的示例不同，它们要发布给用户，所以是正式的包：`npm run build`（tsc）编译到 `lib/`（gitignore），入口是 `lib/index.js`；`exports` 的 `development` 条件指向 `src/index.ts`，用 Bot 源码跑（`--plugin-dir examples/plugins`）时宿主直接加载源码，不用先编译（见 [plugin-authoring.md](plugin-authoring.md)"开发"）。发布见文末。

## AI 网关（`examples/plugins/ai-gateway`，包名 `luckylillia-plugin-ai-gateway`）

依赖组件（`category: service`），提供服务 `ai`（`llbot.service.labels` 写的是「AI 网关」，等它的插件卡片上就说"要等 AI 网关"）。用户在它的设置里添加 AI，别的插件选用。

### 设置

`ais` 是 AI 列表，每个 AI：

| 字段 | 说明 |
|---|---|
| `name` | 名称，别的插件按它选；改名后引用它的插件就找不到了（报 `config`） |
| `baseUrl` | OpenAI 兼容接口的地址，**填到版本号为止**，网关自己拼 `/chat/completions`。必须 `http://` 或 `https://` 开头：表单当场校验，`api.openai.com/v1` 这种存不进去；手改 `plugins.json` 写错的，调用时报 `config` |
| `apiKey` | 以 `Authorization: Bearer` 发；留空就不带这个头。存过之后 Bot 不再把它发给 WebUI，表单里是掩码（`role('secret')`，见 plugin-system.md"内置插件的设置"） |
| `model` | 默认模型，调用方可以换 |
| `vision` | 能看图。只是个标记，给选 AI 的人看，网关不拦 |
| `proxy` | 走代理，默认开，见下文"代理" |
| `timeout` | 毫秒，默认 120 秒：等完整回答最多多久；流式回答是两段之间最多等多久，回答写几分钟也不会被掐断 |
| `headers` / `body` | 额外的请求头 / 请求体字段（比如 `enable_thinking: false`），调用方传的 `body` 再盖在上面 |

`default` 是默认 AI 的名称，留空或找不到就用列表第一个。

**地址按 OpenAI SDK 的 `baseURL` 约定**（`https://api.openai.com/v1`），各家文档给 OpenAI SDK 的地址就是这种：OpenAI `https://api.openai.com/v1`、DeepSeek `https://api.deepseek.com/v1`、智谱 `https://open.bigmodel.cn/api/paas/v4`、豆包 `https://ark.cn-beijing.volces.com/api/v3`、通义千问 `https://dashscope.aliyuncs.com/compatible-mode/v1`、Kimi `https://api.moonshot.cn/v1`、Gemini `https://generativelanguage.googleapis.com/v1beta/openai`。填了带 `/chat/completions` 的完整地址也认（`baseUrlOf()` 去掉）。koishi 那边的 aicheck 曾因为"在 baseUrl 后面拼 `/v1/chat/completions`"拼错了智谱 / 豆包 / Gemini，改成要求完整地址；这里不拼版本号，只拼路径，没有那个问题，而且同一个地址还能给 `request()` 打 `/models`、`/content_provenance_checks` 这些别的接口。

**Key 放在别的头里的**（Azure 的 `api-key`）：`apiKey` 留空，把头写进 `headers`。

**改设置不重启**：`apply` 里监听 `internal/update` 只换掉设置（`builtin:commands` 也是这么做的），服务对象不变，用它的插件不会跟着重启。

**代理**：网关经 `ctx.http` 发请求，所以内置的「代理」插件（`builtin:proxy`，见 [plugin-system.md](plugin-system.md)"HTTP 和代理"）填了地址就经它连，没填或停用了就直连；本机和内网的地址（本地跑的 Ollama 等）总是直连。每个 AI 的 `proxy`（走代理）开关默认开，关掉就是这个 AI 的请求带 `proxyAgent: ''`：国内能直连的（DeepSeek 等）可以关掉，免得绕远路。网关测试页上走代理的 AI 标着"走代理"。

### 网关替调用方处理的

- **推理模型的参数**：OpenAI 的推理模型（o 系列、GPT-5）只接受默认的 `temperature`，也不认 `max_tokens`，回 400 并在 `error.param` 里指名。网关见到这种 400 就去掉那个字段（`temperature` / `top_p` / `presence_penalty` / `frequency_penalty`），或把 `max_tokens` 改成 `max_completion_tokens`，再发一次（最多改两回）。调用方照常传 `temperature` / `maxTokens`
- **重试一次**：5xx（500 / 502 / 503 / 504）或连接被断开（`ECONNRESET` / `EPIPE` / `UND_ERR_SOCKET`）时，隔 1 秒再发一次对话请求。超时不重试（等待会翻倍）；`request()` 不重试（打的接口未必能重复调用）
- **思考过程**：本地 Ollama 等会把思考写在回答开头的 `<think>…</think>` 里。`chat()` 的 `text` 去掉这一段，放进 `reasoning`（DeepSeek 等单独给的 `reasoning_content` 也放这里）；`stream()` 不吐这一段，标签被拆在几段里也认得
- **流式**：超时按两段之间算；不支持流式、一次回完 JSON 的服务，`stream()` 把整个回答当一段给出
- **统计**：一次调用算一次（重试和改参数不另算）；调用方自己取消的不算失败

不用代理插件、想让整个进程都走代理的话：Node 的 `fetch` 默认不理 `HTTPS_PROXY`，实测（Node v24.13.0，2026-11-01）再加 `NODE_USE_ENV_PROXY=1` 才走代理（代理收到 `CONNECT`），而且这样连登录签名、QQ 图片也一起走代理了，一般别这么用。

### 给别的插件用

```ts
import type {} from 'luckylillia-plugin-ai-gateway'   // ctx.ai 的类型；只引类型，不引代码

export const inject = ['ai']
export const Config = Schema.object({
  ai: Schema.string().role('ai').default('').description('用哪个 AI，留空用 AI 网关的默认'),
})

export function apply(ctx: Context, config: Config) {
  ctx.command('问 <question:text>', '问 AI').action(async (_, question) => {
    const { text } = await ctx.ai.chat(question, { ai: config.ai })
    return h.text(text)
  })
}
```

- 类型在 `src/types.ts`，编译成 `lib/types.d.ts`；网关 `package.json` 的 `types` 和 `exports` 的 `types` 条件都指向它，所以 `import type` 只看到类型，不会把网关的实现拉进调用方的类型检查。调用方把网关写进 `peerDependencies`（插件市场不装 peer，用户要另外装网关，调用方的说明里写一句）。本仓库里靠根 `tsconfig.json` 的 `paths` 把包名映射到 `src/types.ts`（只用于类型，`import type` 编译后就没了）
- `ctx.ai`：`list()` / `get(name?)` / `chat(input, options)` / `stream(input, options)`（异步迭代，一段段给回答）/ `request(ai, path, init)`（打这个 AI 的其他接口，Key 和头都带上）。`chat` 的 `input` 是字符串就当一条用户消息，返回 `{ text, ai, model, usage, finishReason, reasoning, raw }`：`raw` 是服务商的完整回答，工具调用、拒答这些 `text` 里没有的从这里取
- 图片用 `{ type: 'image', data }` 传字节，网关转成 data URL（类型从字节里认）。**别传 QQ 的图片链接**：会过期，还防盗链，模型服务端多半拉不到（koishi aicheck 实测的结论）
- 出错一律抛 `AiError`，按 `kind` 分：`config`（没这个 AI / 一个都没配 / 地址不是 http(s)）、`auth`（401 / 403）、`quota`（余额或额度用完：402，或 429 / 403 说的是余额，比如 OpenAI 的 `insufficient_quota`、Kimi 的 `exceeded_current_quota_error`、智谱的"欠费"、硅基流动的 "balance is insufficient"；每分钟额度用完的 429 仍是 `rate-limit`）、`rate-limit`（429）、`request`（其他 4xx，比如模型名不对）、`server`（5xx）、`network`（连不上）、`timeout`、`response`（回答读不懂）；HTTP 的还有 `status`，`code` 是服务商自己的错误码（`context_length_exceeded` 等；`network` 时是连接的错误码，如 `ECONNREFUSED`）。插件不 import 网关的代码，所以别用 `instanceof`，看 `kind`。调用方自己的 `signal` 取消时抛它自己的 reason
- 配置字段写 `.role('ai')`，WebUI 里就是一个下拉框，列出网关的 AI（带模型名，能看图的标出来），空值是"默认"。这个控件是网关的 WebUI 模块注册的（`ctx.field('ai', ...)`），第三方插件的界面要批准后才加载（插件卡片上的「批准界面」，或者它的配置弹框里）；没批准、或网关没运行时就是普通输入框

### WebUI

`webui/index.js`（不用构建的 ES 模块）：

- 设置页（`settings: true`，插件卡片的齿轮也打开它）：`SchemaSettings` 的表单，下面是每个 AI 的「测试」（发一句"只回复两个字母：OK"，显示耗时和回答，失败时显示原因和中文说明）。测试用的是**保存过的**设置
- `ai` 字段控件，见上；下拉用 SDK 的 `SelectInput`，不用 `<select>`（展开的列表是系统样式）
- 后端路由 `/api/ai-gateway`：`GET /ais`（AI 列表 + 进程内的调用次数、失败次数、最近一次失败，重启清零）、`POST /test { ai }`

### 测试

`test/unit/examples/aiGateway.test.ts`：本地起一个假的 OpenAI 兼容服务（`test/unit/examples/fakeAi.ts`），覆盖按名称 / 默认选 AI、模型和额外字段、地址去尾、图片转 data URL、流式、各类失败和计数、空 Key 不带 `Authorization`、`request()`、改设置不重启、WebUI 路由；流式按两段之间超时、`chat()` 回到一半停住也算超时、要流式却一次回完、地址不是 http(s)、调用方取消不算失败、推理模型拒收的参数、5xx 和断连重试一次、思考过程、余额和限流分开。假服务的 `FakeAnswer` 能控制事件间隔（`interval`）、不结束流（`hold`）和直接断开连接（`drop`）。注意 `fetch` 拒绝连一些低端口（端口 1 报 `bad port`），模拟连不上要用一个刚释放的端口。

## AICheck（`examples/plugins/aicheck`，包名 `luckylillia-plugin-aicheck`）

对着图片回复「ai吗」，或「ai吗」后面直接带图，查图片是不是 AI 生成的。移植自 `D:\code\QQRobot\koishi\koishi-lyc-bot\external\aicheck`（那边的 `docs/plugin-aicheck.md` 有完整的调研和踩坑）。依赖 `bots`、`ai` 和 `http`。

### 只用云端（owner 2026-11-01）

原插件四条路线，这里只留两条，都经 AI 网关：

1. **OpenAI 水印检测**（`provenance`，默认关）：`POST {baseUrl}/content_provenance_checks`（multipart，字段 `file`），经 `ctx.ai.request()`，所以选的 AI 必须是 OpenAI 官方地址和 Key，中转对这个接口回 404。只认 OpenAI 自家的图（它打的 C2PA 凭据和 SynthID 水印），结论确定。国内直连会被墙，要开「代理」插件，并让这个 AI 走代理（默认就走）
2. **看图判断**（`vision`，默认开，用网关的默认 AI）：让能看图的模型按取证要点（手指、文字、边缘、光影、纹理、透视、细小配件）看，输出 `{"verdict","confidence","reasons"}`，`temperature: 0`。只是推测，按图片计费。选国内直连的（DeepSeek 等）更稳，别和水印检测撞同一堵墙

去掉的：
- **本地 C2PA 解析**：owner 决定全靠云端识别。原插件那份零依赖的 JUMBF / CBOR 解析在 koishi 仓库里，要用再搬
- **synthid.com 浏览器核验**：要常驻 Chrome 加 puppeteer、登录 Google 账号，而且那个站的条款明文禁止拿前端当自动化接口；原插件也默认关

### 触发和取图

- 用 `bot/message` 中间件，**不用指令系统**：指令名后面必须是空白或结尾，「ai吗」后面直接跟图（`ai吗<img .../>`）匹配不上
- 只看消息自己的顶层 `text` 元素（`@` 在前面不影响，引用的那条消息里的字不算），去掉首尾空白、转小写后 `startsWith` 触发词
- 先取消息自己的图，没有再取引用的那条（`quote` 元素的 children）。都没有就交给后面的插件（以触发词开头的消息不一定是给它的）
- 冷却按会话（`平台:channelId`），冷却中也交给后面的插件

### 回复

- 引用**图片所在的那条**：自己带图就引用自己，引用别人的图就引用那条（`quote` 的 `id`）
- 一种结论一句话：水印检出「图片是 ChatGPT 制作。」；看图「<模型> 判断：疑似 AI 生成（置信度 85%）」加最多 3 条理由（模型没给 JSON 时是原文前 200 字）；都查完没结论「没看出 AI 制作的痕迹。」
- 水印检测失败就退到看图；看图也失败（或没开）时报原因，两个都失败报水印检测的：`rate-limit`「检测请求过于频繁…」、`quota`「AI 服务的余额或额度用完了。」、`auth`「API Key 无效或没有权限。」（OpenAI 对区域封锁回 403，也落在这）、`network` / `timeout`「连不上检测服务…」、`config`「AI 网关里没有设置好要用的 AI。」，其他「检测失败…」
- 用 `h.text` 发，模型回答里的 `<` 不会被当成元素

### 图片

用 `ctx.http.file()` 下载一次给两条检测共用（点名直连 `proxyAgent: ''`：Bot 本来就直连 QQ 的图片服务器，经国外的代理只会更慢；30 秒超时，20 MB 上限，也认 `data:` URL）。QQ 有的图回 `application/octet-stream`，`file()` 这时按文件头认类型，认不出的当 PNG。

### 插件页的展示

`package.json` 里写了名字（`llbot.title`「AI 图片检测」）、作者、图标 `assets/icon.svg`、详情 `docs/details.md` 和两张演示图（写法见 [plugin-authoring.md](plugin-authoring.md)"名字、作者、图标和详情"）：

- `assets/demo.jpg`：WebQQ 群聊里对着图回复「ai吗」，Bot 引用原图回答。不登录 QQ 拍的：照 [plugin-system.md](plugin-system.md) 的端到端方法用 Playwright 改 `/api/plugins`（`builtin:webqq` 算运行中）、mock `/api/webqq/*`（自己、群、成员、三条消息），头像和图片的外部请求全拦下来，图是 canvas 画的晚霞；回答的文字照 `formatVision()` 的格式写
- `assets/settings.jpg`：配置弹框里的表单。临时实例里给网关配两个假的 AI（只存设置，不会请求），批准网关的界面，`ai` 字段才是带 AI 列表的下拉
- 界面或回复格式改了要重拍。看效果：把这个目录放进 Bot 的 `data/plugins/`（开发时用目录联接，`New-Item -ItemType Junction`，扫描认得），插件页点「重新扫描」

### 测试

`test/unit/examples/aicheck.test.ts`：同一个假服务加一张图，覆盖水印检出（multipart、Key、检出后不再看图）、引用别人的图 + `@` 在前 + 大写触发词、模型不给 JSON 时的原文和转义、没结论、各类失败、水印失败退到看图、没图交给后面、按会话冷却、图片下载失败。

## 发布

两个包都还没发布（2026-11-02）。在插件目录 `npm publish` 即可：`prepack` 先编译（AICheck 的会先编译网关，它要用网关的类型），包里是 `lib/`、`src/`（给 `development` 入口）、AICheck 的 `assets/` 和 `docs/`（图标、详情、演示图）和网关的 `webui/`。用户在插件市场按关键词 `luckylillia-plugin` 搜到；装 AICheck 不会顺带装网关（市场不装 peer）。

- **相对 import 带 `.js` 后缀**（`./gateway.js`）：tsc 的 `Bundler` 解析不补后缀，编译出的 `import './gateway'` 在 Node 里找不到。tsx、vitest 和根 `tsconfig.json` 都认 `.js` 指向 `.ts`
- AICheck 的 `tsconfig.json` 用 `paths` 把网关的包名指到 `../ai-gateway/lib/types.d.ts`：指向源码会超出 `rootDir`
- 编译产物要在不经 tsx 的 Node 里跑过一次：2026-11-02 用 SDK 打好的测试工具（`packages/plugin-sdk/lib/testing.js`）挂上两个 `lib/index.js`，对着假的 OpenAI 服务跑通了对话（含去掉 `<think>`）和 AICheck 的看图回复
