# cordis 4.0.0-rc.6 → rc.11 升级笔记

升级提交：`chore(deps): upgrade cordis to 4.0.0-rc.11`。cordis 4 还在 rc，每个 rc 之间都可能有行为变化，下次升级前先读这里，再跑 `test/unit/bootstrap/service-registry.test.ts`（挂载全部内置服务并断言都进入 ACTIVE）。

## 版本对齐

| 包 | 版本 | 说明 |
|---|---|---|
| `cordis` | `4.0.0-rc.11`（精确） | rc 之间不保证兼容，不用 `^` |
| `@cordisjs/plugin-database` | `^4.2.0` | peer `cordis ^4.0.0-rc.10` |
| `@cordisjs/plugin-database-sqlite` | `^5.2.0` | peer database `^4.2.0` |
| `@cordisjs/plugin-timer` | `^1.1.4` | peer `cordis ^4.0.0-rc.11` |
| `@cordisjs/plugin-logger-console` | `^1.0.0` | peer `^4.0.0-rc.4` |

升级前本地 `node_modules` 停在 rc.6，而 `yarn.lock` 和 CI 是 rc.9 —— 本机和发布包跑的不是同一个 cordis。改依赖后一定要重新 `yarn install`。

`@satorijs/core`（4.6.0）和 `koishi`（4.18.x）都还 peer `cordis ^3.18.1`，不能引入。`@satorijs/protocol` / `@satorijs/element` 不依赖 cordis，可以直接用。

## 碰到现有代码的变化

- **`ctx.parallel` 改成 `Promise.allSettled` + `AggregateError`**。rc.6 是 `Promise.all`，listener 失败本来就会 reject；变的是错误对象：`new AggregateError(reasons)` 没有 message。`BaseAction` 原来直接取 `e.message`，会给 OB11 客户端回一个空错误文本，现在展开成各个原因用 `; ` 拼起来
- **`LoggerLevel` 里 INFO 和 WARN 对调了**：rc.6 是 `ERROR=0 INFO=1 WARN=2 DEBUG=3`，rc.11 是 `ERROR=0 WARN=1 INFO=2 DEBUG=3`。本项目只用 2 和 3 两档，可见集合不变（2 都是 error / warn / info），只是注释里"2 = WARN"的叫法要改成 INFO
- **`LoggerService.exporters` 成了公开类型字段**，`applyDebugLevel()` 不用再强转
- **`@cordisjs/plugin-timer` 1.1.4 把 `ctx.setTimeout` / `ctx.setInterval` 标为 deprecated**，新代码用 `ctx.timeout()` / `ctx.interval()`

## 写插件运行时时踩到的 cordis 4 行为

源码在 `node_modules/cordis/lib/index.js`，行号以 rc.11 为准。

- `ctx.plugin()` 返回 `Object.create(fiber)` 再加一个 `then`，**不是 fiber 本体**（`RegistryService.plugin`）。`internal/status` 等内部事件传的是本体，要拿 `.ctx.fiber` 才能对上
- `fiber.await()` 只等 `inertia`（进行中的加载 / 卸载），**对缺依赖的 PENDING fiber 立刻返回**；FAILED 时把 `_error` 重新抛出，这是拿到失败原因的唯一公开途径。测试里 `await ctx.plugin(X)` 前要先等 X 依赖的服务就绪，否则拿到的是还没初始化的服务
- 配置校验挂在 `internal/config` 钩子上，每次加载时在 `execute` 里跑。`fiber.update(config)` 只在 fiber 已加载时同步校验（不合法直接同步抛 `ValidationError`，旧实例不受影响），PENDING 时不校验；它返回重启任务（`Awaitable<void>`）
- `ctx.get(name)` 只看提供者 fiber 是否 ACTIVE，**不看 `Service[Service.check]`**。要判断一个带 check 的服务对依赖方是否可用，得用 `ctx.reflect._getImpl(name)` 再调 `impl.check`
- `isConstructor(fn)` 的判据只是"有 `prototype`"：`function apply() {}` 这种函数声明会被 `new` 调用，返回值被当成实例丢掉。插件的清理逻辑必须走 `ctx.effect()`
- `Service` 构造时把 `this[Service.check]` 传给 `reflect.provide(name, value, check)`；`reflect.notify([name])` 会对所有 inject 了它的 fiber 重新求值 check 并刷新 —— 可以用来做"条件满足才可用"的门闸服务
- 类型声明里相对 import 不带扩展名（上游 rc.11 之后的 #125 才修），`moduleResolution: NodeNext` 下会静默丢掉 `Service` / `Inject` 等导出，连产物里的 `Context` 都会被当成类型擦掉。用 `Bundler`
- 事件分发五种模式都有：`emit / parallel / serial / bail / waterfall`。`waterfall` 的最后一个实参是终端处理器，被 `pop()` 掉后每个 listener 收到 `(...args, next)`，不调 `next` 即短路
