# LuckyLillia.Bot

## 文档索引

任务命中右列条件时，先读对应文档。

| 文档 | 什么时候必读 |
|---|---|
| [docs/plugin-system.md](docs/plugin-system.md) | 改 `src/plugin/`、`src/universal/`、`src/main/builtins.ts` 或 `main.ts` 的装载顺序、适配器的启动 / 卸载（`[Service.init]` 返回的 disposer）、实例的 `plugins.json` 格式、插件热重载 / 模块解析、`vite.config.ts` 的 external、`packages/plugin-sdk`；改 `src/satori/event` / `src/satori/utils.ts` / `src/satori/message.ts`（中立层复用它们）；改 `WebuiServer.route()` 或 WebUI 路由的挂载方式（dashboard / email / WebQQ 后端）、插件前端扩展（`src/webui/FE/plugin-host/`、import map、`/plugin-webui` 文件路由）、内置插件的界面（各插件代码旁的 `client/`、`plugin-host/builtins.tsx` 怎么找到它们、SDK 运行时 `plugin-host/sdk.tsx` 的 `usePluginConfig` / `SchemaSettings` 等，以及 WebQQ 为什么还在 WebUI 里）、`/api/plugins`、`src/webui/FE/components/plugins/`（含 schemastery 表单渲染器、`role('host')`、secret 的清空）；不登录 QQ 做 WebUI 端到端验证 |
| [docs/plugin-authoring.md](docs/plugin-authoring.md) | 写或排查插件（`examples/plugins/` 或用户插件），包括插件的 WebUI 部分；改插件对外约定 |
| [docs/cordis-upgrade-notes.md](docs/cordis-upgrade-notes.md) | 升级 cordis / `@cordisjs/*`，或碰到 fiber 状态、`ctx.parallel` 报错、`ctx.plugin()` 返回值、配置校验时机等 cordis 行为问题 |
| [docs/core-pluginization.md](docs/core-pluginization.md) | 改 `main.ts` 启动结构、扫码协议条目 `builtin:nt-protocol`（`src/main/ntProtocol/`，协议层 / NT API / `account` / 登录后的数据库 Core Store）、NTQQ 的登录方式（纯协议 / 官方 QQ 端桥接、协议选择，`builtinConfig/ntProtocol.ts`、`common/utils/environment.ts` 的 `protocolPins` / `setProtocolSelection` / `lockProtocol`，`--pmhq-port` / `--protocol` / `PROTOCOL` / `LL_IPC_PIPE` 怎么锁定，`direct-lib/profiles`、`appInfo.ts` 的 profile 解析时机，`ntProtocol/client/LoginMethod.tsx`）、协议层的运行时停用清理（`QQProtocolBase.stop()`、共用的 `DirectProtocolClient`、auth token 监听）、`WebuiServer` 的 `static inject` / 扫码登录路由 / `ntProtocol` 标志、NTQQ 协议页（`src/main/ntProtocol/client/`：扫码 / 快速登录 / Auth Token / 退出登录）、登录后刷新整页（`stores/accountStore.ts` 的 `useAccountReload`）或主界面顶部的状态提示（`StatusNotices.tsx`、`/api/bots`），或碰 `Service.check` 与重连时必读 |
| [docs/config-storage.md](docs/config-storage.md) | 改 `ConfigService`（`patch()` / `LLBOT_*` 环境变量层 / 实例的 `settings.json`）、实例（`--instance` / `LLBOT_INSTANCE` / 实例锁 / `data/instances/` 目录布局）、旧配置的启动迁移（`config/migrate.ts`）、插件配置的存放与读写（`plugins.json`、rev/409、secret 打码）或插件数据目录（`ctx.storage`）、`src/common/jsonFile.ts` / 并发锁、内置适配器 / 邮件通知的配置（`src/main/builtinConfig/`）、WebUI 密码文件，或评估多账号 / 多实例相关需求时必读 |
| [docs/card-message-sign.md](docs/card-message-sign.md) | 改卡片消息（音乐卡片、ark / OneBot `json` / Milky `light_app`）的发送或签名、`CARD_SIGN_URL` / `musicCardSignUrl`、`src/common/utils/sign.ts` / `musicCard.ts`、OIDB 0xb77 分享时必读 |
| [docs/official-qq-bot.md](docs/official-qq-bot.md) | 改 QQ 开放平台官方机器人适配器（`src/universal/qqofficial/`、内置条目 `builtin:qq-official`、设置页 `qqofficial/client/`）：token / WS 网关 / 事件解码 / 被动回复与 msg_seq / 富媒体上传 / 引用 / markdown、按钮、ark 等平台元素 / 频道（`qqguild`）/ 群管理和 `bot.internal` / 菜单和指令面板，对照 koishi-plugin-adapter-qq-crack 补功能，或往中立层加别的消息源、给 SDK 的 `Bot` 加可选方法时必读 |
