# 官方 QQ bot 适配器

> 让 bot 支持 QQ 开放平台官方机器人:它用 appid/secret 自带登录,不走 PMHQ 或直连协议,作为**中立层的第二个消息源**接入,现有插件(echo、keyword-reply)不用改就能在它上面跑。
>
> 本文是设计,尚未实施。基线 `feat/plugin-system @ c8236196`。相关:[core-pluginization.md](core-pluginization.md)(让"纯官方 bot 进程"能启动)、[config-storage.md](config-storage.md)(插件 entry 配置)。

## 1. 定位

官方 bot 只实现一个 `Bot`,通过 `ctx.bots.register()` + `dispatch()` 接入中立层,`sendMessage` 必做、其余能力探测。它和现有扫码账号(NT,`platform='llonebot'`)独立:

- **不走** `qqProtocol` / `account` / `selfInfo.uin` / session——它只有 appid 和 openid,没有 uin,无法实现 `ntMsgApi`/`ntFileApi`。硬塞进现有登录框架 = 给这些造假值,上层全线踩雷。
- **绝不喂假 uin 进 `account`**。`account` 的 check 以 NT 登录为准;NT 专属消费者(WebQQ、Satori server 的 `platform !== 'llonebot'` 守卫、OB11/Milky 只订阅 `nt/*`)天然看不到官方 bot,这是正确隔离。

## 2. 对参考实现(crack 插件)的取舍

`koishi-plugin-adapter-qq-crack` 是官方 Koishi adapter 的魔改版,**仍用官方 appid+secret 走官方网关,没有破解鉴权**。所谓 "crack" 是在协议边界内 + 蹭灰度能力 + 一个第三方服务,把官方 bot "残废"的地方补齐:

| crack 的做法 | 我们取舍 |
|---|---|
| openid 不透明 → 打第三方站点 `oiapi.net` 反查真实昵称 | **不抄**。最灰、依赖不受控外部服务。靠事件自带的 `author.username`,头像用官方 `q.qlogo.cn/qqapp/<appid>/<openid>/640` |
| 全量群消息(不只被 @) | 蹭腾讯灰度/申请制 intent,接口接上能收就收,**非破解**。默认不依赖 |
| 原生 markdown / 按钮 / ark | 需 appid 白名单,它只是拼对请求体。作为**默认关闭的增强项** |
| 分片上传富媒体 | 官方 v2 正规能力,采纳 |
| 鉴权、ws 网关、事件流、ed25519 验签 | 照官方正规做法 |

## 3. 落点与注册

新建 `src/universal/qqofficial/`(与 `ntqq/` 平级):`index.ts`(apply:new bot → register → 连接 → 收包转 Satori event → dispatch)、`bot.ts`(实现 `Bot`)、`encoder.ts`(`h[]` → 官方请求体,**不复用** NT 专用的 `src/satori/message.ts`)、`ws.ts`/`http.ts`、`types.ts`(intents 位掩码)、`passive.ts`(被动 id 表)、`utils.ts`(decode + at 归一)、`config.ts`。

**做成普通的可扫描插件包,不是 builtin**(对照挑错 HIGH-1):插件系统对 builtin 的处理是排他的——`index.ts` 里 builtin 恒报 `hasConfig:false`、插件页不渲染它的 schema 表单,`assertConfigurable()` 对 builtin 抛 `PluginForbiddenError`(`describe`/`updateConfig` 全封死),而且 builtin 配置被设计成读 `config_<uin>.json`(官方 bot 没 uin,正好掉进读不到的坑)。WebQQ 能当裸 builtin 是因为它**没有配置**。官方 bot 有配置,必须是普通插件包,entry config 才能落 `plugins.json`、schema 表单才在插件页生效。

## 4. platform / id 约定(绝不撞 llonebot)

| 字段 | 值 |
|---|---|
| `platform` | `'qq'`(群/C2C);频道子 bot 用 `'qqguild'` |
| `selfId` | AppID |
| `sid` | `qq:<appid>`——platform 不同,sid 必不撞 |

| 场景 | channelId | guildId | userId | channel.type |
|---|---|---|---|---|
| 群 | `group_openid` | `group_openid` | `member_openid` | TEXT |
| C2C | `private:<user_openid>` | — | `user_openid` | **DIRECT** |
| 频道子频道 | `channel_id` | `guild_id` | author openid | TEXT |
| 频道私信 | `${guild_id}_${channel_id}` | `guild_id` | author openid | **DIRECT** |

C2C/频道私信必须填 `Channel.Type.DIRECT`,否则 `Session.isDirect` 判错。`private:` 前缀与 NT 同名但不串(platform 已分流,各自 encoder 各自解析)。

## 5. 登录 + 传输

**鉴权**:`POST https://bots.qq.com/app/getAppAccessToken` body `{appId, clientSecret}` → `{access_token, expires_in}`,头 `Authorization: QQBot <token>`,到期前 ~40s 用 `ctx.setTimeout` 重拉;沙箱时 endpoint 加 `sandbox.` 前缀。

**默认 WebSocket 网关,webhook 可选**:

- WS 是出站长连接,**无需公网/入站端口/反代**,自托管零门槛:`GET /gateway` → HELLO → IDENTIFY(带 intents、`shard:[0,1]`)/RESUME → 心跳(带最新 `s`、检测僵尸连接重连)→ READY 取 session_id 上线 → DISPATCH。
- webhook 三重拖累:(1) 腾讯只认回调端口 80/443/8080/8443,自托管常需反代,且 `WebuiServer` 的 `getAvailablePort` 占用时会**换端口**,回调 URL 会漂(发送时固定端口、不走 auto-shift);(2) 需 ed25519 验签(`op=13` 握手、`op=0` 验 `timestamp+rawBody`);(3) 要复用 `WebuiServer.route(prefix, handler, {public:true})`,而 WebUI **现在**硬 inject `qqProtocol`+`ntLoginApi`(对照挑错 LOW-5,比只提 qqProtocol 更深)——纯官方进程里 WebUI 起不来,webhook 随之挂。所以 webhook 依赖 core-pluginization 先把 WebUI 从 NT 解耦。

两通道 payload 结构一致,decode 层共用,只收包层分叉。intents(`Schema.bitset`):群@+C2C、交互、消息审核;频道加公域频道消息。全量群消息需腾讯灰度。

## 6. Bot 方法集 + 被动回复/配额

契约只有 `sendMessage` 硬约束,其余可选,**做不到的方法直接不定义**(插件 `if (bot.xxx)` 守卫自动跳过,不做"方法在却总失败"的假探测)。

| 方法 | 做? | 说明 |
|---|---|---|
| `sendMessage` | 必做 | 群/C2C/频道各自 endpoint;内部**先走** `ctx.bots.beforeSend(this, channelId, elements)`(对照 `ntqq/bot.ts`) |
| `sendPrivateMessage` | 做 | 转 `sendMessage('private:'+openid, ...)` |
| `deleteMessage` | 做 | DELETE |
| `getMessage` / `getUser` / `getGuildMember` / `muteGuildMember` / `kickGuildMember` / `createReaction`(群) | 默认不做 | 官方公开 API 不提供群成员枚举/历史/禁言踢人;openid 不透明。crack 用的端点合规性存疑,默认关闭 |

**被动回复/配额全封在 adapter,SDK 不改、插件无感**(`SendOptions` 只有 `quote`,不足以表达 passive id)。`passive.ts`:

- `sendMessage` 内:窗口内 → 带 `msg_id`(事件触发时 `event_id`)+ `msg_seq`;超窗 → 丢 msg_id 退化为主动消息;冲突(`40054005`)→ seq+1 重试。
- **`msg_seq` 按实际使用的 `msg_id` 计数,不是按 channel**(对照挑错 MEDIUM-3:官方约束是同一 msg_id 下 seq 唯一;按 channel 计数时,显式 quote 一条旧消息 + 群里并发新消息刷新 channel,会张冠李戴触发 40054005)。表结构 `Map<msgId, {seq, ts}>` 带 TTL。
- **5 分钟窗口按事件自身的 timestamp 算,不是本地收包时刻**(对照挑错 MEDIUM-4:本地收包晚于消息时间,按收包算窗口偏长,边界上会用到已过期 msg_id 被静默拒)。
- **主动消息审核异步**:返回 `304023 + audit_id`,订阅了 `MESSAGE_AUDIT` 则 `await` `message-audit-pass` 拿真 id——**加超时 + 监听 `message-audit-reject` 兜底 resolve**(对照挑错 LOW-6:否则 `sendMessage` 可能永不 resolve;SDK 契约层说明审核中返回的 resource id 可能缺失,下游拿它去 delete/quote 会失败)。
- `Session.reply` 把 `messageId` 当 `quote` 传,官方侧 `quote` 既当引用又当 passive msg_id。

## 7. 事件 + 消息映射

`event(type, data)` 造 Satori wire 信封(照 `ntqq/bot.ts`),`self_id`/`platform` 填官方自己的值;`message.content` **必须是 Satori markup 串**(Session 要 `h.parse`)。

| 官方事件 | type |
|---|---|
| `GROUP_AT_MESSAGE_CREATE` / `GROUP_MESSAGE_CREATE`(灰度) / `C2C_MESSAGE_CREATE` | message-created |
| 频道 `AT_/MESSAGE_CREATE` / `DIRECT_MESSAGE_CREATE` | message-created(qqguild 子 bot) |
| `INTERACTION_CREATE` | interaction/button(必须 ack `PUT /interactions/{id}`) |
| `GROUP_ADD_/DEL_ROBOT` / `FRIEND_ADD/DEL` | guild-added/removed、friend-added/deleted |
| `MESSAGE_AUDIT_PASS/REJECT` | 内部事件,补主动消息 id |

**at 自己归一(关键坑)**:官方下发 @ 用的是**机器人 openid**,而 `selfId=appid`,两者不一致。decode 时必须把 `at(botOpenid)` 替换成 `at(selfId)`(botOpenid 从 `mentions[].is_you` 或 `getMe().union_openid` 解析),否则 `dispatch` 的回声判断(`userId !== selfId`)和指令前缀匹配全废。

**encoder**:只复用 `@satorijs/element` 的 `h.normalize` + 递归遍历骨架,叶子全重写:`text`→content;图片/音视频/文件→两步上传(`POST .../files` 拿 `file_info` → `msg_type=7` MEDIA,大文件可选分片);语音须 silk(复用项目现有 silk 设施);markdown/ark/button 需白名单。**初版只做 text + image。**

## 8. 配置

走 `plugins.json` 的插件 entry config(全局、与 uin 无关),WebUI schemastery 表单直接改——这也是 §3 必须做成普通插件包的原因。字段:`appId`(required)、`secret`、`type`(public/private)、`intents`、`protocol`(websocket/webhook)、`sandbox`、`endpoint`、`path`(webhook,不在 `/api` 下)。多 appid = 多 entry,sid 各异。

## 9. 启动 / 身份

- `selfId=appid`,可选 `GET users/@me` 拿 `union_openid` 当 `selfOpenid`。WS 收 READY 后 / webhook 握手通过后 `bot.status=ONLINE` + `ctx.parallel('bot/status', bot)`。无 uin、无扫码、无 session。
- **同进程并存(NT 账号 + 官方 bot):开箱可行,零改动**——插件平级,platform/sid 不撞。
- **纯官方 bot 进程(无扫码账号):依赖 [core-pluginization.md](core-pluginization.md)**——现在 `main.ts` 无条件起 NT 栈、WebUI 硬 inject NT,纯官方进程起不来。那份设计把协议层/account/WebUI 解耦后,纯官方进程 = 停用 NT 协议条目 + 启用本插件。

## 10. 能力缺口(诚实暴露)

无群成员列表/历史/禁言踢人 → 对应可选方法不定义;openid-only → `getUser` 不实现,昵称靠事件白送;主动消息异步审核 → id 可能占位;被动窗口/次数用尽 → 退化主动(受配额,可能静默丢)。`src/satori/adapter.ts` 守 `platform !== 'llonebot'` → 官方 bot 会话不流向 Satori 协议客户端(对插件链无影响,插件走 `bot/message`);要让 Satori 下游也看到官方 bot 须改成遍历 `ctx.bots`,列为后续。

## 11. 分步(每步可独立验证)

1. **骨架 + WS + 纯文本 MVP**:token 续期、IDENTIFY/心跳/READY、群@/C2C → dispatch、encoder 只 text + 被动 msg_id。**不碰 main.ts**。**MVP 只验 echo**(对照挑错 MEDIUM-2:`keyword-reply` 依赖 `database`,而 database 在账号门后且路径绑 uin,纯官方进程/登录前起不来,不是"零改动跑通")。
2. encoder 媒体(图片两步上传)。
3. 被动 id 表(`passive.ts`:按 msg_id 的 seq、按事件时间戳的窗口、审核超时)。
4. 事件补全(interaction + ack、friend/robot、at 自己归一)。
5. 配置 + 设置页(entry config schema)。
6. (可选) webhook:`WebuiServer.route(public)` + ed25519,依赖 core-pluginization 的 WebUI 解耦。
7. (可选) 纯官方进程:依赖 core-pluginization。
8. (可选,默认关) markdown/按钮/ark(白名单)、频道子 bot、全量群消息灰度。

粗估步骤 1-5 约 2-3 人天(SDK 零改动)。

## 12. Owner 决策 + 未验证项

**决策**:传输默认 WebSocket(webhook 留到步骤 6);先做"NT 账号旁挂官方 bot"同进程形态,纯官方进程另排;群禁言/踢人等 crack 端点默认关闭的实验项;openid→昵称不实现。

**需实测确认**(代码无法核实):被动回复次数上限的确切官方数字;群/C2C、全量群消息、原生 markdown/按钮当前审批门槛;webhook 是否已成新 bot 默认通道;内容/URL 报备白名单。
