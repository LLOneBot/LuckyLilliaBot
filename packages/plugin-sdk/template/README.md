# {{name}}

{{description}}

一个 LuckyLillia Bot 插件。写法见 LuckyLillia Bot 仓库的 `docs/plugin-authoring.md`。

## 开发

```sh
npm install
npm test        # test/ 下的测试，用 @luckylillia/plugin-sdk/testing 跑，不用登录 QQ
npm run dev     # 边改边构建到 lib/
```

在 Bot 里试：启动 Bot 时加上 `--plugin-dir <本目录的上一级目录> --plugin-hmr`，再到 WebUI 的插件页启用它。`lib/` 一变，插件就重载。

## 发布

```sh
npm run build
npm publish
```

`package.json` 的 `keywords` 里有 `luckylillia-plugin`，WebUI 的插件市场靠它搜到这个插件。
