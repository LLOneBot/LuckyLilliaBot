# @llbot-test/framework

协议无关的双账号 E2E 测试基础设施。OB11 / Milky / Satori 共用账号配置、双账号编排、配置加载，每个协议自己实现 API 调用 + 事件监听 + 断言。

## 它给你什么

- **`ConfigLoader`** — 读 `test.config.json`，校验双账号 + test_group_id
- **`AccountManager<C extends IApiClient>`** — 给主/副两个账号造 ApiClient 实例
- **`TwoAccountTest<C, L>`** — 双账号编排：start/stop 监听器、批量清队列、`getClient/getListener('primary'|'secondary')`、`executeAndVerify` 重试 helper
- **`IApiClient` / `IEventListener`** 接口 — 你协议自己实现

## 它不给你

- 协议自己的 API 调用细节（HTTP/WS/SSE 格式、action 命名、响应结构）
- 协议自己的事件结构和过滤器形状
- 协议自己的断言 helper

## 怎么基于它写一套新协议测试（5 步）

参考 `test/onebot11-api-test/` 完整实例。下面是骨架：

### 1. 起新目录 + 拷贝配置

```
test/your-protocol-test/
├── package.json          # 跟 onebot11-api-test 学
├── tsconfig.json
├── jest.config.js        # 拷过来即可
├── config/
│   └── test.config.json  # 主/副账号 + 测试群 ID
└── tests/
    └── setup.ts
```

### 2. 实现 `IApiClient`

```ts
// protocol/ApiClient.ts
import { IApiClient, AccountConnectionConfig } from '../../test-framework/src/index.js'

export class MyApiClient implements IApiClient {
  constructor(private config: AccountConnectionConfig, private retries: number) {}

  async call<R>(action: string, params?: unknown): Promise<R> {
    // 实现你协议的调用：HTTP POST、WS request/response 等
  }

  disconnect(): void {
    // 关掉 WS 连接，没连接就 no-op
  }

  getConfig() {
    return this.config
  }
}
```

### 3. 实现 `IEventListener`

```ts
// protocol/EventListener.ts
import { IApiClient, IEventListener } from '../../test-framework/src/index.js'

export interface MyEvent {
  /** 你协议事件的字段 */
}

export interface MyEventFilter {
  /** 用户在 waitForEvent 时能传的过滤字段 */
}

export class MyEventListener implements IEventListener<MyEvent, MyEventFilter> {
  constructor(private client: IApiClient) {}

  async startListening(): Promise<void> { /* 建 SSE/WS 连接 */ }
  stopListening(): void { /* 关连接，清 handler */ }
  clearQueue(): void { /* 清队列 */ }
  async waitForEvent(filter, customFilter, timeout = 20000): Promise<MyEvent> { /* ... */ }
}
```

### 4. 在 setup.ts 组装

```ts
// tests/setup.ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ConfigLoader, AccountManager, TwoAccountTest,
} from '../../test-framework/src/index.js'
import { MyApiClient } from '../protocol/ApiClient.js'
import { MyEventListener } from '../protocol/EventListener.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface MyTestContext {
  twoAccountTest: TwoAccountTest<MyApiClient, MyEventListener>
  testGroupId: string
  primaryUserId: string
  secondaryUserId: string
  testTimeout: number
}

export async function setupTest(): Promise<MyTestContext> {
  const config = ConfigLoader.load(path.resolve(__dirname, '../config/test.config.json'))
  const accountManager = new AccountManager<MyApiClient>(
    config,
    (acc, retries) => new MyApiClient(acc, retries),
  )
  const twoAccountTest = new TwoAccountTest<MyApiClient, MyEventListener>(
    accountManager,
    (client) => new MyEventListener(client),
  )
  await twoAccountTest.startAllListeners()
  return {
    twoAccountTest,
    testGroupId: config.test_group_id,
    primaryUserId: config.accounts.primary.user_id,
    secondaryUserId: config.accounts.secondary.user_id,
    testTimeout: config.timeout,
  }
}

export function teardownTest(ctx: MyTestContext): void {
  ctx.twoAccountTest.stopAllListeners()
}
```

### 5. 写测试用例

```ts
import { setupTest, teardownTest, MyTestContext } from './setup'

describe('我的协议 - send_message', () => {
  let ctx: MyTestContext

  beforeAll(async () => { ctx = await setupTest() })
  afterAll(() => teardownTest(ctx))

  it('primary 发消息 secondary 收到', async () => {
    ctx.twoAccountTest.clearAllQueues()
    const primary = ctx.twoAccountTest.getClient('primary')
    const text = `hello ${Date.now()}`
    await primary.call('your.send_action', { /* ... */ })
    await ctx.twoAccountTest.secondaryListener.waitForEvent({
      /* 协议特定的 filter */
    }, undefined, 15000)
  }, 30000)
})
```

## 配置文件 schema (`test.config.json`)

```json
{
  "accounts": {
    "primary": {
      "host": "http://127.0.0.1:53000",
      "apiKey": "",
      "protocol": "http",
      "user_id": "123456"
    },
    "secondary": {
      "host": "http://127.0.0.1:53001",
      "apiKey": "",
      "protocol": "http",
      "user_id": "654321"
    }
  },
  "test_group_id": "111222333",
  "timeout": 30000,
  "retryAttempts": 3
}
```

`protocol` 字段是 string，由各协议自己约束允许的值（OB11 限定 `'http' | 'ws'`，Milky 可能有自己的取值）。

## 运行测试

测试框架本身不带 jest——每个协议测试包自己装。

```bash
cd test/your-protocol-test
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand
```

`--runInBand` 强制单线程（双账号测试有共享状态，并行会撞）。
