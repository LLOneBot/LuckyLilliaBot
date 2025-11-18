# 消息接口测试运行指南

## 快速开始

### 1. 环境准备

```bash
# 进入测试目录
cd test/onebot11-api-test

# 安装依赖
npm install
```

### 2. 配置测试账号

```bash
# 复制配置文件模板
cp config/test.config.example.json config/test.config.json
```

编辑 `config/test.config.json`：

```json
{
  "accounts": {
    "primary": {
      "host": "http://localhost:3000",
      "apiKey": "your-primary-api-key",
      "protocol": "http",
      "user_id": "123456789"
    },
    "secondary": {
      "host": "http://localhost:3001",
      "apiKey": "your-secondary-api-key",
      "protocol": "ws",
      "user_id": "987654321"
    }
  },
  "test_group_id": "111222333",
  "timeout": 30000,
  "retryAttempts": 3
}
```

**配置说明**：
- `user_id`: 账号的 QQ 号，用于事件过滤和消息验证
- `test_group_id`: 测试群组 ID（可选），如果不提供，测试会自动获取第一个可用群组

### 3. 运行测试

```bash
# 运行所有消息测试
npm test -- tests/message

# 或者使用 watch 模式
npm run test:watch -- tests/message
```

## 分类运行测试

### 按消息类型运行

```bash
# 只运行私聊消息测试
npm test -- tests/message/private

# 只运行群聊消息测试
npm test -- tests/message/group

# 只运行通用接口测试
npm test -- tests/message/common
```

### 按接口运行

```bash
# 测试 send_private_msg 接口
npm test -- tests/message/private/send-private-msg.test.ts

# 测试 send_group_msg 接口
npm test -- tests/message/group/send-group-msg.test.ts

# 测试 send_msg 通用接口
npm test -- tests/message/common/send-msg.test.ts

# 测试 delete_msg 接口（私聊）
npm test -- tests/message/private/delete-private-msg.test.ts

# 测试 delete_msg 接口（群聊）
npm test -- tests/message/group/delete-group-msg.test.ts

# 测试 get_msg 接口（私聊）
npm test -- tests/message/private/get-private-msg.test.ts

# 测试 get_msg 接口（群聊）
npm test -- tests/message/group/get-group-msg.test.ts
```

## 测试前检查清单

### 必需条件
- [ ] 两个测试账号都已登录并在线
- [ ] 两个账号互为好友
- [ ] OneBot11 服务已启动并可访问
- [ ] 配置文件中的 host 和 apiKey 正确
- [ ] 网络连接稳定

### 群消息测试额外要求
- [ ] 两个账号都在同一个测试群组中
- [ ] 账号在群组中有发言权限
- [ ] 群组允许撤回消息（如需测试撤回功能）

## 查看测试结果

### 控制台输出
测试运行时会在控制台显示实时结果：
- ✓ 表示测试通过
- ✗ 表示测试失败
- 显示每个测试的执行时间

### HTML 报告
测试完成后，会生成 `test-report.html`：

```bash
# Windows
start test-report.html

# macOS
open test-report.html

# Linux
xdg-open test-report.html
```

### 覆盖率报告
生成代码覆盖率报告：

```bash
npm run test:coverage

# 查看覆盖率报告
# Windows
start coverage/index.html

# macOS
open coverage/index.html

# Linux
xdg-open coverage/index.html
```

## 测试执行流程

### 私聊消息测试流程
1. 主账号发送消息给副账号
2. 副账号通过事件监听接收消息
3. 验证消息内容和元数据
4. 测试各种边界条件和错误场景

### 群聊消息测试流程
1. 获取测试群组 ID
2. 主账号发送群消息
3. 副账号在群组中接收消息
4. 验证消息内容和群组信息
5. 测试各种场景

### 通用接口测试流程
1. 使用 send_msg 接口发送私聊消息
2. 使用 send_msg 接口发送群消息
3. 测试参数验证和错误处理
4. 验证接口的灵活性

## 常见问题

### Q: 测试超时怎么办？
A: 
1. 检查网络连接是否稳定
2. 增加配置文件中的 `timeout` 值（如改为 60000）
3. 确认 OneBot11 服务响应正常
4. 检查是否有防火墙阻止连接

### Q: 消息发送成功但接收失败？
A:
1. 确认两个账号互为好友
2. 检查 WebSocket 事件监听是否正常
3. 查看 OneBot11 服务的事件推送日志
4. 验证账号在线状态

### Q: 群消息测试全部跳过？
A:
1. 确认两个账号都在同一个群组中
2. 检查 `get_group_list` 接口是否返回群组
3. 验证账号有群组访问权限

### Q: 撤回消息测试失败？
A:
1. 确认账号有撤回消息的权限
2. 检查消息是否在可撤回的时间窗口内
3. 验证消息 ID 是否正确
4. 查看服务器返回的错误信息

### Q: 如何调试单个测试？
A:
```bash
# 运行单个测试文件并显示详细输出
npm test -- tests/message/private/send-private-msg.test.ts --verbose

# 只运行特定的测试用例（使用 -t 参数）
npm test -- tests/message/private/send-private-msg.test.ts -t "should send private message from primary to secondary"
```

## 性能优化建议

### 并行执行
Jest 默认并行执行测试，但消息测试涉及实时交互，建议：

```bash
# 串行执行以避免消息混淆
npm test -- tests/message --runInBand

# 或限制并发数
npm test -- tests/message --maxWorkers=2
```

### 减少等待时间
如果网络环境良好，可以减少测试中的等待时间：
- 修改测试文件中的 `sleep(1000)` 为更短的时间
- 调整配置文件中的 `timeout` 值

## 持续集成

### GitHub Actions 示例

```yaml
name: Message API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '22'
      - name: Install dependencies
        run: |
          cd test/onebot11-api-test
          npm install
      - name: Run tests
        run: |
          cd test/onebot11-api-test
          npm test -- tests/message
        env:
          CI: true
      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v2
        with:
          name: test-report
          path: test/onebot11-api-test/test-report.html
```

## 贡献指南

### 添加新测试
1. 确定测试属于哪个分类（private/group/common）
2. 在相应目录创建测试文件
3. 遵循现有的测试模式和命名规范
4. 添加必要的文档说明
5. 确保测试可以独立运行

### 测试命名规范
- 文件名：`<action>-<type>-msg.test.ts`
- 测试套件：描述接口功能
- 测试用例：使用 "should" 开头描述预期行为

### 代码风格
- 使用 TypeScript 严格模式
- 遵循项目的 ESLint 配置
- 添加必要的注释和文档
- 保持测试简洁明了

## 支持

如有问题或建议，请：
1. 查看本文档和 README.md
2. 检查 OneBot11 官方文档
3. 查看项目 Issues
4. 提交新的 Issue 或 Pull Request
