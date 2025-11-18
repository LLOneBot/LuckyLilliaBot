# 消息接口测试

本目录包含 OneBot11 消息相关接口的自动化测试，按照消息类型（私聊、群聊、通用）进行分类。

## 目录结构

```
message/
├── private/              # 私聊消息测试
│   ├── send-private-msg.test.ts      # 发送私聊消息
│   ├── delete-private-msg.test.ts    # 撤回私聊消息
│   └── get-private-msg.test.ts       # 获取私聊消息
├── group/                # 群聊消息测试
│   ├── send-group-msg.test.ts        # 发送群消息
│   ├── delete-group-msg.test.ts      # 撤回群消息
│   └── get-group-msg.test.ts         # 获取群消息
├── common/               # 通用消息接口测试
│   └── send-msg.test.ts              # 通用发送消息接口
└── README.md             # 本文档
```

## 测试覆盖的接口

### 私聊消息 (private/)

#### send_private_msg - 发送私聊消息
- ✅ 主账号向副账号发送私聊消息
- ✅ 副账号向主账号发送私聊消息
- ✅ 特殊字符处理
- ✅ 空消息处理
- ✅ 长消息处理
- ✅ 多行消息处理

#### delete_msg - 撤回私聊消息
- ✅ 撤回已发送的私聊消息
- ✅ 处理无效的消息 ID

#### get_msg - 获取私聊消息
- ✅ 获取已发送的私聊消息
- ✅ 处理无效的消息 ID

### 群聊消息 (group/)

#### send_group_msg - 发送群消息
- ✅ 主账号向群组发送消息
- ✅ 副账号向群组发送消息
- ✅ 发送包含 CQ 码的群消息
- ✅ 特殊字符处理
- ✅ 长消息处理
- ✅ 处理无效的群组 ID

#### delete_msg - 撤回群消息
- ✅ 撤回已发送的群消息

#### get_msg - 获取群消息
- ✅ 获取已发送的群消息

### 通用接口 (common/)

#### send_msg - 通用发送消息接口
- ✅ 使用 send_msg 发送私聊消息
- ✅ 使用 send_msg 发送私聊消息（带 auto_escape 参数）
- ✅ 使用 send_msg 发送群消息
- ✅ 使用 send_msg 发送群消息（带 CQ 码）
- ✅ 错误处理：缺少 message_type
- ✅ 错误处理：缺少必需参数
- ✅ 错误处理：无效的 user_id
- ✅ 错误处理：无效的 group_id

## 运行测试

### 前置条件
1. 配置两个测试账号（主账号和副账号）
2. 复制 `config/test.config.example.json` 为 `config/test.config.json`
3. 填写正确的账号信息和 API 密钥
4. 确保两个账号互为好友
5. 确保两个账号在同一个测试群组中（用于群消息测试）

### 运行命令

```bash
# 进入测试目录
cd test/onebot11-api-test

# 安装依赖
npm install

# 运行所有消息测试
npm test -- tests/message

# 运行私聊消息测试
npm test -- tests/message/private

# 运行群聊消息测试
npm test -- tests/message/group

# 运行通用接口测试
npm test -- tests/message/common

# 运行特定测试文件
npm test -- tests/message/private/send-private-msg.test.ts

# 生成覆盖率报告
npm run test:coverage
```

## 测试架构

### 双账号交互验证机制
所有测试使用双账号交互验证机制：
1. **发送方**：执行操作（如发送消息）
2. **接收方**：通过 WebSocket 事件监听验证操作结果
3. **断言验证**：使用 Assertions 工具验证数据一致性

### 工具类
- **TwoAccountTest**: 提供双账号测试的基础设施
  - 账号管理
  - 事件监听器管理
  - 通用辅助方法
- **Assertions**: 提供断言方法
  - API 响应验证
  - 事件验证
  - 消息内容验证

### 测试模式
每个测试文件专注于单一接口的测试，包含：
- 基本功能测试
- 边界条件测试
- 错误处理测试
- 特殊场景测试

## 注意事项

### 超时设置
- 默认超时时间为 30 秒
- 可在配置文件中调整 `timeout` 值
- 网络不稳定时建议增加超时时间

### 事件监听
- 测试依赖 WebSocket 事件监听
- 确保网络连接稳定
- 事件监听器在测试开始前启动，结束后停止

### 消息延迟
- 某些测试在操作后会等待 1 秒
- 确保消息已被服务器处理和保存
- 可根据实际情况调整延迟时间

### 群组要求
- 群消息测试需要两个账号都在同一个群组中
- 测试会自动使用第一个可用的群组
- 如果没有可用群组，相关测试会被跳过

### 权限要求
- 撤回消息测试需要账号有相应的权限
- 群消息操作可能需要特定的群权限
- 确保测试账号有足够的权限执行操作

## 验证需求

本测试模块验证以下需求：
- **需求 6.1**: 测试消息接口的功能
  - send_msg - 通用发送消息接口
  - send_private_msg - 发送私聊消息
  - send_group_msg - 发送群消息
  - delete_msg - 撤回消息
  - get_msg - 获取消息

## 故障排查

### 测试超时
- 检查网络连接
- 增加配置文件中的 timeout 值
- 确认 OneBot11 服务正常运行
- 检查防火墙设置

### 消息未接收
- 确认两个账号互为好友
- 检查事件监听的 WebSocket 连接
- 查看 OneBot11 服务日志
- 验证账号在线状态

### 群消息测试失败
- 确认两个账号都在同一个群组中
- 检查群组权限设置
- 确认群组 ID 正确
- 验证账号在群组中的状态

### API 调用失败
- 检查 API 密钥配置
- 验证 host 地址正确
- 确认协议类型（http/ws）匹配
- 查看服务器错误日志

## 测试报告

测试完成后，会在项目根目录生成 `test-report.html` 文件，包含：
- 测试执行摘要
- 每个测试的详细结果
- 失败测试的错误信息
- 测试执行时间统计

用浏览器打开即可查看详细的测试报告。
