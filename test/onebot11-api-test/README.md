# OneBot11 API 自动化测试框架

自动化测试框架，用于验证 LLOneBot 项目中所有 OneBot11 接口的功能正确性。

## 功能特性

- 双账号交互测试
- HTTP/WebSocket 双协议支持
- 事件监听验证
- 属性测试（Property-Based Testing）
- 详细的 HTML 测试报告

## 安装

```bash
cd test/onebot11-api-test
npm install
```

## 配置

1. 复制配置文件模板：
```bash
cp config/test.config.example.json config/test.config.json
```

2. 编辑 `config/test.config.json`，填入两个测试账号的连接信息：
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

## 运行测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

## 测试报告

测试完成后，会在项目根目录生成 `test-report.html` 文件，包含详细的测试结果。

## 项目结构

```
test/onebot11-api-test/
├── config/                 # 配置管理
├── core/                   # 核心功能
├── utils/                  # 工具类
├── tests/                  # 测试用例
├── jest.config.js         # Jest 配置
├── tsconfig.json          # TypeScript 配置
└── package.json           # 项目依赖
```
