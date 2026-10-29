# 官方 QQ bot 适配器

> QQ 开放平台（q.qq.com）的官方机器人：用 AppID + AppSecret 登录，不走 PMHQ 或直连协议，作为**中立层的第二个消息源**接入，现有插件（echo、keyword-reply）不用改就能在它上面跑。
>
> 已实施：内置插件 `builtin:qq-official`，代码在 `src/plugin/internal/protocol/qq-official/`。群聊、单聊（C2C）、频道（`qqguild` 子 bot）都做了，只走 WebSocket。功能对齐 `koishi-plugin-adapter-qq-crack` 1.0.32（官方 Koishi adapter 的魔改版，仍走官方 appid + secret，没有破解鉴权），webhook 除外。读 crack 源码：`npm pack koishi-plugin-adapter-qq-crack@<版本>` 解到临时目录（`D:\code\github.com\koishi-plugin-adapter-qq-crack` 的克隆停在 1.0.18，太旧）；频道消息的解析以上游 `@satorijs/adapter-qq` 的 `decodeMessage` 为准。

## 1. 定位

官方 bot 实现两个 `Bot`，经 `ctx.bots.register()` / `dispatch()` / `beforeSend()` 接入中立层，和扫码账号（NT，`platform='llonebot'`）互相独立：

- `qq`（`QQOfficialBot`，sid `qq:<AppID>`）：群聊、单聊、机器人自身的事件
- `qqguild`（`QQGuildBot`，sid `qqguild:<AppID>`）：频道。像 Koishi 的 QQ 适配器一样单列一个平台，频道的 id、成员、消息和群毫无关系。**订阅了任一频道事件才注册**，状态跟着 `qq` 走；`private:` 频道交还给 `qq`
- **不走** `qqProtocol` / `account` / `selfInfo.uin` / session。它只有 appid 和 openid，没有 uin，实现不了 `ntMsgApi` / `ntFileApi`
- **绝不喂假 uin 进 `account`**。NT 专属的消费者（WebQQ、Satori server 的 `platform !== 'llonebot'` 守卫、只订阅 `nt/*` 的 OB11 / Milky）天然看不到官方 bot，这是正确的隔离
- `inject` 只有 `bots` + `timer`，不等扫码登录，启动就连。扫码协议也是插件（`builtin:nt-protocol`，见 [core-pluginization.md](core-pluginization.md)），两个开关独立：只开扫码、只开官方机器人、两个都开，在插件页切换即可，运行时立即生效

## 2. Owner 决策

- **只走 WebSocket，不做 webhook**。webhook 要 HTTPS 公网回调（端口只能 80 / 443 / 8080 / 8443），还要 ed25519 验签；WS 是出站长连接，自托管零门槛。腾讯 2024 年说过要下线 WS，但到 2026-10 官方文档仍把两者并列，可在开放平台随时切换，单机自用推荐 WS
- **按 crack 实现它的全部功能**（2026-10-28 owner 要求，webhook 除外）。不要再以"没申请到权限""用的人少"为由砍功能：markdown 和消息按钮 2026-04 起已对所有机器人的单聊、群聊开放
- **内置插件，不是插件包**：原设计要求做成插件包，理由是 builtin 不能有设置、配置读 `config_<uin>.json`，这两条在 `BuiltinConfig` 和实例模型之后都不成立了。代价：内置插件只有一个条目，所以**一个实例只接一个 AppID**；要多个，以后要么改成 `bots` 数组，要么让内置插件支持多条目
- 和 crack 有意不同的地方：
  - 按 openid 查昵称的第三方接口（crack 默认打 `https://oiapi.net/api/Openid`）**默认关闭**，要在设置页填地址：它会把用户 openid 和 AppID 发给第三方。先查缓存，查不到才问接口（crack 是每个缺名字的事件都先问接口）
  - 用户名 crack 写进 Koishi 的用户表；这里写到插件数据目录的 `usernames-<AppID>.json`（`ctx.storage.dir()`，最多 2 万条，5 秒防抖）
  - 群里的 @ 默认还用纯文本的 `<qqbot-at-user />`；`useMarkdownIfAt` 打开才像 crack 那样把消息改成 markdown、写 `<@openid>`（crack 默认开）。改成 markdown 时会先转义已有的文本（crack 不转义）
  - `<a href>` 发出链接本身（crack 同；之前发的是链接文字）
  - crack 的频道消息解析丢了正文（`message.content` 没赋值就用），按上游 adapter-qq 修正
  - h() 会把属性名驼峰化（`render_data` → `renderData`），crack 只读下划线写法，所以它的 `qq:button` 的 `render_data`、`qq:markdown` 的 `custom_template_id` 写在顶层属性时其实不生效；这里两种写法都认
  - `INTERACTION_CREATE` 没有 `data.resolved`（不是按钮 / 菜单类的互动）时只发 internal 事件；crack 会读空字段抛错
  - 频道的互动事件（`chat_type` 3）交给 `qqguild`，回复才能发到子频道；crack 交给 `qq`
  - 频道收到的消息也记被动回复，所以插件主动 `sendMessage` 也会回复该子频道 5 分钟内最近的消息；crack 只在 `session.send()` 时回复触发的那条
  - 审核等待 5 分钟超时（crack 无限等）

## 3. 文件

| 文件 | 内容 |
|---|---|
| `index.ts` | 插件：AppID / AppSecret 没填就记一行 info 直接返回，什么都不连（卡片"待配置"，见下面 `config.ts`）；先取一次 token，凭证错让条目 `failed`，原因直接显示在卡片和设置页上；注册 bot（和 `qqguild`），起网关；每个事件先作为 internal 事件分发，再解码；`INTERACTION_CREATE` 回 `PUT /interactions/{id}`（`manualAcknowledge` 时不回）；审核结果交给 `Audits`；缺名字时问查询接口 |
| `api.ts` | REST：token 的获取与续期、`Authorization: QQBot <token>` + `X-Union-Appid`、401 换 token 重试一次、错误码解析；`endpoint` / 沙箱前缀、query 参数、multipart、调试日志 |
| `gateway.ts` | WS 网关：identify / resume、心跳、断线重连；`gatewayUrl` 覆盖、把平台网关换到 API 的域名上、调试日志；事件处理抛错只记日志 |
| `bot.ts` | `QQOfficialBot` / `QQGuildBot`：信封、发消息、`deliver()` 选被动回复目标、群 / 频道管理方法、`Audits`（等审核结果） |
| `sender.ts` | `h[]` → 平台消息：`MessageSender`（群 / 单聊）、`GuildMessageSender`（子频道 / 频道私信），共用 markdown、按钮、平台载荷的处理 |
| `elements.ts` | 平台元素：`qq:ark*`、`qq:json` / `qq:markdown` / `qq:rawmarkdown*` 的解析，按钮转换，markdown 转义，markdown 里的 `data:` 图片拆分 |
| `media.ts` | 富媒体上传：URL、`file_data`、分片；语音转 silk |
| `passive.ts` | 被动回复记账（群 / 单聊 / 频道）、`REFIDX_` 引用索引 |
| `stream.ts` | 流式回复的状态，按回复的目标记 |
| `decode.ts` | 网关事件 → Satori 事件：`decodeDispatch`（`qq`）、`decodeGuildDispatch`（`qqguild`） |
| `internal.ts` | 全部 REST 接口，按 Koishi QQ 适配器的方法名（`bot.internal`） |
| `menu.ts` | 单聊自定义菜单、群聊指令面板的同步 |
| `users.ts` | 用户名缓存和持久化、昵称查询接口 |
| `config.ts` | schema；设置规则在 `src/plugin/internal/protocol/qq-official/settings.ts`（开着时保存必须有 AppID / AppSecret；不声明 `checkOnEnable`，没填也能先在卡片上打开，启动也不报错，`notice` 让卡片显示"待配置 · 还没有填写 AppID 和 AppSecret"，主界面顶部也提示；到侧边栏出现的设置页填好保存，保存即重启条目；AppSecret 打码） |

WebUI 设置页（页面 id `qqofficial`）是插件自己的界面 `client/`，整页由 schema 渲染（SDK 的 `SchemaSettings`）：凭证、类型在最上面，"消息""单聊菜单和群聊指令面板"是两个 `sections`，菜单项是按 `type` 区分的联合，表单渲染成可切换的标签。订阅的事件 `role('qq-official-intents')` 由插件用 `ctx.field()` 注册的控件画（`client/IntentsField.tsx`：按群聊单聊 / 频道分组、每项写明带来哪些事件、顶部警告没权限的事件会被断开），插件界面没加载时退回通用的多选。原来的"进阶"（`endpoint`、`gatewayUrl`、`userInfoApi`、`disableUserNamePersist`、`debug`）按 owner 2026-10-28 的要求不在页面上：schema 里标了 `.hidden()`，照常生效（以前存过的值也还在用），要改只能直接编辑实例 `plugins.json` 里这个条目的 `config`。主界面顶部的"正在连接开放平台""没有连上开放平台"也是它自己的（`client/Notices.tsx`，放进 `notices` 插槽），缺 AppID 和运行出错由 WebUI 的通用规则说

## 4. 鉴权与网关

- **域名**：2026-08-10 起统一为 `api.bot.qq.com`，沙箱 `sandbox.api.bot.qq.com`（旧的 `api.sgroup.qq.com` / `bots.qq.com` 目前还通）。`endpoint` 可换成别的地址，沙箱在其域名前加 `sandbox.`（和 crack 一样）
- **token**：`POST https://api.bot.qq.com/app/getAppAccessToken` body `{ appId, clientSecret }` → `{ access_token, expires_in }`（`expires_in` 是数字字符串）。有效期内再要拿到的是同一个；最后 60 秒内再要会发新的，旧的在这 60 秒里仍有效。所以在到期前 50 秒续期。失败也是 HTTP 200，看 `code`：`10004` 机器人不存在、`100007` / `100016` AppID 或 secret 不对，这几个重试没用（`CredentialError`）
- **错误体**：`{ code, err_code, message, trace_id }`，`code` 是短码、`err_code` 是 8 位的业务码，判断用 `err_code ?? code`；trace id 也在响应头 `X-Tps-trace-ID`
- **网关**：`GET /gateway` 拿 `url`（`*.qq.com` 的地址把域名换成 API 的域名，crack 如此；`gatewayUrl` 设了就直接用）→ HELLO（`heartbeat_interval`）→ IDENTIFY `{ token: 'QQBot <token>', intents, shard: [0, 1] }`，有会话时 RESUME `{ token, session_id, seq }` → READY（`session_id`、bot 的 `user`）/ RESUMED。心跳 `{ op: 1, d: 最后的 s }`；上一个心跳到下一个心跳之间没收到 ACK 就判定僵死，`terminate()` 重连
- READY 之后取一次 `GET /users/@me`（名字、头像，`union_openid` 作为 bot openid 的后备），然后同步一次菜单（§8）
- **op 7**（服务端要求重连）→ 断开后 resume；**op 9**（会话无效）→ 清会话，重新 identify
- **关闭码**：4009 可 resume；4006 / 4007 / 4900~4913 只能 identify；4008（发得太快）至少等 10 秒；4004 当成 token 失效，换 token 后重连；4001 / 4002 / 4010~4014 / 4914（已下架，只能连沙箱）/ 4915（已封禁）不再重连。其余（含网络断开 1006）按 1 / 2 / 5 / 10 / 30 / 60 秒退避，连上并稳定 30 秒后重置
- **intents**（设置页全部可勾，默认只有 `GROUP_AND_C2C_EVENT`）：`GROUP_AND_C2C_EVENT` 1<<25、`GROUP_MEMBER_EVENT` 1<<24、`INTERACTION` 1<<26、`MESSAGE_AUDIT` 1<<27；频道 `GUILDS` 1<<0、`GUILD_MEMBERS` 1<<1、`GUILD_MESSAGES` 1<<9（私域）、`GUILD_MESSAGE_REACTIONS` 1<<10、`DIRECT_MESSAGE` 1<<12、`OPEN_FORUMS_EVENT` 1<<18、`AUDIO_OR_LIVE_CHANNEL_MEMBER` 1<<19、`FORUMS_EVENT` 1<<28（私域）、`AUDIO_ACTION` 1<<29、`PUBLIC_GUILD_MESSAGES` 1<<30。官方文档："除了 GUILDS、PUBLIC_GUILD_MESSAGES、GUILD_MEMBERS 事件是基础的事件"，其余要申请；订了没权限的会被 4013 / 4014 断开，所以默认不多订（crack 默认几乎全订）

## 5. 收消息

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
| `INTERACTION_CREATE` | `interaction/button` | `button: { id, data }`；回 `PUT /interactions/{d.id}`，不然按钮一直转圈。没有 `data.resolved` 的不发；`chat_type` 3 的发到 `qqguild` |

频道（`qqguild`）：

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
- **@ 自己归一**：平台用 bot 的 openid 表示 @ 它，而 `selfId` 是 AppID，不归一的话 `dispatch` 的回声判断和插件的 @ 前缀匹配都会失效。`mentions[]` 里 `is_you: true` 的那项就是 bot，第一次见到就记下它的 openid（`botOpenid`，`/users/@me` 的 `union_openid` 兜底），之后没带 `is_you` 的 `<@botOpenid>` 也认。不在 `mentions` 里的 `<@xxx>` 当普通文本
- **附件**：`image/*` → `img`（带宽高），`voice` → `audio`（优先用平台转好的 `voice_wav_url`，原文件是 silk），`video/*` → `video`，其余 → `file`（`title` 是文件名）。url 可能不带协议，补 `https://`
- **引用**：`message_type` 103 或 `message_scene.ext` 里有 `ref_msg_idx=...`。被引用的消息在 `msg_elements[0]`，content 是平台渲染好的文本（`=== 消息 1 ===` / `[消息内容] ...`），取 `[消息内容]` 那段。`quote` 的 id 尽量换成消息 id（见 §6 的引用索引），换不到就用 `REFIDX_`
- **去重**：同一条消息平台可能推两次，按消息 id 去重（顺带用被动回复的记账表）
- 卡片（`message_type` 3，`ark_data`）、聊天记录（102）暂不解析

## 6. 发消息

- `POST /v2/groups/{group_openid}/messages`、`/v2/users/{openid}/messages`；`msg_type` 0 文本 / 2 markdown / 3 ark / 7 富媒体。返回 `{ id, timestamp, ext_info: { ref_idx } }`，要审核时返回 `{ audit_id }`
- **@**：发送用 `<qqbot-at-user id="openid" />`，@全体 `<qqbot-at-everyone />`（2026-10-26 起，要 bot 是群管理，每群每天一次）。`useMarkdownIfAt` 时消息改 markdown，写 `<@openid>` / `@everyone`。旧的 `<@!openid>` 平台已经不认。单聊里的 @ 退化成 `@名字`
- **一条消息最多一个媒体**，媒体显示在文字上面：媒体之前的文字先单独发一条，媒体和它后面的文字合成一条（`msg_type` 7 + `content`）；视频、语音、文件不带文字，单独发
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
| `<button>` / `<qq:button>` | 消息改成 markdown 并带 keyboard，每行最多 5 个。Satori 写法：`text`、`type`（`link` 跳转、`input` 填入输入框、其余回调；没写 `type` 时是指令按钮 2，crack 如此）、`href`；平台写法：`render_data`、`action`、`permission`、`group_id` 原样合进去 |
| `<button-group>` | 另起一行按钮 |
| `<qq:ark24>` / `<qq:ark23>` / `<qq:ark37>` / `<qq:ark>` | ark 模板 24（图文）、23（列表）、37（大图），或整个 `ark`；单独一条 |
| `<qq:json id>` | 只有按钮模板（`keyboard.id`）的 markdown 消息 |
| `<qq:markdown>` | markdown 模板（`custom_template_id` + `params`），可带 `keyboard` |
| `<qq:rawmarkdown>` / `<qq:rawmarkdown-without-keyboard>` | 原生 markdown，前者可带 `keyboard` |
| `<passive messageId seq eventId>` | 指定这次回复挂在哪条消息 / 事件上 |

- **流式**（`autoStreamText` 勾了的会话类型）：没有 markdown、按钮、媒体、平台载荷的纯文本回复，转义后作为 markdown 带 `stream: { state: 1, id, index }` 发；对同一条消息的后续回复接着第一条的 id、index + 1。crack 按 Koishi 会话记，这里按回复的那条消息 / 事件记（中立层的 `send()` 不带会话）。平台载荷带 `stream: true` 也由这里填。频道只有勾了才带 `stream`（官方没写频道支持）
- **重试**：`retryWhen` 里的错误码重试一次（频道只对 URL 图片：改成自己下载后 multipart 重发）
- **审核**：返回 `audit_id`（频道是 `code` 304023 + `data.message_audit.audit_id`）且订了 `MESSAGE_AUDIT` 时，等 `MESSAGE_AUDIT_PASS` 拿真正的消息 id，`_REJECT` 或 5 分钟没结果就返回没有 id 的资源

### 被动回复（全部在适配器里，SDK 不改）

2025-04-21 起主动消息基本停了：单聊改成 `is_wakeup` 互动召回（用户说过话后 30 天内，按 当天 / 1~3 天 / 3~7 天 / 7~30 天 每段一条），群聊要群主在机器人设置里打开主动消息。所以机器人发的消息几乎都得是**被动回复**：带 `msg_id`（回复一条收到的消息）或 `event_id`（回复一个事件，支持 `GROUP_ADD_ROBOT` / `GROUP_MSG_RECEIVE` / `FRIEND_ADD` / `C2C_MSG_RECEIVE` / `INTERACTION_CREATE`，取的是事件信封最外层的 `id`）。

- **限额**：群 5 分钟内最多回 5 次，单聊 60 分钟内最多 4 次，频道 5 分钟内不计次数（crack 如此）。窗口从消息的 `timestamp` 起算（不是本地收到的时刻），留 10 秒余量
- **msg_seq 按 msg_id 计数**，从 1 开始，同一个 `msg_id` + `msg_seq` 重复会被去重（40054005）。按频道计数不行：引用一条旧消息的同时群里来了新消息，就会张冠李戴。频道消息不带 `msg_seq`
- **选目标**：`<passive>` 指定的优先；然后 `session.reply()` 把触发消息当 quote 传进来，优先回复它；`session.send()` 和没有 quote 的发送回复该频道最近一条还能回复的消息 / 事件。这样插件用 `send()` 也能发出去
- **失败处理**：40054005 → `msg_seq` + 1 重发；304103 / 40034005 / 40034024~40034027 / 40034128（过期、用完、无效）→ 这个目标作废，换下一个还能回复的，都没有就作为主动消息发（多半被 40034105 拒，除非群开了主动消息）。最多试 3 次
- 富媒体不能回复事件（crack 的经验），带 `event_id` 的媒体消息会去掉 `event_id` 按主动消息发
- 不自动用 `is_wakeup`：它消耗用户的召回额度，得由插件显式决定（目前 SDK 表达不了）

### 频道发消息

- 子频道 `POST /channels/{channel_id}/messages`，频道私信 `POST /dms/{私信频道}/messages`（channel id `_` 前的部分）。`sendPrivateMessage(userId, content, { guildId })` 先 `POST /users/@me/dms` 建私信会话
- 文字 `content`；markdown / 按钮同上，带 keyboard 时加 `bot_appid`；图片只收 `img`，一条一张、单独发：URL 填 `image`，本地文件 multipart 的 `file_image`；其它媒体忽略
- `<sharp id>` 写成 `<#id>`；@ 写 `<@id>`、`@everyone`

## 7. bot 的方法

- 中立层（`packages/plugin-sdk` 的 `Bot`，可选方法）：`qq` 有 `getUser`（缓存 → 查询接口）、`getGuild` / `getChannel`（`GET /v2/groups/{id}/info` 的群名；`private:` 频道给用户名）、`getChannelList`、`getGuildMember` / `getGuildMemberList`（`/v2/groups/{id}/members`，`next_cursor` 翻页）、`kickGuildMember`（`batch_remove_members`，`permanent` 时加黑名单）、`muteGuildMember`（`restrict_chat_setting`：已禁言的 `update`、没有的 `add`、时长 0 `del`）、`handleGuildMemberRequest`、`createDirectChannel`、`deleteMessage`
- `qq` 另有 `refreshBotGroupState(groupId)`（机器人在群里的身份、能否主动发消息、收哪些消息，身份写进 `bot.user.role`）、`updateCommands(commands)`（§8）、`internal`
- `qqguild`：`getGuildList` / `getGuild`、`getChannelList` / `getChannel` / `createChannel` / `updateChannel` / `deleteChannel`、`muteChannel`（QQ 没有子频道禁言，是整个频道 30 天）、`getChannelOnlineNums`、子频道的成员 / 身份组权限、上下麦和音频控制、`getGuildMemberList` / `getGuildMember` / `kickGuildMember` / `muteGuildMember`、表态 `createReaction` / `deleteReaction` / `getReactionList`（表情写成 `<类型>:<id>`）、`getMessage` / `deleteMessage`、`createDirectChannel`、`internal`
- `bot.internal`：全部 REST 接口，方法名和 Koishi 的一致（`getJoinRequestList`、`approveJoinRequest`、`getGroupMemberBlacklist`、`createJoinApprovalStrategy`、`generateUrlLink`、`createPinsMessage`、`createSchedule`……，列表在 `internal.ts`）。参数：先按顺序填路径参数，再是 body（GET / DELETE 是 query），body 后可再跟 query

## 8. 菜单

- `privateMenu`（最多 10 项：发送 / 链接 / 开关 / 子菜单，子菜单最多 5 项）READY 后同步到 `GET` / `PUT /v2/menu`，和平台上的一样就不写
- `groupPanels`（最多 20 项：指令 / 链接）同步成一个 `target_type: all` 的群聊面板：有就改，没有先删掉别的面板腾配额再建，多余的删掉。面板接口约 6.5 秒才能写一次，写操作排队；配额满（40030013）只记警告，已删（40030006）跳过
- `privateSlash` / `groupSlash` 打开时菜单改由 `bot.updateCommands(commands)` 提供（Koishi 是指令系统自动调用；这里没有指令系统，给有指令列表的插件用）：单聊菜单是一级指令，有子指令的做成子菜单；群聊面板只放一级指令
- crack 把同步过的指令存到 `menu-state-<appid>.json` 但从不读，没照搬

## 9. 没做的

- webhook（owner 决定只走 WebSocket）
- Satori 协议客户端看不到官方 bot 的会话：`src/plugin/internal/adapter/satori/adapter.ts` 只转发 `platform === 'llonebot'`。要看到得改成遍历 `ctx.bots`
- 纯官方进程里没有数据库：`database` 在扫码协议条目里、按 QQ 号建库，依赖它的插件（如 keyword-reply）只在扫码账号登录后才跑

## 10. 测试

- 单测 `test/unit/universal/qqofficial/`：
  - `decode` / `passive` / `elements` 纯函数；`internal` 路径参数和 query；`users` 落盘和查询接口；`menu` 菜单和面板的同步、写入间隔、配额错误、跟随指令；`api` 的 endpoint、沙箱、query、multipart
  - `gateway` 用本地 `ws` 服务器测 identify、心跳、resume、invalid session、致命关闭码、僵死重连、`gatewayUrl`、换域名
  - `plugin` / `features` 用假的 REST（`vi.stubGlobal('fetch')`）+ 本地网关：收消息、被动回复、去重重试、退回主动、媒体上传和回退、按钮回应、凭证错误让条目失败、`examples/plugins/echo`；markdown 和按钮（转义、换行、按钮组、平台字段）、ark 和各种平台载荷、markdown 里的 @、`data:` 图片拆分、`<passive>`、流式、`retryWhen`、审核等待、群成员和入群申请、禁言、群信息和成员、踢人、接收开关和 internal 事件、`qqguild` 的注册 / @ 消息 / 私信 / markdown / 图片 / 去重 / 表态和频道成员事件、没有按钮的互动、手动回应、菜单同步
  - `test/unit/bootstrap/builtins.test.ts` 验证没填凭证也能打开（条目 `failed`）、开着时只填一半存不进去、存好凭证后条目起来
- `examples/plugins/echo` 会先去掉开头对 bot 的 @：官方 bot 在群里只收得到 @ 它的消息
- 不登录 QQ 的 WebUI 端到端验证照 [plugin-system.md](plugin-system.md) 的方法即可。用假 AppID 启用会真的请求腾讯的 token 接口，返回 `[10004] 机器人不存在`，卡片显示失败原因
- **真机联调要一个开放平台机器人**（沙箱即可，沙箱群 / 沙箱用户在开放平台配置），用它确认：群 @ 和单聊的收发、引用、图片 / 语音 / 视频上传、全量群消息的 `mentions` 是否真带 `is_you`

## 11. 未验证（没有真机）

- 网关域名换成 `api.bot.qq.com` 后能否连上（照 crack 做的；不行就在设置页填 `gatewayUrl`）
- markdown、按钮、ark 的真实渲染；流式回复的实际效果（群聊有资料说不支持 `stream`）
- `GROUP_MEMBER_EVENT`、`INTERACTION` 不申请能不能订；频道的全部功能（没有频道机器人）
- 审核流程、菜单 / 面板接口、入群申请审批、禁言接口的真实返回
- 富媒体回复事件是否真的不行（只有 crack 的经验）
- 带 `event_id` 的回复配 `msg_seq` 是否必要 / 允许（现在都带）
- 群的 `<qqbot-at-user />` 是否也对纯文本（`msg_type` 0）生效：changelog 只明说了 `<qqbot-at-everyone />` 文本和 markdown 都能用
- `GROUP_AT_MESSAGE_CREATE` 里 @ 了别人时，那些 @ 在 content 里的写法
