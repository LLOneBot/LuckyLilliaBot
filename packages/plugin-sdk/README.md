# @luckylillia/plugin-sdk

编写 [LuckyLillia Bot](https://github.com/LLOneBot/LuckyLilliaBot) 插件用的 SDK。插件就是一个 [cordis](https://github.com/cordiverse/cordis) 插件，跑在 Bot 进程里。

```sh
npm i -D @luckylillia/plugin-sdk cordis schemastery @satorijs/element @satorijs/protocol
```

## 最小插件

`package.json`：有 `llbot` 字段的包才会被当成插件。

```json
{
  "name": "luckylillia-plugin-hello",
  "version": "1.0.0",
  "type": "module",
  "main": "lib/index.js",
  "peerDependencies": { "@luckylillia/plugin-sdk": "^1.0.0" },
  "llbot": { "description": { "zh": "打个招呼" }, "icon": "hand" }
}
```

`src/index.ts`：

```ts
import { Context, Schema } from '@luckylillia/plugin-sdk'

export const name = 'hello'
export const inject = ['timer']

export interface Config {
  text: string
}

// WebUI 会按这个 schema 自动生成配置表单
export const Config: Schema<Config> = Schema.object({
  text: Schema.string().default('hello').description('打印内容'),
})

export function apply(ctx: Context, config: Config) {
  ctx.interval(() => ctx.logger('hello').info(config.text), 60_000)
}
```

把构建产物放进 Bot 的 `data/plugins/<目录名>/`，在 WebUI 的插件页启用即可。

## 必须遵守的几条

- **构建时把 `@luckylillia/plugin-sdk`、`cordis`、`schemastery`、`@satorijs/*` 标为 external。** Bot 在加载插件时会把这些包统一解析到自己那一份；如果打进了插件产物，插件里的 `Service` / `Context` 和 Bot 的不是同一个，加载会被拒绝。
- **清理逻辑交给 cordis 托管**：用 `ctx.on()`、`ctx.interval()`、`ctx.effect(() => dispose)` 注册的东西会在插件停用 / 重载时自动撤销。不要依赖 `apply` 的返回值做清理 —— `function apply() {}` 这种函数声明在 cordis 里会被当成构造函数调用，返回值会被丢弃。
- **登录后才可用的能力用 `inject` 声明**，没就绪时插件会停在等待状态，WebUI 会显示在等哪个服务。

插件在 Bot 侧的加载、热重载机制见仓库内 `docs/plugin-system.md`，作者指南见 `docs/plugin-authoring.md`。
