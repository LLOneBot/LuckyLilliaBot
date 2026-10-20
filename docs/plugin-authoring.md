# 编写插件

LuckyLillia Bot 的插件就是一个 [cordis 4](https://github.com/cordiverse/cordis) 插件，和 Bot 自己的各个模块跑在同一个 `Context` 上。Bot 侧的加载机制见 [plugin-system.md](plugin-system.md)。

## 包结构

```
luckylillia-plugin-foo/
  package.json
  lib/index.js        构建产物（ESM）
  src/index.ts
```

```jsonc
{
  "name": "luckylillia-plugin-foo",     // 约定 luckylillia-plugin-* 或 @scope/luckylillia-plugin-*
  "version": "1.0.0",
  "type": "module",                     // 缺了它 .js 会按 CommonJS 加载
  "main": "lib/index.js",               // 也认 exports["."]
  "peerDependencies": {
    "@luckylillia/plugin-sdk": "^1.0.0" // Bot 用它判断兼容性，不满足就不加载
  },
  "llbot": {                            // 有这个字段才算插件
    "description": { "zh": "...", "en": "..." },
    "icon": "puzzle",                   // lucide 图标名（kebab-case）
    "hidden": false,                    // true：能加载，但不在 WebUI 列表里显示
    "preview": false                    // true：WebUI 标记为开发中
  }
}
```

装插件 = 把这个目录放进 Bot 的 `data/plugins/`（可以有一层 `@scope/`），然后在 WebUI 插件页里启用。新放进去的插件默认是停用状态。

## 模块形状

就是 cordis 原生的插件形状，没有额外约定：

```ts
import { Context, Schema } from '@luckylillia/plugin-sdk'

export const name = 'foo'
export const inject = ['timer']          // 依赖的服务，没就绪前插件不会运行

export interface Config {
  interval: number
}

export const Config: Schema<Config> = Schema.object({
  interval: Schema.natural().role('ms').default(60_000).description('间隔'),
})

export function apply(ctx: Context, config: Config) {
  ctx.interval(() => ctx.logger('foo').info('tick'), config.interval)
}
```

也可以 `export default` 一个函数、一个带 `apply` 的对象，或者一个 `Service` 子类。

## 配置

- `Config` 是 schemastery 的 schema 时，WebUI 会自动生成配置表单；用户保存时 Bot 先按 schema 校验，不通过就拒绝保存，正在运行的实例不受影响
- 配置变化时 cordis 会重启插件（先撤销旧实例注册的一切，再用新配置调用 `apply`），不需要自己监听配置变化
- 用别的 Standard Schema 实现（比如 zod）也能校验，但 WebUI 只能给一个 JSON 编辑框

## 生命周期与清理

插件被停用、改配置、重载时，cordis 会撤销它注册过的所有东西 —— 前提是这些东西是通过 `ctx` 注册的：

```ts
ctx.on('some/event', handler)                      // 事件监听
ctx.interval(task, 1000)                           // 定时器（ctx.setInterval 已废弃）
ctx.effect(() => {                                 // 其它资源：返回清理函数
  const server = startSomething()
  return () => server.close()
})
```

**不要靠 `apply` 的返回值做清理。** cordis 只要看到函数有 `prototype` 就当构造函数用 `new` 调用，`export function apply() {}` 这种函数声明正好有 `prototype`，返回值会被丢掉。用 `ctx.effect()`。

直接调 `setInterval` / 开端口 / 起子进程而不经过 `ctx`，停用后就会泄漏。

## 依赖的服务

`inject` 里列的服务都就绪后插件才会运行。等待中的插件在 WebUI 显示为"等待中"，并列出还缺哪些服务 —— 比如登录后才存在的服务，登录前就会一直等着，登录后自动启动。

## 构建

**把下面这些包标为 external，不要打进产物：**

```
@luckylillia/plugin-sdk  cordis  cosmokit  schemastery  @standard-schema/spec  @satorijs/element  @satorijs/protocol
```

Bot 在加载插件时会把这些 import 统一解析到它自己那一份。如果打进了产物，插件里的 `Service`、`Context` 和 Bot 的不是同一个类，服务注入和事件都会对不上；Bot 检测到这种情况会拒绝加载。其它第三方依赖可以打进产物，也可以随插件带一个 `node_modules/`。

用 tsc 构建时 `moduleResolution` 请用 `Bundler`：cordis 4.0.0-rc.11 的类型声明里相对 import 不带扩展名，`NodeNext` 解析不了，会悄悄丢掉一些导出。

## 开发

两个启动参数：

- `--plugin-dir <path>`：在 `data/plugins/` 之外再扫一个目录，可以写多次
- `--plugin-hmr`：监听插件目录，文件一改就重载（也可以在 `data/plugins.json` 里写 `"hmr": true`）。不开的话用 WebUI 的重载按钮

**用 Bot 源码开发**（tsx 能直接跑 `.ts`，`main` 可以指向 `src/index.ts`）：

```sh
yarn dev --plugin-dir /path/to/plugins --plugin-hmr
```

tsx watch 会监听所有经它加载的文件，插件也算：插件目录在仓库外时，改插件代码会让 tsx 重启整个 Bot。`yarn dev` 只排除了 `data/` 和 `examples/`，别的目录要自己排除（tsx 的选项得写在入口文件之前，所以不能接在 `yarn dev` 后面）：

```sh
npx tsx watch --exclude "./data/**" --exclude "/path/to/plugins/**" src/main/main.ts --plugin-dir /path/to/plugins --plugin-hmr
```

**用发布版 Bot 开发**：先把插件构建成 JS（构建工具开 watch），再启动 Bot 时带上 `--plugin-dir` 和 `--plugin-hmr`。

重载会重新导入整个插件包（包括子模块），但旧模块不会从内存里释放；频繁重载很多次后建议重启 Bot。

## 多实例

同一个插件包可以在 WebUI 里添加多个实例，每个实例有自己的配置，互不影响。
