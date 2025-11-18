# 设计文档

## 概述

OneBot11 API 自动化测试框架是一个基于 TypeScript 的测试系统，用于验证 LLOneBot 项目中所有 OneBot11 接口的功能正确性。框架支持双账号交互测试、HTTP/WebSocket 双协议、事件监听验证，并使用 Jest 测试框架生成详细的测试报告。

## 架构

### 整体架构

```
test/onebot11-api-test/
├── config/                 # 配置管理
│   ├── test.config.json   # 测试配置文件
│   └── ConfigLoader.ts    # 配置加载器
├── core/                   # 核心功能
│   ├── ApiClient.ts       # API 客户端（HTTP/WS）
│   ├── AccountManager.ts  # 账号管理器
│   └── EventListener.ts   # 事件监听器
├── utils/                  # 工具类
│   ├── TwoAccountTest.ts  # 双账号测试抽象
│   └── Assertions.ts      # 断言工具
├── tests/                  # 测试用例
│   ├── message/           # 消息接口测试
│   ├── friend/            # 好友接口测试
│   ├── group/             # 群组接口测试
│   ├── file/              # 文件接口测试
│   ├── system/            # 系统接口测试
│   └── extended/          # 扩展接口测试
└── jest.config.js         # Jest 配置
```

### 分层设计

1. **配置层**: 管理测试账号配置和环境参数
2. **核心层**: 提供 API 调用、账号管理、事件监听的基础能力
3. **工具层**: 封装双账号测试模式和通用断言
4. **测试层**: 具体的接口测试用例

## 组件和接口

### ConfigLoader (配置加载器)

```typescript
interface TestConfig {
  accounts: {
    primary: AccountConfig;
    secondary: AccountConfig;
  };
  timeout: number;
  retryAttempts: number;
}

interface AccountConfig {
  host: string;
  apiKey: string;
  protocol: 'http' | 'ws';
}

class ConfigLoader {
  static load(path: string): TestConfig;
}
```


### ApiClient (API 客户端)

```typescript
interface ApiResponse<T = any> {
  status: string;
  retcode: number;
  data: T;
}

class ApiClient {
  constructor(config: AccountConfig);
  
  // HTTP 调用
  callHttp(action: string, params: any): Promise<ApiResponse>;
  
  // WebSocket 调用
  callWs(action: string, params: any): Promise<ApiResponse>;
  
  // 统一调用接口
  call(action: string, params: any): Promise<ApiResponse>;
}
```

### AccountManager (账号管理器)

```typescript
class AccountManager {
  primary: ApiClient;
  secondary: ApiClient;
  
  constructor(config: TestConfig);
  
  getPrimary(): ApiClient;
  getSecondary(): ApiClient;
}
```

### EventListener (事件监听器)

```typescript
interface EventFilter {
  type?: string;
  userId?: string;
  groupId?: string;
  messageId?: string;
}

class EventListener {
  constructor(client: ApiClient);
  
  // 等待特定事件
  waitForEvent(filter: EventFilter, timeout: number): Promise<any>;
  
  // 开始监听
  startListening(): void;
  
  // 停止监听
  stopListening(): void;
}
```


### TwoAccountTest (双账号测试抽象)

```typescript
class TwoAccountTest {
  constructor(accountManager: AccountManager);
  
  // 发送并验证消息
  async sendAndVerifyMessage(
    from: 'primary' | 'secondary',
    to: 'primary' | 'secondary',
    message: string
  ): Promise<void>;
  
  // 添加并验证好友
  async addAndVerifyFriend(
    requester: 'primary' | 'secondary',
    target: 'primary' | 'secondary'
  ): Promise<void>;
  
  // 执行操作并验证
  async executeAndVerify(
    action: () => Promise<any>,
    verifier: () => Promise<boolean>,
    timeout: number
  ): Promise<void>;
}
```

## 数据模型

### 配置文件格式 (test.config.json)

```json
{
  "accounts": {
    "primary": {
      "host": "http://localhost:3000",
      "apiKey": "your-api-key-1",
      "protocol": "http"
    },
    "secondary": {
      "host": "http://localhost:3001",
      "apiKey": "your-api-key-2",
      "protocol": "ws"
    }
  },
  "timeout": 30000,
  "retryAttempts": 3
}
```

### 测试结果模型

```typescript
interface TestResult {
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  details?: any;
}
```


## 正确性属性

*属性是指在系统所有有效执行中都应该成立的特征或行为——本质上是关于系统应该做什么的形式化陈述。属性是人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性 1: 配置加载一致性

*对于任何*有效的配置文件内容，加载后的配置对象应该包含所有必需的字段（accounts.primary, accounts.secondary, timeout, retryAttempts）
**验证需求: 1.1**

### 属性 2: HTTP 调用方法正确性

*对于任何*接口名称和参数，当使用 HTTP 方式调用时，实际发送的请求方法应该是 POST
**验证需求: 2.1**

### 属性 3: WebSocket 消息往返一致性

*对于任何*接口名称和参数，通过 WebSocket 发送请求时携带的 echo 字段，在接收到的响应中应该返回相同的 echo 值
**验证需求: 2.2**

### 属性 4: 消息发送接收一致性

*对于任何*消息内容，主账号发送给副账号的消息，副账号接收到的消息内容应该与发送的内容一致
**验证需求: 3.1**

### 属性 5: 事件监听超时机制

*对于任何*超时时间设置，当等待事件超过指定时间时，事件监听器应该抛出超时错误
**验证需求: 3.4, 4.2**

## 错误处理

### 配置错误

- 配置文件不存在: 抛出 `ConfigNotFoundError`
- 配置格式错误: 抛出 `ConfigFormatError` 并说明具体错误位置
- 必需字段缺失: 抛出 `ConfigValidationError` 并列出缺失字段

### 网络错误

- HTTP 请求失败: 捕获并记录错误详情，支持重试
- WebSocket 连接失败: 自动重连，超过重试次数后抛出错误
- 请求超时: 抛出 `TimeoutError` 并记录超时时长

### 测试执行错误

- 断言失败: 记录期望值和实际值
- 事件等待超时: 记录等待的事件类型和超时时间
- 账号操作失败: 记录失败的账号和操作类型


## 测试策略

### 单元测试

使用 Jest 框架编写单元测试，覆盖以下模块：

- **ConfigLoader**: 测试配置加载、验证、错误处理
- **ApiClient**: 测试 HTTP/WebSocket 调用、错误处理、重试机制
- **EventListener**: 测试事件监听、过滤、超时机制
- **AccountManager**: 测试账号管理和切换

### 属性测试

使用 fast-check 库进行属性测试：

- **属性 1**: 生成随机配置内容，验证加载后的完整性
- **属性 2**: 生成随机接口调用，验证 HTTP 方法正确性
- **属性 3**: 生成随机 WebSocket 消息和 echo 值，验证响应中 echo 字段一致性
- **属性 4**: 生成随机消息内容，验证双账号消息传递
- **属性 5**: 生成随机超时时间，验证超时机制

每个属性测试运行至少 100 次迭代。

### 集成测试

测试完整的接口调用流程：

- **消息接口**: 发送私聊/群聊消息，验证接收和撤回
- **好友接口**: 添加好友请求，处理请求，验证好友列表
- **群组接口**: 群消息发送，成员管理，权限操作
- **文件接口**: 文件上传下载，群文件管理
- **系统接口**: 登录信息查询，状态检查

### 测试报告

使用 Jest HTML Reporter 生成测试报告，包含：

- 测试用例总数、通过数、失败数
- 每个测试用例的执行时间
- 失败用例的错误堆栈和截图
- 代码覆盖率报告

### 测试框架选择

- **Jest**: 主测试框架，提供测试运行、断言、Mock 功能
- **fast-check**: 属性测试库，生成随机测试数据
- **jest-html-reporter**: 生成 HTML 格式测试报告
- **ws**: WebSocket 客户端库
- **axios**: HTTP 客户端库

