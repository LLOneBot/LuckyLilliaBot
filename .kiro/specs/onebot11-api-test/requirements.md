# 需求文档

## 简介

为 LLOneBot 项目的 OneBot11 接口开发自动化测试框架，支持双账号交互验证、HTTP/WebSocket 两种调用方式，并生成测试报告。

## 术语表

- **测试系统**: 自动化测试框架
- **OneBot11接口**: 位于 src/onebot11/action 的 QQ 机器人 API 接口
- **主账号**: 执行操作的第一个测试账号
- **副账号**: 用于验证操作结果的第二个测试账号
- **闭环验证**: 操作后通过另一账号查询或接收事件来验证操作成功

## 需求

### 需求 1

**用户故事:** 作为测试开发者，我想要配置两个测试账号的连接信息，以便测试框架能够同时操作两个账号进行交互测试

#### 验收标准

1. WHEN 测试系统启动时 THEN 测试系统 SHALL 从配置文件读取两个账号的 host 和 apikey
2. WHERE 配置文件存在时 WHEN 配置文件格式正确 THEN 测试系统 SHALL 成功加载账号配置
3. WHEN 配置文件缺失或格式错误时 THEN 测试系统 SHALL 抛出明确的错误信息

### 需求 2

**用户故事:** 作为测试开发者，我想要通过 HTTP 和 WebSocket 两种方式调用接口，以便验证不同传输协议下的接口行为

#### 验收标准

1. WHEN 测试用例指定 HTTP 方式时 THEN 测试系统 SHALL 使用 HTTP POST 请求调用 OneBot11 接口
2. WHEN 测试用例指定 WebSocket 方式时 THEN 测试系统 SHALL 通过 WebSocket 连接发送请求并接收响应
3. WHEN 接口调用失败时 THEN 测试系统 SHALL 捕获错误并记录详细信息

### 需求 3

**用户故事:** 作为测试开发者，我想要实现双账号交互验证机制，以便测试需要多方参与的操作（如发送消息、添加好友）

#### 验收标准


1. WHEN 主账号发送消息时 THEN 测试系统 SHALL 使用副账号接收并验证该消息
2. WHEN 主账号添加副账号为好友时 THEN 测试系统 SHALL 使用副账号接收好友请求并验证
3. WHEN 副账号处理好友请求后 THEN 测试系统 SHALL 使用主账号查询好友列表验证添加成功
4. WHEN 执行需要双方验证的操作时 THEN 测试系统 SHALL 在超时时间内完成验证

### 需求 4

**用户故事:** 作为测试开发者，我想要封装通用的双账号交互测试模式，以便快速编写新的测试用例

#### 验收标准

1. WHEN 编写新测试用例时 THEN 测试系统 SHALL 提供抽象的双账号操作接口
2. WHEN 需要等待事件时 THEN 测试系统 SHALL 提供事件监听和超时机制
3. WHEN 验证操作结果时 THEN 测试系统 SHALL 提供统一的断言工具

### 需求 5

**用户故事:** 作为测试开发者，我想要使用流行的测试框架并生成可视化报告，以便清晰了解测试结果

#### 验收标准

1. WHEN 测试执行完成时 THEN 测试系统 SHALL 生成包含通过率、失败详情的测试报告
2. WHEN 测试失败时 THEN 测试系统 SHALL 在报告中记录失败原因和堆栈信息
3. WHEN 查看测试报告时 THEN 测试系统 SHALL 提供 HTML 格式的可视化报告

### 需求 6

**用户故事:** 作为测试开发者，我想要测试所有 OneBot11 接口的功能，以便确保全部接口行为符合预期

#### 验收标准

1. WHEN 测试消息接口时 THEN 测试系统 SHALL 验证 SendMsg、SendPrivateMsg、SendGroupMsg、DeleteMsg、GetMsg 的功能
2. WHEN 测试好友接口时 THEN 测试系统 SHALL 验证 GetFriendList、SetFriendAddRequest、DeleteFriend、SendLike 的功能
3. WHEN 测试群组接口时 THEN 测试系统 SHALL 验证 GetGroupList、GetGroupInfo、GetGroupMemberList、GetGroupMemberInfo、SetGroupAddRequest、SetGroupKick、SetGroupBan、SetGroupAdmin、SetGroupCard、SetGroupName、SetGroupLeave、SetGroupWholeBan、GetGroupHonorInfo 的功能
4. WHEN 测试文件接口时 THEN 测试系统 SHALL 验证 GetFile、GetImage、GetRecord、UploadGroupFile、UploadPrivateFile、GetGroupRootFiles、GetGroupFilesByFolder、CreateGroupFileFolder、DelGroupFile、DelGroupFolder、GetGroupFileUrl、GetGroupFileSystemInfo 的功能
5. WHEN 测试系统接口时 THEN 测试系统 SHALL 验证 GetLoginInfo、GetStatus、GetVersionInfo、CanSendImage、CanSendRecord、GetCredentials、GetCsrfToken、GetCookie、CleanCache、SetRestart 的功能
6. WHEN 测试扩展接口时 THEN 测试系统 SHALL 验证 GetForwardMsg、SendForwardMsg、GetGroupMsgHistory、GetGroupNotice、SendGroupNotice、GetGroupSystemMsg、GetStrangerInfo、MarkMsgAsRead、SetEssenceMsg、DelEssenceMsg、GetGroupEssence、OCRImage、DownloadFile、GetGroupAtAllRemain、SendGroupSign、SetGroupPortrait、SetGroupSpecialTitle、SetQQProfile、QuickOperation 的功能
