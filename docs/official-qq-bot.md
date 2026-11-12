# 官方 QQ bot 适配器

> QQ 开放平台（q.qq.com）的官方机器人：用 AppID + AppSecret 登录，不走纯协议或官方 QQ 客户端桥接，作为**中立层的第二个消息源**接入，现有插件（echo、keyword-reply）不用改就能在它上面跑。
>
> 已实施：内置插件 `builtin:qq-official`，代码在 `src/plugin/internal/protocol/qq-official/`。群聊、单聊（C2C）、频道都做了，每个 AppID 统一注册一个 `qq` Bot，只走 WebSocket。功能对齐 `koishi-plugin-adapter-qq-crack` 1.0.32（官方 Koishi adapter 的魔改版，仍走官方 appid + secret，没有破解鉴权），webhook 除外。读 crack 源码：`npm pack koishi-plugin-adapter-qq-crack@<版本>` 解到临时目录（`D:\code\github.com\koishi-plugin-adapter-qq-crack` 的克隆停在 1.0.18，太旧）；频道消息的解析以上游 `@satorijs/adapter-qq` 的 `decodeMessage` 为准。

## 1. 定位

官方 bot 每个 AppID 只实现一个 `Bot`，经 `ctx.bots.register()` / `dispatch()` / `beforeSend()` 接入中立层，和扫码账号（NT，`platform='luckylillia'`）互相独立：

- `qq`（`QQOfficialBot`，sid `qq:<AppID>`）：统一承载群聊、单聊、频道和机器人自身的事件。`ctx.bots`、`session.bot`、WebUI 账号卡片、Satori login 都只有这一个身份（owner 2026-11-05）。
- 频道 REST 和发送逻辑封装在内部 `QQGuildClient`，不注册到 `ctx.bots`。中立层暴露的频道、子频道、用户、消息 ID 加 `qqguild:` 前缀；频道私信的 channelId 为 `private:qqguild:<DMG>_<DMC>`。群聊 / C2C ID 保持原样（单聊为 `private:<openid>`），方法按 ID 路由到对应接口。`qqguild:` 是资源命名空间，不是第二个平台。
- **不走** `qqProtocol` / `selfInfo.uin` / NT 登录会话。它只有 appid 和 openid，没有 uin，实现不了 `ntMsgApi` / `ntFileApi`
- **身份统一用 Bot**，官方 AppID 不伪装成 NT 的 UIN / UID；公共 `account` 服务已删除。NT 专属的消费者（WebQQ、只订阅 `nt/*` 的 OB11 / Milky）天然看不到官方 bot，这是正确的隔离。Satori 适配器不是 NT 专属的：它把 `ctx.bots` 里的每个 bot 都作为 login 给外部客户端，官方的唯一 `qq` login 也在（plugin-system.md"Satori 适配器"）
- `inject` 只有 `bots` + `timer`，不等扫码登录，启动就连。扫码协议也是插件（`builtin:nt-protocol`，见 [core-pluginization.md](core-pluginization.md)），两个开关独立：只开扫码、只开官方机器人、两个都开，在插件页切换即可，运行时立即生效

## 2. Owner 决策

- **只走 WebSocket，不做 webhook**。webhook 要 HTTPS 公网回调（端口只能 80 / 443 / 8080 / 8443），还要 ed25519 验签；WS 是出站长连接，自托管零门槛。腾讯 2024 年说过要下线 WS，但到 2026-10 官方文档仍把两者并列，可在开放平台随时切换，单机自用推荐 WS
- **按 crack 实现它的全部功能**（2026-10-28 owner 要求，webhook 除外）。不要再以"没申请到权限""用的人少"为由砍功能：markdown 和消息按钮 2026-04 起已对所有机器人的单聊、群聊开放
- **内置插件，不是插件包**：原设计要求做成插件包，理由是 builtin 不能有设置、配置读 `config_<uin>.json`，这两条在 `BuiltinConfig` 和实例模型之后都不成立了。代价：内置插件只有一个条目，所以**一个实例只接一个 AppID**；要多个，以后要么改成 `bots` 数组，要么让内置插件支持多条目
- 和 crack 有意不同的地方：
  - 按 openid 查昵称的第三方接口（crack 默认打 `https://oiapi.net/api/Openid`）**默认关闭**，要在设置页填地址：它会把用户 openid 和 AppID 发给第三方。先查缓存，查不到才问接口（crack 是每个缺名字的事件都先问接口）
  - 用户名 crack 写进 Koishi 的用户表；这里写到插件数据目录的 `usernames-<AppID>.json`（`ctx.storage.dir()`，最多 2 万条，5 秒防抖）
  - 群里 @ 某人像 crack 一样把消息改成 markdown（`useMarkdownIfAt`，默认开），但写新格式 `<qqbot-at-user id="openid" />`（crack 写 `<@openid>`，官方标了即将弃用）；关掉时写成纯文本"@名字"（crack 是丢掉）。改成 markdown 时会先转义已有的文本（crack 不转义），平台渲染的标签除外
  - markdown 转义用 HTML 实体（crack 用反斜杠，QQ 会把反斜杠原样显示出来），见 §6
  - `<a href>` 写成"文字 ( 链接 )"，和 NT 一样（crack 只发链接，卡片降级时标题就丢了）
  - 中立层的 `<card>` 在群聊、单聊发成 markdown（owner 2026-10-31：官方机器人没有 ark 权限，ark 模板要申请）
  - 流式（owner 2026-10-31 定）：单聊一段流从第二片起不占被动回复次数；群里没有流式，各片攒成一条，结束时发出；`<markdown stream="end">` 结束一段流，最后一片之后 10 秒没新片自动结束。crack 每片都占一次回复，也从不自动结束
  - 发送优先回复事件的 `referrer`（`session.send()` 带回来的触发消息），crack 靠 Koishi 会话；没有 referrer 时才回复频道里最近一条
  - crack 的频道消息解析丢了正文（`message.content` 没赋值就用），按上游 adapter-qq 修正
  - h() 会把属性名驼峰化（`render_data` → `renderData`），crack 只读下划线写法，所以它的 `qq:button` 的 `render_data`、`qq:markdown` 的 `custom_template_id` 写在顶层属性时其实不生效；这里两种写法都认
  - `INTERACTION_CREATE` 没有 `data.resolved`（不是按钮 / 菜单类的互动）时只发 internal 事件；crack 会读空字段抛错
  - 频道的互动事件（`chat_type` 3）按频道解码并补齐 ID 前缀，统一由 `qq` 分发，回复路由到子频道
  - 频道收到的消息也记被动回复，所以插件主动 `sendMessage` 也会回复该子频道 5 分钟内最近的消息；crack 只在 `session.send()` 时回复触发的那条
  - 审核等待 5 分钟超时（crack 无限等）

## 3. 文件

| 文件 | 内容 |
|---|---|
| `index.ts` | 插件：AppID / AppSecret 没填就记一行 info 直接返回，什么都不连（卡片"待配置"，见下面 `config.ts`）；先取一次 token，凭证错让条目 `failed`，原因直接显示在卡片和设置页上；注册唯一的 `qq` bot，起网关；每个事件先作为 internal 事件分发，再解码；`INTERACTION_CREATE` 回 `PUT /interactions/{id}`（`manualAcknowledge` 时不回）；审核结果交给 `Audits`；缺名字时问查询接口 |
| `api.ts` | REST：token 的获取与续期、`Authorization: QQBot <token>` + `X-Union-Appid`、401 换 token 重试一次、错误码解析；`endpoint` / 沙箱前缀、query 参数、multipart、调试日志 |
| `gateway.ts` | WS 网关：identify / resume、心跳、断线重连；`gatewayUrl` 覆盖、把平台网关换到 API 的域名上、调试日志；事件处理抛错只记日志 |
| `bot.ts` | `QQOfficialBot` / 内部 `QQGuildClient`：信封、发消息、`deliver()` 选被动回复目标、群 / 频道管理方法、`Audits`（等审核结果） |
| `sender.ts` | `h[]` → 平台消息：`MessageSender`（群 / 单聊）、`GuildMessageSender`（子频道 / 频道私信），共用 markdown、按钮、平台载荷的处理 |
| `elements.ts` | 平台元素：`qq:ark*`、`qq:json` / `qq:markdown` / `qq:rawmarkdown*` 的解析，按钮转换，markdown 转义（`escapeMarkdown` / `textToMarkdown`），卡片转 markdown，markdown 里的 `data:` 图片拆分 |
| `media.ts` | 富媒体上传：URL、`file_data`、分片；语音转 silk；网络图片的尺寸（卡片的 markdown 图片要） |
| `passive.ts` | 被动回复记账（群 / 单聊 / 频道）、`REFIDX_` 引用索引 |
| `stream.ts` | 流式回复，按回复的目标记：单聊接着同一条消息发，群里攒着；空闲 10 秒自动结束 |
| `decode.ts` | 网关事件 → Satori 事件：`decodeDispatch`（群聊 / 单聊）、`decodeGuildDispatch`（频道）；统一由主 bot 发出事件 |
| `internal.ts` | 全部 REST 接口合并到同一 `bot.internal`；同名发送 / 删除接口加 `Guild` 区分，详见 §7 |
| `guildIds.ts` | 频道资源和元素 ID 的命名空间转换，原始平台载荷保持腾讯 ID |
| `setup.ts` / `setupRoutes.ts` / `setupTypes.ts` | 扫码自动配置状态机、鉴权路由和前后端共用状态类型，standby 挂载 |
| `menu.ts` | 单聊自定义菜单、群聊指令面板的同步 |
| `users.ts` | 用户名缓存和持久化、昵称查询接口 |
| `config.ts` | schema；设置规则在 `src/plugin/internal/protocol/qq-official/settings.ts`（开着时保存必须有 AppID / AppSecret；不声明 `checkOnEnable`，没填也能先在卡片上打开，启动也不报错，`notice` 让卡片显示"待配置 · 还没有填写 AppID 和 AppSecret"，主界面顶部也提示；到侧边栏出现的设置页填好保存，保存即重启条目；AppSecret 打码） |

WebUI 设置页（页面 id `qqofficial`）是插件自己的界面 `client/`，有「手机 QQ 扫码配置 / 手动配置」两个切换项，一次只显示一种方式。已有 AppID 默认手动，新配置默认扫码；切换时保留手动草稿，离开扫码页会取消仍在等待的任务。手动表单用 SDK 的 `usePluginConfig` / `SchemaForm` 读写，主区只显示 AppID / AppSecret（`fields: ['appId', 'secret']`）；沙箱、机器人类型和订阅事件放进默认折叠的「高级设置」，标题旁用弱化小字提示「不清楚各项设置的作用时，保持默认即可。」，折叠时也可见。订阅的事件 `role('qq-official-intents')` 由插件用 `ctx.field()` 注册的控件画（`client/IntentsField.tsx`：按群聊单聊 / 频道分组、每项写明带来哪些事件、顶部警告没权限的事件会被断开），插件界面没加载时退回通用的多选。

消息行为（`useMarkdownIfAt`、`autoStreamText`、`retryWhen`、`manualAcknowledge`）、单聊菜单（`privateSlash`、`privateMenu`）和群聊指令面板（`groupSlash`、`groupPanels`）按 owner 2026-11-05 要求暂时从 UI 隐藏，schema 标记 `.hidden()`。原来的"进阶"（`endpoint`、`gatewayUrl`、`userInfoApi`、`disableUserNamePersist`、`debug`）也保持隐藏（owner 2026-10-28）。这些配置及原有功能照常生效，保存可见配置时保留隐藏字段；要改只能直接编辑实例 `plugins.json` 里这个条目的 `config`。

连接状态显示在「QQ 官方机器人」标题右侧（`client/ConnectionStatus.tsx`，owner 2026-11-05）：在线时为绿点 +「已连接」，未连接时为灰点 +「未连接」，扫码配置和手动配置共用；不再单独显示顶部连接状态卡片。缺 AppID / AppSecret、插件运行失败等宿主提示仍由 `PluginPage` 显示在这一页上方。

### 扫码自动配置

参考 [tencent-connect/dsh-qqbot](https://github.com/tencent-connect/dsh-qqbot) 0.5.5 和它使用的 `@tencent-connect/qqbot-connector` 1.2.0，直接调用腾讯扫码接口，不经过 DSH 服务。进入「手机 QQ 扫码配置」自动生成二维码，无需先点击按钮；等待扫码时不显示刷新按钮，过期后停止轮询，用户点击「重新生成二维码」才创建新任务，生成失败时也可手动重试。已配置时说明确认后会替换 AppID / AppSecret，保留其他设置和插件启用状态。

- 后端生成 32 字节密钥，向 `https://q.qq.com/lite/create_bind_task` 提交 Base64 key，拿到 `task_id`。二维码链接为 `https://q.qq.com/qqbot/openclaw/connect.html?task_id=…&source=luckylillia&_wv=2`，只含任务 ID。腾讯未登记的 source 可能显示「第三方机器人」。
- 每 2 秒向 `poll_bind_result` 查询，状态 0 / 1 等待、2 完成、3 远端过期；远端过期和本地超时都会结束会话并清理密钥，保留过期状态等待手动重新生成，不自动换码。本地会话总时长最多 10 分钟，单次请求超时 10 秒。HTTP 使用 `ctx.http`，支持现有代理设置。
- 完成时读取 `bot_appid` / `bot_encrypt_secret`，按 AES-256-GCM 解密（Base64 内容为 12 字节 IV + 密文 + 16 字节 tag）。密钥和 AppSecret 不返回浏览器。通过插件服务携带开始时的 `rev` 更新整份生效配置，保留隐藏设置；发生并发修改则拒绝保存，提示重新扫码。
- `setupRoutes.ts` 是条目的 standby 部分，插件停用或还没有凭据时也可访问。`POST /api/qq-official/setup/start` 主动创建 / 刷新，`GET /:id` 只读状态，`DELETE /:id` 取消；均受 WebUI 登录保护，响应 `no-store`，返回直接的 `QQSetupState` 对象。取消、刷新、卸载后迟到的结果不会写入配置；已进入原子保存时不能取消或刷新（409）。
- 页面仅在扫码完成并成功保存后刷新表单。此流程不承诺创建新机器人，具体选择 / 绑定步骤由腾讯页面提供。真实生成二维码、等待和取消已验证；成功授权后的解密和写入使用模拟响应验证，未替用户扫码授权或更换现有机器人。

### Dashboard

`client/DashboardCard.tsx` 由官方机器人自己的 `client/index.tsx` 贡献到 `dashboard.cards`（`wide`，order 12），显示头像、昵称、AppID、连接状态、正式 / 沙箱环境和收发消息数，附设置入口；不依赖 NTQQ 登录。卡片显示时每 5 秒读 `/api/qq-official/stats`，路由随本插件启停，通过可选的 WebUI 依赖挂载；响应只含展示字段，不返回凭据。缺凭据时显示待配置，查询失败保留上次数据并明确提示，停用插件后卡片撤下。

统计从本次启用开始，重启插件或进程后归零；网关断线重连不清空。收到的消息在去重后计数，自己的频道回显不算收到；发送以实际成功为准，失败和重试不额外计数，流式回复只算一条。群聊、单聊和频道统一计入同一个 Bot，计数不依赖日志等级。`statsTypes.ts` 定义前后端共用的 `QQOfficialStats`（时间为毫秒），`stats.ts` 实现计数。

## 4. 鉴权与网关

- **域名**：2026-08-10 起统一为 `api.bot.qq.com`，沙箱 `sandbox.api.bot.qq.com`（旧的 `api.sgroup.qq.com` / `bots.qq.com` 目前还通）。`endpoint` 可换成别的地址，沙箱在其域名前加 `sandbox.`（和 crack 一样）
- **token**：`POST https://api.bot.qq.com/app/getAppAccessToken` body `{ appId, clientSecret }` → `{ access_token, expires_in }`（`expires_in` 是数字字符串）。有效期内再要拿到的是同一个；最后 60 秒内再要会发新的，旧的在这 60 秒里仍有效。所以在到期前 50 秒续期。失败也是 HTTP 200，看 `code`：`10004` 机器人不存在、`100007` / `100016` AppID 或 secret 不对，这几个重试没用（`CredentialError`）
- **错误体**：`{ code, err_code, message, trace_id }`，`code` 是短码、`err_code` 是 8 位的业务码，判断用 `err_code ?? code`；trace id 也在响应头 `X-Tps-trace-ID`
- **网关**：`GET /gateway` 拿 `url`（`*.qq.com` 的地址把域名换成 API 的域名，crack 如此；`gatewayUrl` 设了就直接用）→ HELLO（`heartbeat_interval`）→ IDENTIFY `{ token: 'QQBot <token>', intents, shard: [0, 1] }`，有会话时 RESUME `{ token, session_id, seq }` → READY（`session_id`、bot 的 `user`）/ RESUMED。心跳 `{ op: 1, d: 最后的 s }`；上一个心跳到下一个心跳之间没收到 ACK 就判定僵死，`terminate()` 重连
- READY 之后取一次 `GET /users/@me`（名字、头像，`union_openid` 作为 bot openid 的后备），然后同步一次菜单（§8）
- **op 7**（服务端要求重连）→ 断开后 resume；**op 9**（会话无效）→ 清会话，重新 identify
- **关闭码**：4009 可 resume；4006 / 4007 / 4900~4913 只能 identify；4008（发得太快）至少等 10 秒；4004 当成 token 失效，换 token 后重连；4001 / 4002 / 4010~4014 / 4914（已下架，只能连沙箱）/ 4915（已封禁）不再重连。其余（含网络断开 1006）按 1 / 2 / 5 / 10 / 30 / 60 秒退避，连上并稳定 30 秒后重置
- **intents**（设置页全部可勾）：2026-11-05 按 owner 要求，默认与 `koishi-plugin-adapter-qq-crack` 1.0.33 一致，订阅下列 12 类（掩码 `1863062531` / `0x6F0C1403`）：`GROUP_AND_C2C_EVENT` 1<<25、`GROUP_MEMBER_EVENT` 1<<24、`INTERACTION` 1<<26、`MESSAGE_AUDIT` 1<<27；频道 `GUILDS` 1<<0、`GUILD_MEMBERS` 1<<1、`GUILD_MESSAGE_REACTIONS` 1<<10、`DIRECT_MESSAGE` 1<<12、`OPEN_FORUMS_EVENT` 1<<18、`AUDIO_OR_LIVE_CHANNEL_MEMBER` 1<<19、`AUDIO_ACTION` 1<<29、`PUBLIC_GUILD_MESSAGES` 1<<30。私域的 `GUILD_MESSAGES` 1<<9 和 `FORUMS_EVENT` 1<<28 默认不订阅，可手动勾选。crack 的 `DIRECT_MESSAGES` / `INTERACTIONS` 对应这里的 `DIRECT_MESSAGE` / `INTERACTION`，位值相同。显式保存的订阅列表仍按原值生效。官方文档："除了 GUILDS、PUBLIC_GUILD_MESSAGES、GUILD_MEMBERS 事件是基础的事件"，其余要申请；订了没权限的会被 4013 / 4014 断开，可在设置页调整

## 5. 收消息

正常级别日志（不需要开启隐藏的 `debug`）包含网关连接 / 上线 / 断开 / 恢复 / 停止，以及群聊、单聊、频道、频道私信的收发摘要，统一来自 `qq-official` logger。摘要使用 `[收-群]` / `[发-私]` 等方向和场景标记，带会话和发送者；文字压成一行、最多 300 字符，媒体仅显示类型，不打印附件 URL、base64 或平台载荷属性。接收在解码和去重后记录；发送在获得成功的消息 ID 后记录，重试不重复记，审核未通过不记成功。流式单聊只记首个成功分片，群里攒片直到实际发出才记，避免逐片刷屏。

每个事件先作为 `internal` 事件经 `qq` 分发（`_type` 是 `qq/<小写、短横线的事件名>`，`_data` 是原始数据，插件在 `bot/event` 里按 `session.type === 'internal'` 取），再按下表解码。缺名字的用户从用户名缓存补，设了查询接口再问它。

| 官方事件 | Satori 事件 | 说明 |
|---|---|---|
| `GROUP_AT_MESSAGE_CREATE` | `message-created` | content 去掉了对 bot 的 @（剩一个前导空格），**补回开头的 `at(AppID)`** |
| `GROUP_MESSAGE_CREATE` | `message-created` | 全量群消息（2026-06 起，要群主在机器人资料页打开"接收所有消息"）；content 里 @ 是 `<@member_openid>` / `<@all>` |
| `C2C_MESSAGE_CREATE` | `message-created` | 频道 `private:<user_openid>`，`Channel.Type.DIRECT` |
| `GROUP_ADD_ROBOT` / `GROUP_DEL_ROBOT` | `guild-added` / `guild-removed` | `operator` 是操作人 |
| `GROUP_MSG_RECEIVE` / `GROUP_MSG_REJECT` | `group-msg-receive` / `group-msg-reject` | 群主打开 / 关闭"接收消息"；crack 的事件名 |
| `C2C_MSG_RECEIVE` | — | 只记被动回复（可以 `event_id` 回复它） |
| `FRIEND_ADD` / `FRIEND_DEL` | `friend-added` / `friend-deleted` | Satori 规范没有，名字取自 `@satorijs/protocol` 的 `EventName` |
| `GROUP_MEMBER_ADD` / `_UPDATE` / `_REMOVE` | `guild-member-added` / `-updated` / `-removed` | 要 `GROUP_MEMBER_EVENT` |
| `GROUP_JOIN_REQUEST` | `guild-member-request` | `message.id` 是 `join_request_id`、`content` 是验证消息或问答；`bot.handleGuildMemberRequest(messageId, approve, comment)` 回复（记着申请来自哪个群、谁，最多 1000 条；`internal.getJoinRequestList` 拉到的也记） |
| `INTERACTION_CREATE` | `interaction/button` | `button: { id, data }`；回 `PUT /interactions/{d.id}`，不然按钮一直转圈。没有 `data.resolved` 的不发；`chat_type` 3 的按频道 ID 路由 |

频道（仍由 `qq` bot 分发，资源 ID 带 `qqguild:` 前缀）：

| 官方事件 | Satori 事件 | 说明 |
|---|---|---|
| `AT_MESSAGE_CREATE` / `MESSAGE_CREATE` / `DIRECT_MESSAGE_CREATE` | `message-created` | `<@!id>` 转 at，@ 机器人（READY 里 bot 的 user id）转 `at(AppID)`；附件图片补 `https://`；`message_reference` 转 quote。私域机器人订了 `GUILD_MESSAGES` 时跳过 `AT_MESSAGE_CREATE` / `PUBLIC_MESSAGE_DELETE`（重复） |
| `MESSAGE_DELETE` / `PUBLIC_MESSAGE_DELETE` / `DIRECT_MESSAGE_DELETE` | `message-deleted` | `operator` 是撤回的人 |
| `MESSAGE_REACTION_ADD` / `_REMOVE` | `reaction-added` / `-removed` | `message.content` 是 `<表情类型>:<表情 id>`，只报消息上的表态 |
| `CHANNEL_CREATE` / `_UPDATE` / `_DELETE` | `channel-added` / `-updated` / `-deleted` | |
| `GUILD_CREATE` / `_UPDATE` / `_DELETE` | `guild-added` / `-updated` / `-deleted` | |
| `GUILD_MEMBER_ADD` / `_UPDATE` / `_REMOVE` | `guild-member-added` / `-updated` / `-removed` | crack 写的 `GUILD_MEMBER_DELETE` 也认 |
| 论坛、音频、音视频子频道成员 | — | 只有 internal 事件（crack 也不解码） |

- **id**：`qq` 的 `selfId` = AppID。群和单聊的用户 id 用 `author.member_openid`（群）/ `user_openid`（单聊），实测和 `author.id` 相同，同一个 app 下跨群不变。头像 `https://q.qlogo.cn/qqapp/<appid>/<openid>/640`。频道私信：guild `<来源频道>_<私信频道>`、channel `<私信频道>_<子频道>`（同 Koishi）
- **referrer**：群聊、单聊、频道消息的事件带 `referrer: { msg_id }`，`GROUP_ADD_ROBOT` / `GROUP_MSG_RECEIVE` / `FRIEND_ADD` / 互动带 `{ event_id }`。`session.send()` / `reply()` 和 Satori 客户端的 `message.create` 把它带回来，发送时优先回复它（§6 选目标）
- **@ 自己归一**：平台用 bot 的 openid 表示 @ 它，而 `selfId` 是 AppID，不归一的话 `dispatch` 的回声判断和插件的 @ 前缀匹配都会失效。`mentions[]` 里 `is_you: true` 的那项就是 bot，第一次见到就记下它的 openid（`botOpenid`，`/users/@me` 的 `union_openid` 兜底），之后没带 `is_you` 的 `<@botOpenid>` 也认。不在 `mentions` 里的 `<@xxx>` 当普通文本
- **附件**：`image/*` → `img`（带宽高），`voice` → `audio`（优先用平台转好的 `voice_wav_url`，原文件是 silk），`video/*` → `video`，其余 → `file`（`title` 是文件名）。url 可能不带协议，补 `https://`
- **QQ 表情** → `face`（和 NT 的同一套 id）：群、单聊的 content 里是 `<faceType=1,faceId="13",ext="…">`，`ext` 是 `{"text":"[呲牙]"}` 的 base64，名字去掉方括号放进 `name`（有的不带方括号，有的没有 `ext`）。这个格式官方文档没写，来自别的项目的实测（Diana、Eve.aic、dsh-im 的 PR），crack 也不解析。频道是官方文档写的 `<emoji:id>`
- **引用**：`message_type` 103 或 `message_scene.ext` 里有 `ref_msg_idx=...`。被引用的消息在 `msg_elements[0]`，content 是平台渲染好的文本（`=== 消息 1 ===` / `[消息内容] ...`），取 `[消息内容]` 那段。`quote` 的 id 尽量换成消息 id（见 §6 的引用索引），换不到就用 `REFIDX_`
- **去重**：同一条消息平台可能推两次，按消息 id 去重（顺带用被动回复的记账表）
- 卡片（`message_type` 3，`ark_data`）、聊天记录（102）暂不解析

## 6. 发消息

- `POST /v2/groups/{group_openid}/messages`、`/v2/users/{openid}/messages`；`msg_type` 0 文本 / 2 markdown / 3 ark / 7 富媒体。返回 `{ id, timestamp, ext_info: { ref_idx } }`，要审核时返回 `{ audit_id }`
- **@**：群里 @ 某人只在 markdown 里渲染（官方"文本交互"文档；2026-10-31 实测纯文本里 `<qqbot-at-user />` 原样显示），所以消息改成 markdown，写 `<qqbot-at-user id="openid" />`，实测是真的 @。`useMarkdownIfAt` 关掉时写纯文本"@名字"（`name` 属性或用户名缓存，都没有就丢掉），对方收不到提醒。@全体 `<qqbot-at-everyone />` 文本和 markdown 都行（2026-10-26 起，要 bot 是群管理，每群每天一次），不用改 markdown。旧的 `<@openid>` / `@everyone` 官方标了即将弃用，`<@!openid>` 平台已经不认。单聊里的 @ 退化成 `@名字`
- **一条消息最多一个媒体**，媒体显示在文字上面：媒体之前的文字先单独发一条，媒体和它后面的文字合成一条（`msg_type` 7 + `content`）；视频、语音、文件不带文字，单独发。媒体只带得了纯文字：后面跟着 markdown、按钮或 `<qqbot-at-everyone />` 时，媒体单独发一条，后面的另发
- **markdown 转义**（2026-10-31 实测）：QQ 不认反斜杠转义（`\[` 原样显示），HTML 实体显示成原字符、不当语法（`&#42;&#42;x&#42;&#42;` 显示 `**x**`）。所以 `` * _ ~ ` [ ] # $ < > & `` 写成实体，`- + =` 和 `1.` / `1)` 只在行首写成实体（列表、分割线、标题下划线）；构不成语法的符号（`a-b`、括号、`!`）原样。实体后面紧跟的空格会被吃掉（`&#32;`、两个空格也一样），`&nbsp;` 不会，所以那个空格写成 `&nbsp;`（副作用：那里不能折行，长行折行时符号可能挤到下一行开头；零宽字符加空格也保得住空格、能折行，但复制出来的文字会带上看不见的字符，没用）。零宽字符隔不开 `**`（星号被当成斜体吃掉）。消息改成 markdown 时平台渲染的标签（`<qqbot-at-user />`、`<qqbot-at-everyone />`、`<@id>`、`<#id>`、`<emoji:id>`）原样保留（`textToMarkdown()`）
- **markdown 的换行**（2026-10-31 实测）：单个换行就另起一行，和空一行、行尾两空格一样带段距；`<br>` 是紧凑换行；正文后面直接接列表能识别
- **富媒体上传**（`/v2/groups|users/{id}/files`，返回的 `file_info` 原样填进 `media`）：
  - http(s) URL 交给平台去下载 `{ file_type, url, srv_send_msg: false }`；平台下载失败（850026）时改为自己下载后传字节
  - 其余（`data:` / `base64://` / `file://` / 本地路径）读成字节：≤ 5 MB 用 `file_data`（base64），更大的走分片：`upload_prepare`（md5 / sha1 / 前 10002432 字节的 md5）→ 逐块 PUT 到预签名 URL → `upload_part_finish`（40093001 在 `retry_timeout` 内重试）→ 带 `upload_id` 调 `/files`。crack 对所有本地文件都走分片
  - `file_type`：1 图片（png / jpg）、2 视频（mp4）、3 语音（只收 silk：wav 直接用 silk-wasm 编，其它格式经 ffmpeg）、4 文件
  - 群的文件只能发群，用户的只能发用户
- **引用**：`message_reference.message_id` 要的是 `REFIDX_...` 索引，不是消息 id。收到的消息从 `message_scene.ext` 的 `msg_idx=` 取，自己发的从返回的 `ext_info.ref_idx` 取，记在 `PassiveReplies.refs`（2000 条、1 小时）
- `deleteMessage`：`DELETE /v2/groups/{gid}/messages/{id}`、`/v2/users/{openid}/messages/{id}`

### 平台元素（crack 的写法）

| 元素 | 发出去 |
|---|---|
| `<markdown>` 文本 / `h('markdown', { content })` | 消息改成 markdown，之前的文字转义；`stream` 属性同 `qq:rawmarkdown`。内联的 `![](data:image/...)` 拆出来先上传、单独发（之后的文字另起一条，crack 如此） |
| `<button>` / `<qq:button>` | 消息改成 markdown 并带 keyboard，每行最多 5 个。Satori 写法：`text`、`href`、`type`：`link` 跳转（0）；`action` 回调（1，`data` 默认取 `id`，同上游 `@satorijs/adapter-qq`；crack 把它也当指令按钮，2026-10-30 改了）；其余（`input`、没写）是指令按钮（2，点了直接发出 `data`，默认 `text` 或按钮上的字），crack 如此。平台写法：`render_data`、`action`、`permission`、`group_id` 原样合进去 |
| `<button-group>` | 另起一行按钮 |
| `<qq:ark24>` / `<qq:ark23>` / `<qq:ark37>` / `<qq:ark>` | ark 模板 24（图文）、23（列表）、37（大图），或整个 `ark`；单独一条 |
| `<qq:json id>` | 只有按钮模板（`keyboard.id`）的 markdown 消息 |
| `<qq:markdown>` | markdown 模板（`custom_template_id` + `params`），可带 `keyboard` |
| `<qq:rawmarkdown>` / `<qq:rawmarkdown-without-keyboard>` | 原生 markdown，前者可带 `keyboard` |
| `<passive messageId seq eventId>` | 指定这次回复挂在哪条消息 / 事件上 |
| `<card title url desc image prompt>` | 中立层的卡片（plugin-system.md"扩展元素和降级"）。群聊、单聊发成 markdown（ark 要申请，没权限是 `40034126 无ark模板权限`）：加粗的标题（有 `url` 是链接）、描述、网络图片 `![标题 #宽px #高px](url)`（宽高下载图片读出来，10 秒内读不到就不写），每样一行，跟前后的文字合成一条；本地 / `data:` 图片放不进 markdown，跟在后面单独发一张。频道是 ark：有 `image` 是 24（`#SUBTITLE#` 用链接的域名），没有是只有一项的 23（描述带链接），缺 `title` 或 `url` 就发它的降级内容，单独一条 |
| `<face id>` | 频道写成 `<emoji:id>`；群和单聊发表情官方没写，不声明 `message.face`，中立层先降级成 `[名字]` |

- 最后一段 `<p>` 留下的换行在发送前去掉（`dropParagraphBreak()`，NT 的编码器也是这样）：中立层的降级内容全是段落，不去掉每条消息会多一个空行

- **流式**：一段流的片是 `<markdown stream>`（`stream` 为 `true` 的平台载荷同理），或 `autoStreamText` 勾了的会话里的纯文本回复（没有 markdown、按钮、媒体、平台载荷，转义后当 markdown 发）；`<markdown stream="end">` 是最后一片。按回复的那条消息 / 事件记（crack 按 Koishi 会话记）。最后一片发出 `STREAM_IDLE`（10 秒）后还没新片就自动结束；一段流开着时同一条消息上要发普通消息，先结束这段流
  - 单聊：照 crack 在 `/messages` 上带 `stream: { state, id, index }`，第一片不带 `id`，之后带第一片返回的消息 id、index + 1，结束片 `state: 10`；自动结束补一个内容是空格的结束片。2026-10-31 实测：6 片都接在一个气泡里、返回同一个消息 id，所以第二片起只加 `msg_seq` 不计回复次数（单聊每条消息 4 次也够长流用）；不结束的流气泡末尾一直挂着"生成中"的点。官方文档已经不写这个字段了，单聊另有 `POST /v2/users/{openid}/stream_messages`（2026-07：`input_mode` append / replace、`input_state` 1 / 10、`index`、`stream_msg_id`、整段流同一个 `msg_seq`、返回 `remain_msg_len`），同样实测能用，暂时没换
  - 群聊：没有流式（实测每片各成一条消息）。各片攒在 `StreamStates` 里不发，结束时合成一条 markdown 发出，只占一次回复；攒着的那几次 `send()` 返回没有 id 的资源
  - 频道只有勾了 `autoStreamText` 的 `guild` 才带 `stream`（官方没写频道支持），没有攒片和自动结束
- **重试**：`retryWhen` 里的错误码重试一次（频道只对 URL 图片：改成自己下载后 multipart 重发）
- **审核**：返回 `audit_id`（频道是 `code` 304023 + `data.message_audit.audit_id`）且订了 `MESSAGE_AUDIT` 时，等 `MESSAGE_AUDIT_PASS` 拿真正的消息 id，`_REJECT` 或 5 分钟没结果就返回没有 id 的资源

### 被动回复（全部在适配器里，SDK 不改）

主动消息（没有可回复的消息时直接发）能发，但有额度和开关（2026-10 的官方文档，owner 确认能发）：单聊、群聊每个对象每月 4 条，用户要开着「允许主动发送」、群主要允许机器人主动发言，超额或没开就发送失败。单聊另有 `is_wakeup` 互动召回（用户说过话后 30 天内，按 当天 / 1~3 天 / 3~7 天 / 7~30 天 每段一条）。官方文档同一页还留着"2025-04-21 起不再提供主动推送"的旧说明，两种说法并存。所以能回复时尽量**被动回复**，不占额度：带 `msg_id`（回复一条收到的消息）或 `event_id`（回复一个事件，支持 `GROUP_ADD_ROBOT` / `GROUP_MSG_RECEIVE` / `FRIEND_ADD` / `C2C_MSG_RECEIVE` / `INTERACTION_CREATE`，取的是事件信封最外层的 `id`）。

- **限额**：群 5 分钟内最多回 5 次，单聊 60 分钟内最多 4 次，频道 5 分钟内不计次数（crack 如此）。窗口从消息的 `timestamp` 起算（不是本地收到的时刻），留 10 秒余量
- **msg_seq 按 msg_id 计数**，从 1 开始，同一个 `msg_id` + `msg_seq` 重复会被去重（40054005）。按频道计数不行：引用一条旧消息的同时群里来了新消息，就会张冠李戴。频道消息不带 `msg_seq`
- **选目标**：`<passive>` 指定的优先；然后发送带的 `referrer` 指的消息 / 事件（`session.send()` / `reply()` 带上触发它的那条，§5）；然后 quote；都没有（插件直接调 `bot.sendMessage`）就回复该频道最近一条还能回复的消息 / 事件。流的片优先接在开着这段流的那条消息上，回复次数用完了也接（单聊）；指名了别的消息就不去接别人的流。2026-10-31 实测以前只按"最近一条"选时，同一私聊里两段流同时进行会串成一段
- **失败处理**：40054005 → `msg_seq` + 1 重发；304103 / 40034005 / 40034024~40034027 / 40034128（过期、用完、无效）→ 这个目标作废，换下一个还能回复的，都没有就作为主动消息发（多半被 40034105 拒，除非群开了主动消息）。最多试 3 次
- 富媒体不能回复事件（crack 的经验），带 `event_id` 的媒体消息会去掉 `event_id` 按主动消息发
- 不自动用 `is_wakeup`：它消耗用户的召回额度，得由插件显式决定（目前 SDK 表达不了）

### 频道发消息

- 子频道 `POST /channels/{channel_id}/messages`，频道私信 `POST /dms/{私信频道}/messages`（channel id `_` 前的部分）。`sendPrivateMessage(userId, content, { guildId })` 先 `POST /users/@me/dms` 建私信会话
- 文字 `content`；markdown / 按钮同上，带 keyboard 时加 `bot_appid`；图片只收 `img`，一条一张、单独发：URL 填 `image`，本地文件 multipart 的 `file_image`；其它媒体忽略
- `<sharp id>` 写成 `<#id>`；@ 写 `<@id>`、`@everyone`

## 7. bot 的方法

- `features`：统一 bot 暴露全部目标的能力并集：`message.markdown` / `button` / `card`（markdown 写的）/ `face` / `stream` / `proactive` 和 `guild.plain`，没有 `message.forward`。`face` 在频道原生发送，群聊和单聊仍走降级；群聊的流式攒成一条，频道的流式、主动消息官方没写。
- 中立层（`packages/plugin-sdk` 的 `Bot`，可选方法）：`qq` 有 `getUser`（缓存 → 查询接口）、`getGuild` / `getChannel`（`GET /v2/groups/{id}/info` 的群名；`private:` 频道给用户名）、`getChannelList`、`getGuildMember` / `getGuildMemberList`（`/v2/groups/{id}/members`，`next_cursor` 翻页）、`kickGuildMember`（`batch_remove_members`，`permanent` 时加黑名单）、`muteGuildMember`（`restrict_chat_setting`：已禁言的 `update`、没有的 `add`、时长 0 `del`）、`handleGuildMemberRequest`、`createDirectChannel`、`deleteMessage`
- `qq` 另有 `refreshBotGroupState(groupId)`（机器人在群里的身份、能否主动发消息、收哪些消息，身份写进 `bot.user.role`）、`updateCommands(commands)`（§8）、`internal`
- 同一 bot 的频道方法（频道相关参数带 `qqguild:` 前缀，返回资源也带前缀）：`getGuildList` / `getGuild`、`getChannelList` / `getChannel` / `createChannel` / `updateChannel` / `deleteChannel`、`muteChannel`（QQ 没有子频道禁言，是整个频道 30 天）、`getChannelOnlineNums`、子频道的成员 / 身份组权限、上下麦和音频控制、`getGuildMemberList` / `getGuildMember` / `kickGuildMember` / `muteGuildMember`、表态 `createReaction` / `deleteReaction` / `getReactionList`（表情写成 `<类型>:<id>`）、`getMessage` / `deleteMessage`、`createDirectChannel`、`internal`
- 频道的 `message.id`、引用、`referrer`、`at` / `sharp` 也加资源前缀；发送前只在频道实现边界去掉，插件的 `bot/before-send` 仍看到同一个主 Bot 和完整的命名空间。机器人自己的用户 ID 始终是 AppID，角色 ID 和按钮 ID / data 保持原样；分页 `next` 是原始不透明游标，直接传回即可。频道私信的成员、频道信息查询使用来源频道，发送 / 删除使用私信会话；`getMessage` 只支持子频道，平台没有提供读取频道私信消息的接口。
- 频道的被动回复和流式状态与群聊 / C2C 分开保存，即使平台消息 ID 相同也不会互相占用、去重或串流。频道按钮回复使用事件的 `event_id`。只由主 Bot 发在线状态和同步插件指令菜单。
- `bot.internal`：合并群聊 / 单聊 / 频道的全部 REST 接口，方法名大多和 Koishi 一致；`sendMessage` / `deleteMessage` 保留群聊含义，频道版本是 `sendGuildMessage` / `deleteGuildMessage`。所有原始方法仍接收腾讯原始 ID；SDK 的 `internalOf(bot, 'qq')` 包含合并后的接口，不再有 `qqguild` 平台分支（`getJoinRequestList`、`approveJoinRequest`、`getGroupMemberBlacklist`、`createJoinApprovalStrategy`、`generateUrlLink`、`createPinsMessage`、`createSchedule`……，列表在 `internal.ts`）。参数：先按顺序填路径参数，再是 body（GET / DELETE 是 query），body 后可再跟 query

### Markdown 图片素材

官方[素材管理文档](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/material-management.html)支持将本地图片上传后，以 `qqbot-media://image/v1/...` 嵌入单条 Markdown。`bot.internal` 提供 `prepareMediaImage`、`completeMediaImage`、`getMediaImages`、`deleteMediaImage`，所有接口都使用当前机器人的凭证。流程为 prepare → PUT 预签名 URL（Content-Type 与 prepare 一致）→ complete（md5 使用 PUT 返回的 ETag）→ `session.send()` → 删除本次素材。`preview_url` 是临时查看链接，不能代替 Markdown 引用。

每张不超过 10 MB，支持 png/jpeg/gif/webp，最多 100 张；未引用的素材 90 天后过期。已发送消息有平台转存的副本，删除素材不会影响旧消息。动态预览应等发送完成后清理自己上传的素材；发送失败也应清理，不删除其他插件或用户上传的素材。直接传 `data:` 图片仍使用原来的拆分逻辑，需要单条 Markdown 的插件先调用素材接口。

## 8. 菜单

单聊菜单的 `privateSlash` / `privateMenu` 和群聊指令面板的 `groupSlash` / `groupPanels` 按 owner 2026-11-05 要求暂时从 UI 隐藏（schema `.hidden()`），现有配置和同步逻辑继续生效。

- `privateMenu`（最多 10 项：发送 / 链接 / 开关 / 子菜单，子菜单最多 5 项）READY 后同步到 `GET` / `PUT /v2/menu`，和平台上的一样就不写
- `groupPanels`（最多 20 项：指令 / 链接）同步成一个 `target_type: all` 的群聊面板：有就改，没有先删掉别的面板腾配额再建，多余的删掉。面板接口约 6.5 秒才能写一次，写操作排队；配额满（40030013）只记警告，已删（40030006）跳过
- `privateSlash` / `groupSlash` 打开时菜单改由 `bot.updateCommands(commands)` 提供：单聊菜单是一级指令，有子指令的做成子菜单；群聊面板只放一级指令。调用它的是指令系统（`builtin:commands`，见 plugin-system.md"中立层"）：bot 上线时、指令增删后（2 秒内合并）把不 hidden 的指令同步过来，和上次一样就不写
- crack 把同步过的指令存到 `menu-state-<appid>.json` 但从不读，没照搬

## 9. 没做的

- webhook（owner 决定只走 WebSocket）
- （已解决）纯官方进程原来没有数据库：`database` 在扫码协议条目里、按 QQ 号建库，依赖它的插件（如 keyword-reply）只在扫码账号登录后才跑。现在插件的 `database` 是实例级的 `builtin:database`，不等登录

## 10. 测试

- 单测 `test/unit/universal/qqofficial/`：
  - `decode` / `passive` / `elements` 纯函数；`internal` 路径参数和 query；`users` 落盘和查询接口；`menu` 菜单和面板的同步、写入间隔、配额错误、跟随指令；`api` 的 endpoint、沙箱、query、multipart
  - `gateway` 用本地 `ws` 服务器测 identify、心跳、resume、invalid session、致命关闭码、僵死重连、`gatewayUrl`、换域名
  - `plugin` / `features` 用假的 REST（`vi.stubGlobal('fetch')`）+ 本地网关：收消息、被动回复、去重重试、退回主动、媒体上传和回退、按钮回应、凭证错误让条目失败、`examples/plugins/echo`；markdown 和按钮（转义、换行、按钮组、平台字段）、ark 和各种平台载荷、markdown 里的 @、`data:` 图片拆分、`<passive>`、流式、`retryWhen`、审核等待、群成员和入群申请、禁言、群信息和成员、踢人、接收开关和 internal 事件、单 Bot 注册、频道 ID 隔离 / @ 消息 / 私信 / markdown / 图片 / 去重 / 表态和频道成员事件、没有按钮的互动、手动回应、菜单同步
  - `test/unit/bootstrap/builtins.test.ts` 验证没填凭证也能打开（条目 `failed`）、开着时只填一半存不进去、存好凭证后条目起来
  - 中立层扩展元素的共用用例（`test/unit/universal/crossPlatform.ts`）在 `features.test.ts` 里断言发成什么；频道的 `<emoji:id>` 收发、卡片缺字段时的降级也在那里
  - `features` 的统一身份回归：群聊和频道使用相同原始消息 ID 仍分别收到、回复；频道引用 / @ / 子频道链接的前缀往返；频道私信的创建 / 发送 / 删除与 C2C 分流；资源查询 / 管理 / 原始 API 路由；按钮事件被动回复；同一个注册指令在群聊和频道执行且忽略自己发的频道消息；本地 Satori WebSocket 的 READY 只有一个 `qq` login，群聊和频道事件共用它，外部 `message.create` 能按带前缀的频道 ID 回复。
- `examples/plugins/echo` 会先去掉开头对 bot 的 @：官方 bot 在群里只收得到 @ 它的消息
- 不登录 QQ 的 WebUI 端到端验证照 [plugin-system.md](plugin-system.md) 的方法即可。用假 AppID 启用会真的请求腾讯的 token 接口，返回 `[10004] 机器人不存在`，卡片显示失败原因
- **真机联调**：一个开放平台机器人加一个测试群。做法：
  - 起一个临时实例（独立目录，`--plugin-dir` 指向一个测试插件，WebUI / Satori 换非默认端口），`plugins.json` 里关掉 `builtin:nt-protocol`、开 `builtin:qq-official`。凭证从别处读进配置，不打印、不进仓库，测完连目录删掉
  - 测试插件按触发词跑一批发送，每一步的结果写进 jsonl。官方 bot 的 `debug`（隐藏选项）打开后，日志里有每次 API 调用的请求和响应（取 token 那次不记）
  - 每条触发消息群里只能被动回复 5 次、单聊 4 次，超了会退成主动消息（每月有额度）；一批别超，失败的发送也算一次。流的后续片不算（单聊）
  - 渲染效果只能看截图：日志只说明平台收下了
- **2026-10-31 真机实测**（群聊 + 单聊）：
  - 能用：token、网关（换到 `api.bot.qq.com` 的地址）、READY、跑满一小时被 4009 断开后 resume；群 @ 消息和单聊的收发；文字、markdown（加粗、斜体、删除线、代码、列表都渲染）、按钮（指令按钮点了以"@bot 文字"发进群，回调按钮来 `interaction/button`）、引用回复、markdown 里 @ 某人（真的 @）；网络图片、本地图片、语音（wav 转 silk）、视频、文件上传；纯文字里带网址；卡片的 markdown（标题加粗带链接、描述、图片各占一行，图片铺满气泡宽度）、带符号的文字原样显示；单聊流式、群里攒成一条、`stream="end"` 和 10 秒自动结束；只读接口（群信息、入群申请列表、禁言设置、菜单、面板、`getGatewayBot`）；外部 Satori 客户端看得到 `qq` login 和上面这些事件
  - 平台权限：ark 23 / 24 / 37 返回 `40034126 无ark模板权限`；群成员列表、群黑名单返回 `40012010 应用无接口访问权限`
  - 因此改掉的：纯文本里的 `<qqbot-at-user />` 原样显示（改成 markdown）；反斜杠转义原样显示、实体后的空格被吃（改成实体 + `&nbsp;`）；卡片的 ark 发不出（改成 markdown）；群里没有流式（攒成一条）；流不结束就一直挂着"生成中"（加 `stream="end"` 和空闲结束）；每片流都占回复次数（单聊不算）；同一频道两段回复同时进行会串（按 `referrer` 回复）
- **2026-11-05 真机订阅验证**：公域测试机器人使用与 crack 1.0.33 相同的 12 类默认订阅成功上线；这验证了该 AppID 能订阅这组事件，未验证每类事件的实际收发。后续按 owner 要求将原来的 `qq` / `qqguild` 双身份合并为一个 `qq` Bot

- **2026-11-12 素材接口真机验证**：使用现有官方机器人完成 prepare → PUT（Content-Type、ETag）→ complete → 查询 → 下载临时预览并校验 SHA-256 → delete → 再次查询确认移除。409,911 字节的 PNG 上传前后完全一致，返回有效的 `qqbot-media://image/v1/...` 引用。查询接口的 `total` 实际为数字字符串，类型兼容两种形式。单条 Markdown 的请求格式通过适配器测试验证，此次未做聊天端实际收发。

## 11. 未验证

- `GROUP_MEMBER_EVENT`、`INTERACTION` 对其他未申请权限的机器人是否也能订（当前测试 AppID 已验证能订）；频道的实际收发和管理功能，包括频道的 ark 卡片、`<emoji:id>` 收发和流式
- 审核流程、入群申请审批、禁言接口的真实返回（只测了只读接口）
- 富媒体回复事件是否真的不行（只有 crack 的经验）；带 `event_id` 的回复配 `msg_seq` 是否必要 / 允许（现在都带）
- `<qqbot-at-everyone />`（会提醒全群，没测）
- `GROUP_MESSAGE_CREATE`（全量群消息）的 `mentions` 是否真带 `is_you`；`GROUP_AT_MESSAGE_CREATE` 里 @ 了别人时，那些 @ 在 content 里的写法
- `<faceType=…>` 的格式和 `ext` 里名字带不带方括号（别的项目实测过，我们没有）；群和单聊能不能发表情、怎么写
- 官方文档里有、还没接的：单聊 `msg_type` 6（输入中状态，`input_notify`）、`msg_type` 8（图文卡片 `card`，也许不用申请 ark）、`stream_messages` 新流式接口（实测能用）。素材接口的上传、查询和删除已真机验证，素材引用在聊天端的实际显示尚待验证。
