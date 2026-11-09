# {{name}}

{{description}}

一个 LuckyLillia Bot 插件。写法见 LuckyLillia Bot 仓库的 `docs/plugin-authoring.md`。

## 开发

```sh
npm install     # 在 Bot 仓库里（比如 data/plugins/ 下）不用装，依赖用 Bot 仓库的
npm test        # test/ 下的测试，用 @luckylillia/plugin-sdk/testing 跑，不用登录 QQ
npm run dev     # 边改边构建到 lib/
```

在 Bot 里试：启动 Bot 时加上 `--plugin-hmr`（不在 Bot 的 `data/plugins/` 下时再加 `--plugin-dir <本目录的上一级目录>`），再到 WebUI 的插件页启用它。`lib/` 一变，插件就重载。

## 发布

```sh
npm run build
npm publish
```

发布后到 [LuckyLillia.Market](https://github.com/LLOneBot/LuckyLillia.Market) 提交「注册插件」Issue。包名和版本收录进 `@luckylillia/market` 目录后，WebUI 的插件市场才能找到并安装这个版本；`keywords` 不决定是否收录。
