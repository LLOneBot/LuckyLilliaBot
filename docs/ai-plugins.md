# AI 服务和 aiimgdetector（外部插件）

两个都是独立的外部插件，均位于与 Bot 仓库同级的 `LuckyLillia.Plugins/`：AI 服务 `aiprovider` 在 `lucky-lillia-aiprovider/`，AI 图片检测 `aiimgdetector` 在 `lucky-lillia-plugin-aiimgdetector/`。相对 Bot 仓库根目录的路径分别是 `../LuckyLillia.Plugins/lucky-lillia-aiprovider` 和 `../LuckyLillia.Plugins/lucky-lillia-plugin-aiimgdetector`。

两个包均通过 `npm run build`（tsc）编译到 `lib/`（gitignore），入口是 `lib/index.js`；`exports` 的 `development` 条件指向 `src/index.ts`。用 Bot 源码跑时，传入 `--plugin-dir ../LuckyLillia.Plugins` 可以同时扫描两个插件，宿主直接加载源码（见 [plugin-authoring.md](plugin-authoring.md)"开发"）。发布见文末。

## AI 服务（`../LuckyLillia.Plugins/lucky-lillia-aiprovider`，包名 `lucky-lillia-aiprovider`）

模块名和日志名为 `aiprovider`，WebUI 标题保持「AI 服务」。依赖组件（`category: service`），提供服务 `ai`（`llbot.service.labels` 写的是「AI 服务」，等它的插件卡片上就说"要等 AI 服务"）。它集中管理多个服务的接口地址、Key 和模型列表；调用它的插件分别选择服务与模型。

### 设置

主页面用列表编辑服务配置草稿。点击「添加服务」或某个服务的「编辑」，在弹窗里配置地址、Key、模型及其他参数，直接测试当前输入，再点「确定」把修改应用到列表。服务卡片可以删除或「设为默认」，默认服务显示标记；这些操作都先修改草稿。最后点击页面外层的「保存配置」，统一保存服务列表及默认服务，其他插件才会使用新配置。

`ais` 是服务配置列表，每个服务：

| 字段 | 说明 |
|---|---|
| `name` | 名称，别的插件按它选；改名后引用它的插件就找不到了（报 `config`） |
| `baseUrl` | OpenAI 兼容接口的地址，**填到版本号为止**，本插件自动拼接 `/chat/completions`。必须 `http://` 或 `https://` 开头：表单当场校验，`api.deepseek.com/v1` 这种存不进去；手改 `plugins.json` 写错的，调用时报 `config` |
| `apiKey` | 以 `Authorization: Bearer` 发；留空就不带这个头。存过之后 Bot 不再把它发给 WebUI，表单里是掩码（`role('secret')`，见 plugin-system.md"内置插件的设置"） |
| `models` | 模型 ID 列表，可点击「自动获取」读取这个服务的 `/models`，也可手动添加、删除；调用方各自选用。没有 `models` 的旧配置，其 `model` 自动成为列表的第一个模型 |
| `proxy` | 走代理，默认开，见下文"代理" |
| `timeout` | 毫秒，默认 120 秒：等完整回答最多多久；流式回答是两段之间最多等多久，回答写几分钟也不会被掐断 |
| `headers` / `body` | 额外的请求头 / 请求体字段（比如 `enable_thinking: false`），调用方传的 `body` 再盖在上面 |

`default` 是默认服务的名称，在服务卡片上点击「设为默认」修改，外层「保存配置」后生效；留空或找不到就用列表第一个。调用方未选模型时，兼容旧用法，取所选服务模型列表的第一个；新插件建议保存明确的 `{ ai, model }` 选择，避免调整列表顺序影响使用中的模型。

**地址示例：DeepSeek `https://api.deepseek.com/v1`**。按服务商文档里的 OpenAI 兼容接口地址填写，本插件只拼 `/chat/completions` 等路径，不再加版本号。填了带 `/chat/completions` 的完整地址也认（`baseUrlOf()` 去掉）。同一个地址也用于获取 `/models`，以及 `request()` 调用的其他接口。

**模型列表**：在单个服务的添加 / 编辑弹窗中点击「自动获取」，使用弹窗里正在编辑的地址、Key、请求头、代理和超时设置，把返回的模型 ID 加入当前草稿并去重，已有手动添加的模型保留。也可以在该弹窗中手动添加、删除模型；服务商未提供 `/models` 或返回的列表不全时，直接添加准确的模型 ID。点「确定」返回服务列表，再点外层「保存配置」后，其他插件才能选择更新后的模型列表；删除只影响服务的选项，不会删除服务商的模型。

**不再设置「能看图」**：旧的 `vision` 只是用户手动填写的提示，既不会让模型获得图片能力，也不参与请求校验。图片支持取决于实际选择的模型和服务商接口，通用 `/models` 也不保证提供这个信息。需要看图的插件应选择服务商明确支持图片输入的模型；aiimgdetector 的「看图判断」开关仍用于启停这条检测路线。

**Key 放在别的头里的**（Azure 的 `api-key`）：`apiKey` 留空，把头写进 `headers`。

**改设置不重启**：`apply` 里监听 `internal/update` 只换掉设置（`builtin:commands` 也是这么做的），服务对象不变，用它的插件不会跟着重启。

**代理**：服务经 `ctx.http` 发请求，所以内置的「代理」插件（`builtin:proxy`，见 [plugin-system.md](plugin-system.md)"HTTP 和代理"）填了地址就经它连，没填或停用了就直连；本机和内网的地址（本地跑的 Ollama 等）总是直连。每个 AI 的 `proxy`（走代理）开关默认开，关掉就是这个 AI 的请求带 `proxyAgent: ''`：国内能直连的（DeepSeek 等）可以关掉，免得绕远路。服务测试页上走代理的 AI 标着"走代理"。

### 插件替调用方处理的

- **推理模型的参数**：OpenAI 的推理模型（o 系列、GPT-5）只接受默认的 `temperature`，也不认 `max_tokens`，回 400 并在 `error.param` 里指名。服务见到这种 400 就去掉那个字段（`temperature` / `top_p` / `presence_penalty` / `frequency_penalty`），或把 `max_tokens` 改成 `max_completion_tokens`，再发一次（最多改两回）。调用方照常传 `temperature` / `maxTokens`
- **重试一次**：5xx（500 / 502 / 503 / 504）或连接被断开（`ECONNRESET` / `EPIPE` / `UND_ERR_SOCKET`）时，隔 1 秒再发一次对话请求。超时不重试（等待会翻倍）；`request()` 不重试（打的接口未必能重复调用）
- **思考过程**：本地 Ollama 等会把思考写在回答开头的 `<think>…</think>` 里。`chat()` 的 `text` 去掉这一段，放进 `reasoning`（DeepSeek 等单独给的 `reasoning_content` 也放这里）；`stream()` 不吐这一段，标签被拆在几段里也认得
- **流式**：超时按两段之间算；不支持流式、一次回完 JSON 的服务，`stream()` 把整个回答当一段给出
- **统计**：一次调用算一次（重试和改参数不另算）；调用方自己取消的不算失败

不用代理插件、想让整个进程都走代理的话：Node 的 `fetch` 默认不理 `HTTPS_PROXY`，实测（Node v24.13.0，2026-11-01）再加 `NODE_USE_ENV_PROXY=1` 才走代理（代理收到 `CONNECT`），而且这样连登录签名、QQ 图片也一起走代理了，一般别这么用。

### 给别的插件用

```ts
import { Context, h, Schema } from '@luckylillia/plugin-sdk'
import type {} from 'lucky-lillia-aiprovider'   // ctx.ai 的类型；只引类型，不引代码

export const inject = ['ai', 'commands']
export interface Config {
  model: { ai: string; model: string }
}
export const Config: Schema<Config> = Schema.object({
  model: Schema.object({
    ai: Schema.string().default(''),
    model: Schema.string().default(''),
  }).role('ai-model').description('使用的 AI 模型'),
})

export function apply(ctx: Context, config: Config) {
  ctx.command('问 <question:text>', '问 AI').action(async (_, question) => {
    const { text } = await ctx.ai.chat(question, config.model)
    return h.text(text)
  })
}
```

- 类型在 `src/types.ts`，编译成 `lib/types.d.ts`；AI 服务插件的 `package.json` 的 `types` 和 `exports` 的 `types` 条件都指向它，所以 `import type` 只看到类型，不会把服务的实现拉进调用方的类型检查。调用方保留 `peerDependencies["lucky-lillia-aiprovider"]: "^1.0.0"` 作为 API 兼容声明，并在 `llbot.dependencies` 写同样的包名和版本范围，作为宿主检查和市场自动安装的插件依赖。`inject: ['ai']` 仍负责等待 AI 服务就绪。独立插件通过已安装的 AI 服务包解析类型；本地 `file:` 开发依赖需要先构建 AI 服务，具体步骤见下文（`import type` 编译后不会留下运行时代码）
- `ctx.ai`：`list()` / `get(name?)` 返回服务信息和各自的 `models`，不含 Key；`chat(input, options)` / `stream(input, options)`（异步迭代，一段段给回答）接收 `{ ai, model }` 选择，其中 `ai` 是服务名称，例如 `{ ai: '我的服务', model: 'deepseek-chat' }`；`request(ai, path, init)` 打这个服务的其他接口，Key 和头都带上。`chat` 的 `input` 是字符串就当一条用户消息，返回 `{ text, ai, model, usage, finishReason, reasoning, raw }`：`raw` 是服务商的完整回答，工具调用、拒答这些 `text` 里没有的从这里取
- 图片用 `{ type: 'image', data }` 传字节，服务转成 data URL（类型从字节里认）。**别传 QQ 的图片链接**：会过期，还防盗链，模型服务端多半拉不到（早期实测结论）
- `list()` / `get()` 的可选 `provider: 'openai'` 表示配置地址是规范的 OpenAI 官方 HTTPS `/v1` 接口。该标记由地址推导，不按服务名称或模型名猜测，也不进行联网探测；它不保证 Key 的接口权限，不暴露地址、Key 或额外请求头。未知服务不带这个标记
- 出错一律抛 `AiError`，按 `kind` 分：`config`（没这个 AI / 一个都没配 / 地址不是 http(s)）、`auth`（401 / 403）、`quota`（余额或额度用完：402，或 429 / 403 说的是余额，比如 OpenAI 的 `insufficient_quota`、Kimi 的 `exceeded_current_quota_error`、智谱的"欠费"、硅基流动的 "balance is insufficient"；每分钟额度用完的 429 仍是 `rate-limit`）、`rate-limit`（429）、`request`（其他 4xx，比如模型名不对）、`server`（5xx）、`network`（连不上）、`timeout`、`response`（回答读不懂）；HTTP 的还有 `status`，`code` 是服务商自己的错误码（`context_length_exceeded` 等；`network` 时是连接的错误码，如 `ECONNREFUSED`）。插件不 import 服务的代码，所以别用 `instanceof`，看 `kind`。调用方自己的 `signal` 取消时抛它自己的 reason
- `{ ai, model }` 对象字段写 `.role('ai-model')`，WebUI 里先选服务、再选该服务的模型。选择保存在调用方自己的配置里，各插件可以选不同服务和模型。同一服务下，已保存的模型即使不在新列表里也保留并提示，服务调用仍接受显式指定的模型 ID；主动切换服务时模型重置为空，先用新服务的首个模型，再由用户选定
- 需要手动选择服务、不调用对话模型的功能继续用 `Schema.string().role('ai')`，空值是默认服务。未设置 provider 筛选的服务下拉框把空值显示为「跟随默认服务」，模型下拉框显示「使用服务的首个模型」，具体服务名和模型 ID 各列一次；选择具体名称则固定使用该项。这两个控件由 AI 服务 WebUI 模块的 `ctx.field()` 注册，界面随服务插件启用自动加载；控件不可用时退回普通表单，仍能手动填写
- `ai` 字段用 `.extra('extra', { provider: 'openai' })` 筛选官方服务时，下拉框只列实际服务名，没有「自动选择」选项。配置值为空或未指定时，优先显示全局默认服务（须为 OpenAI 官方服务），否则显示列表中第一个官方服务；显示解析结果不会改写配置或触发 `onChange`。aiimgdetector 的 `provenanceService()` 使用相同顺序。明确保存的名称保持指定选择；名称已失效或不属于官方服务时保留原值，并提示重新选择
- `ai` / `ai-model` 控件在成功读取列表但没有可用服务时，显示「无可用服务，请先设置」，其中「设置」是跳转到 AI 服务设置页的链接，由所属 AI 服务插件的上下文 `ctx.pageHref('settings')` 生成。通过 `.extra('extra', { provider: 'openai' })` 筛选后没有匹配服务时，明确显示「无可用的 OpenAI 官方服务，请先设置」。调用方可在同一元数据对象中用 `emptyHint` 添加用途说明；aiimgdetector 的水印检测提示「OpenAI 水印检测免费，但有调用频率限制；请求过于频繁时请稍后再试。」，费用说明仅针对水印检测，不用于普通服务和看图模型。该费用说明按 owner 提供的信息添加（2026-11-04），官方文档访问返回 403，未独立核实，也不写具体限流次数。加载中和读取失败时保留各自的状态提示

### WebUI

`webui/index.js`（不用构建的 ES 模块）：

- 设置页（`settings: true`，插件卡片的齿轮也打开它）：主页面是服务列表草稿，添加 / 编辑打开单个服务的弹窗；弹窗内配置参数、自动获取或手动增删模型、测试，点「确定」将修改应用到列表。卡片上的删除和「设为默认」同样只更新草稿，并显示默认服务标记；最后由外层「保存配置」统一提交列表和默认项
- 弹窗中的「测试」使用所选模型发送一句"只回复两个字母：OK"，显示耗时和回答，失败时显示原因和中文说明。测试使用**当前草稿**中的地址、Key、请求头、代理、超时和模型，不必先保存，也不写入配置或改变运行中插件使用的设置；未修改的密钥掩码由后端还原为原服务的密钥，地址跨域变化时需要重新输入 Key
- `ai` / `ai-model` 字段控件，见上；下拉用 SDK 的 `SelectInput`，不用 `<select>`（展开的列表是系统样式）
- 后端路由 `/api/aiprovider`：`GET /ais`（已保存的服务及模型列表 + 进程内的调用次数、失败次数、最近一次失败，重启清零）、`POST /models { draft, source? }`（使用草稿获取模型）、`POST /test { draft, source?, model? }`（使用草稿测试所选模型）；`source` 标识用于还原已保存密钥的原服务。旧的 `POST /test { ai, model? }` 仍兼容

### 测试

`../LuckyLillia.Plugins/lucky-lillia-aiprovider/test/index.test.ts`：本地起一个假的 OpenAI 兼容服务（`../LuckyLillia.Plugins/lucky-lillia-aiprovider/test/fakeAi.ts`），覆盖按名称 / 默认选 AI、模型和额外字段、地址去尾、图片转 data URL、流式、各类失败和计数、空 Key 不带 `Authorization`、`request()`、改设置不重启、WebUI 路由；流式按两段之间超时、`chat()` 回到一半停住也算超时、要流式却一次回完、地址不是 http(s)、调用方取消不算失败、推理模型拒收的参数、5xx 和断连重试一次、思考过程、余额和限流分开。假服务的 `FakeAnswer` 能控制事件间隔（`interval`）、不结束流（`hold`）和直接断开连接（`drop`）。注意 `fetch` 拒绝连一些低端口（端口 1 报 `bad port`），模拟连不上要用一个刚释放的端口。

模型列表和草稿调用的用例覆盖旧 `model` 迁移、显式空列表、不同服务存在同名模型时的选择、草稿测试不影响运行配置和统计、密钥掩码还原 / 清空 / 跨域拒绝复用、模型列表去重以及服务商返回错误。

在 aiprovider 目录运行 `npm test`，通过 `@luckylillia/plugin-sdk/testing` 创建测试环境；代理用例验证 `http/fetch-init` 钩子和每个服务的代理开关，内置代理插件的实现由 Bot 仓库的 `test/unit/plugin/proxy.test.ts` 覆盖。

## aiimgdetector（`../LuckyLillia.Plugins/lucky-lillia-plugin-aiimgdetector`，包名 `lucky-lillia-plugin-aiimgdetector`）

对着图片回复「/ai吗」，或「/ai吗」后面直接带图，查图片是不是 AI 生成的；默认也支持不带前缀的「ai吗」。npm 包名为 `lucky-lillia-plugin-aiimgdetector`，模块名和日志名均为 `aiimgdetector`，中文标题保持「AI 图片检测」。服务依赖是 `bots`、`ai`、`http` 和 `commands`；`llbot.dependencies` 明确声明插件包 `lucky-lillia-aiprovider: ^1.0.0`。

### SynthID 登录（owner 2026-11-07）

SynthID 默认关闭，顺序是 **OpenAI 水印检测 → SynthID → 看图判断**。用户要求登录入口放进「SynthID 检测」内，取消单独的手动模式开关（owner 2026-11-07）。打开检测开关后始终显示登录按钮、三项凭证及超时。点击「登录 SynthID」在 Bot 所在电脑的 Chrome / Edge 完成 Google 登录与网站首次使用提示；插件再上传一张不包含用户信息的内置测试 PNG，捕获该次检测的完整凭证并自动填入表单。仍由弹框底部「保存」提交配置。使用 `playwright-core`，不在安装时下载浏览器。登录浏览器和检测请求均经 `ctx.http`，自动沿用「代理」插件已保存、已启用的配置，无需单独填写浏览器代理。

也可直接手动填写相同的 `synthid.credentials: { refreshToken, pushFilename, bgToken }`，不要求 Bot 安装浏览器。三项均为 `role('secret')`，由宿主配置流程保存和遮罩；旧 `credentials: false` 兼容转换为空凭证对象。手动填写或登录自动填写后，保存的凭证均使用同一 HTTP 检测客户端；三项全空且已有浏览器会话时兼容原检测流程，部分填写则提示补全。登录状态只返回 `credentialRevision`，不返回秘密；已登录设置页用带版本号的 `POST /api/aiimgdetector/synthid/credentials` 获取真实值。只在本次主动登录成功或初次打开的三项全空时自动填入一次，不能由后续轮询覆盖手工编辑或其他未保存配置。「清除浏览器会话」不删除表单或配置中的凭证。

获取说明默认折叠：自己的浏览器登录，F12 的 IndexedDB 取当前账号 `stsTokenManager.refreshToken`，Network 中同一次检测的上传请求取 `Push-Filename`（也可从 `TZRKo` 的 `f.req` 取），检测请求头取 `X-Goog-Ext-525006476-Jspb` 完整数组或索引 5。上传标识是网站分配的值，不是本机目录；后两项必须配对，不承诺永久有效，失效时重新登录自动获取或在网页重新检测后一起更新。

WebUI 模块为 `webui/index.js`，随插件启用自动加载。检测超时只显示秒。旧版直接放在 `synthid` 下的凭据字段仍隐藏并保留密码遮罩兼容，不自动启用。详情见插件自己的 `docs/synthid.md`。

### OpenAI 与看图判断

以下两条路线经 AI 服务；SynthID 使用上面的浏览器登录或手动凭证：

1. **OpenAI 水印检测**（`provenance`，默认开）：保留开关和服务下拉框。下拉框用 `.role('ai').extra('extra', { provider: 'openai' })` 只列官方服务的实际名称，可手动固定一个；不列「自动选择」、DeepSeek、中转或已失效的旧选项，旧选择无效时保留配置值并提示重新选择。未指定服务时，前后端均优先使用全局默认服务（须为 OpenAI 官方服务），否则使用列表中第一个官方服务；界面直接显示该名称，不改写原配置。没有候选时跳过，继续看图判断；只开水印检测但没有候选时明确提示缺少官方服务，不将跳过当作「未检出」。后端同样验证手动选择的服务，沿用 `POST {baseUrl}/content_provenance_checks`（multipart，字段 `file`）和 `ctx.ai.request()`，不向中转或其他服务试探性发送图片。地址只能确定候选，权限和接口可用性以实际响应为准；失败时继续看图判断。国内连官方接口通常需要「代理」插件，并让该服务走代理。水印路线只识别 OpenAI 自家的图
2. **看图判断**（`vision`，默认开）：在 aiimgdetector 设置里选择服务及模型，让能看图的模型按取证要点（手指、文字、边缘、光影、纹理、透视、细小配件）看，输出 `{"verdict","confidence","reasons"}`，`temperature: 0`。只是推测，按图片计费。应按服务商文档选择支持图片输入、网络可达的模型，不能仅凭服务商品牌判断看图能力。未明确选择时保留旧配置的默认服务和首个模型回退

`provenance: { ai: '名称' }` 保留指定服务，`{ ai: '' }` 或未指定名称时按「官方全局默认服务 → 第一个官方服务」解析；显式保存的 `false` 保持关闭，未配置时默认打开。

去掉的：
- **本地 C2PA 解析**：owner 决定全靠云端识别。原插件那份零依赖的 JUMBF / CBOR 解析在 koishi 仓库里，要用再搬

### 触发和取图

- 用 `ctx.command(config.trigger.trim())` 注册（默认 `ai吗`），前缀和是否允许无前缀统一跟随「指令」设置。保留 `trigger` 配置字段，填写指令名、不带前缀；Schema 拒绝名称内部的空白，首尾空白忽略，空值不注册。指令列表和平台菜单会出现它，卸载时自动注销
- 指令名后面可以是空白、结尾或真正的消息元素，所以 `/ai吗<img .../>` 和 `ai吗<img .../>` 都能识别。名称不分大小写，开头的引用和对机器人的 `@` 由 `Session.stripped` 处理；@ 别人、`ai吗呀` 等继续拼接文字的消息不触发，引用消息里的文字也不当指令
- 先取消息自己的图，没有再取引用的那条（`quote` 元素的 children）。都没有就交给后面的插件（以触发词开头的消息不一定是给它的）
- 冷却仍按会话（`平台:channelId`）；没图或冷却中由 action 调用 `argv.next()` 交给后续消息中间件，不用统一指令系统按用户计时的冷却

### 回复

- 引用**图片所在的那条**：自己带图就引用自己，引用别人的图就引用那条（`quote` 的 `id`）
- 一种结论一句话：水印检出「图片是 ChatGPT 制作。」；看图「<模型> 判断：疑似 AI 生成（置信度 85%）」加最多 3 条理由（模型没给 JSON 时是原文前 200 字）；都查完没结论「没看出 AI 制作的痕迹。」
- 水印检测失败就退到看图；看图也失败（或没开）时报原因，两个都失败报水印检测的：`rate-limit`「检测请求过于频繁…」、`quota`「AI 服务的余额或额度用完了。」、`auth`「API Key 无效或没有权限。」（OpenAI 对区域封锁回 403，也落在这）、`network` / `timeout`「连不上检测服务…」、`config`「AI 服务或模型尚未配置好。」，其他「检测失败…」
- 用 `h.text` 发，模型回答里的 `<` 不会被当成元素

### 图片

用 `ctx.http.file()` 下载一次给两条检测共用（点名直连 `proxyAgent: ''`：Bot 本来就直连 QQ 的图片服务器，经国外的代理只会更慢；30 秒超时，20 MB 上限，也认 `data:` URL）。QQ 有的图回 `application/octet-stream`，`file()` 这时按文件头认类型，认不出的当 PNG。

### 插件页的展示

`package.json` 里写了名字（`llbot.title`「AI 图片检测」）、作者、图标 `assets/icon.svg`、详情 `docs/details.md` 和两张演示图（写法见 [plugin-authoring.md](plugin-authoring.md)"名字、作者、图标和详情"）：

- `assets/demo.jpg`：WebQQ 群聊里对着图回复「ai吗」，Bot 引用原图回答。不登录 QQ 拍的：照 [plugin-system.md](plugin-system.md) 的端到端方法用 Playwright 改 `/api/plugins`（`builtin:webqq` 算运行中）、mock `/api/webqq/*`（自己、群、成员、三条消息），头像和图片的外部请求全拦下来，图是 canvas 画的晚霞；回答的文字照 `formatVision()` 的格式写
- `assets/settings.jpg`：配置弹框里的表单。临时实例里配置示例服务和模型（只存设置，不会请求），启用服务插件后自动加载界面；水印检测默认打开，服务下拉框直接显示按默认顺序解析出的官方服务名称，也可指定其他官方服务；看图判断的 `ai-model` 字段选服务和模型
- 界面或回复格式改了要重拍。看效果：把这个目录放进 Bot 的 `data/plugins/`（开发时用目录联接，`New-Item -ItemType Junction`，扫描认得），插件页点「重新扫描」

### 测试

用例位于插件自己的 `test/index.test.ts`，假服务在 `test/fakeAi.ts`，在插件目录运行 `npm test`。测试通过 `@luckylillia/plugin-sdk/testing` 创建 Bot 测试环境，并加载本地开发依赖中的 AI 服务；不依赖 Bot 仓库的测试配置。覆盖指令注册和卸载、带斜杠和无前缀时紧接图片、自定义指令名、共享前缀和 bare 设置、引用别人的图 + @ 机器人 + 大写指令、拒绝 @ 别人或继续拼接文字、水印检出（multipart、Key、检出后不再看图）、选择非默认服务及模型并使用对应 Key、模型不给 JSON 时的原文和转义、没结论、各类失败、水印失败退到看图、没图交给后面、按会话冷却、图片下载失败。

### 本地开发准备

SDK 尚未发布时，两个插件的 `devDependencies` 都使用 `file:../../LuckyLillia.Bot/packages/plugin-sdk`，同时声明 TypeScript、Vitest 和 Node 类型。aiimgdetector 还通过 `file:../lucky-lillia-aiprovider` 引入 AI 服务。先构建 SDK，再安装、测试和构建 AI 服务，最后验证检测插件：

aiprovider 的开发依赖还用 `file:../../LuckyLillia.Bot/node_modules/cordis` 连接到 Bot 使用的同一份 Cordis 类型，保证 `Context` 的 `ai` 类型扩展与链接 SDK 一致。该链接仅用于当前本地开发，不作为发布包的运行时依赖。

```sh
# 在 LuckyLillia.Bot 仓库根目录
npm run build:sdk

# AI 服务插件目录
cd ../LuckyLillia.Plugins/lucky-lillia-aiprovider
npm install
npm test
npm run build
npm pack --dry-run

# AI 图片检测插件目录
cd ../lucky-lillia-plugin-aiimgdetector
npm install
npm test
npm run build
npm pack --dry-run
```

`build` 和 `prepack` 只执行本插件的 `tsc -p .`。`tsconfig.json` 通过已安装包解析 AI 服务公开的类型，不再配置指向网关源码或构建目录的 `paths`。修改 SDK 或 AI 服务后，先重新构建相应依赖，再验证检测插件。

## 发布

两个包都还没发布（2026-11-02）。当前本地开发仍要让宿主扫描到两个包：在 Bot 仓库运行时传入 `--plugin-dir ../LuckyLillia.Plugins`，或分别在 `data/plugins/` 建目录联接；已有兼容的本地 AI 服务插件可以直接复用。

在插件目录 `npm publish`：`prepack` 先编译当前插件，包里是 `lib/`、`src/`（给 `development` 入口）、aiimgdetector 的 `assets/` 和 `docs/`（图标、详情、演示图）和 AI 服务插件的 `webui/`。两个包及其精确版本都须登记到配置的插件目录包（默认 `@luckylillia/market`），流程见 [LuckyLillia.Market](https://github.com/LLOneBot/LuckyLillia.Market)，不再按 npm 关键词收录。市场安装 `lucky-lillia-plugin-aiimgdetector` 时按 `llbot.dependencies` 复用已装的兼容 AI 服务插件，否则安装目录指定的 AI 服务插件版本；未收录或目录版本不满足依赖时就报错。新装的两个插件条目都保持停用，用户仍需信任、启用插件，配置 AI 服务。

- **相对 import 带 `.js` 后缀**（`./provider.js`）：tsc 的 `Bundler` 解析不补后缀，编译出的 `import './provider'` 在 Node 里找不到。tsx、vitest 和根 `tsconfig.json` 都认 `.js` 指向 `.ts`
- 编译产物要在不经 tsx 的 Node 里跑过一次：2026-11-02 用 SDK 打好的测试工具（`packages/plugin-sdk/lib/testing.js`）挂上两个 `lib/index.js`，对着假的 OpenAI 服务跑通了对话（含去掉 `<think>`）和 aiimgdetector 的看图回复
