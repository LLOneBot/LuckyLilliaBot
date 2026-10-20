# LuckyLillia.Bot

## 文档索引

任务命中右列条件时，先读对应文档。

| 文档 | 什么时候必读 |
|---|---|
| [docs/plugin-system.md](docs/plugin-system.md) | 改 `src/plugin/`、`data/plugins.json` 格式、插件热重载 / 模块解析、`vite.config.ts` 的 external、`packages/plugin-sdk` |
| [docs/plugin-authoring.md](docs/plugin-authoring.md) | 写或排查插件（`examples/plugins/` 或用户插件），改插件对外约定 |
| [docs/cordis-upgrade-notes.md](docs/cordis-upgrade-notes.md) | 升级 cordis / `@cordisjs/*`，或碰到 fiber 状态、`ctx.parallel` 报错、`ctx.plugin()` 返回值、配置校验时机等 cordis 行为问题 |
