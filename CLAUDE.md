# LuckyLillia.Bot

## 文档索引

任务命中右列条件时，先读对应文档。

| 文档 | 什么时候必读 |
|---|---|
| [docs/plugin-system.md](docs/plugin-system.md) | 改 `src/plugin/`、`src/universal/`、`src/main/builtins.ts` 或 `main.ts` 的装载顺序、适配器的启动 / 卸载（`[Service.init]` 返回的 disposer）、`data/plugins.json` 格式、插件热重载 / 模块解析、`vite.config.ts` 的 external、`packages/plugin-sdk`；改 `src/satori/event` / `src/satori/utils.ts` / `src/satori/message.ts`（中立层复用它们）；改 `WebuiServer.route()` 或 WebUI 路由的挂载方式（dashboard / email / WebQQ 后端）、插件前端扩展（`src/webui/FE/plugin-host/`、import map、`/plugin-webui` 文件路由）、`/api/plugins`、`src/webui/FE/components/plugins/`（含 schemastery 表单渲染器）；不登录 QQ 做 WebUI 端到端验证 |
| [docs/plugin-authoring.md](docs/plugin-authoring.md) | 写或排查插件（`examples/plugins/` 或用户插件），包括插件的 WebUI 部分；改插件对外约定 |
| [docs/cordis-upgrade-notes.md](docs/cordis-upgrade-notes.md) | 升级 cordis / `@cordisjs/*`，或碰到 fiber 状态、`ctx.parallel` 报错、`ctx.plugin()` 返回值、配置校验时机等 cordis 行为问题 |
