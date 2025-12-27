# WebUI API 开发规范

## 使用 ntCall 而非创建新的 HTTP API

当需要在 WebUI 前端调用 NTQQ 相关功能时，**必须使用 `ntCall` 函数**通过 `/api/ntcall/:service/:method` 端点调用，而不是在后端创建新的 HTTP API 端点。

### 可用的服务

- `ntUserApi` - 用户相关 API
- `ntGroupApi` - 群组相关 API
- `ntFriendApi` - 好友相关 API
- `ntFileApi` - 文件相关 API
- `ntMsgApi` - 消息相关 API
- `pmhq` - 协议相关 API（戳一戳等）

### 使用示例

```typescript
// 前端调用示例
import { ntCall } from '../utils/webqqApi'

// 获取用户信息
const userInfo = await ntCall('ntUserApi', 'fetchUserDetailInfo', [uid])

// 戳一戳
await ntCall('pmhq', 'sendGroupPoke', [groupCode, targetUin])
await ntCall('pmhq', 'sendFriendPoke', [targetUin])

// 获取群成员
const members = await ntCall('ntGroupApi', 'getGroupMembers', [groupCode])
```

### 为什么不创建新的 HTTP API

1. 减少后端代码维护成本
2. 保持 API 调用的一致性
3. 前端可以直接调用任何已暴露的 NT API 方法
4. 避免重复封装相同的功能

## 使用 SendElement 构造消息元素

当需要构造发送消息的元素时，**必须使用 `SendElement` 命名空间中的工厂函数**，而不是手动拼接消息结构对象。

### 可用的构造函数

位于 `src/ntqqapi/entities.ts`：

- `SendElement.text(content)` - 构造文本消息
- `SendElement.at(atUid, atNtUid, atType, display)` - 构造 @ 消息
- `SendElement.pic(...)` - 构造图片消息
- `SendElement.ptt(...)` - 构造语音消息
- `SendElement.video(...)` - 构造视频消息
- `SendElement.reply(...)` - 构造回复消息
- `SendElement.face(...)` - 构造表情消息

### 正确示例

```typescript
import { SendElement } from '@ntqqapi/entities'
import { AtType } from '@ntqqapi/types'

// ✅ 正确：使用工厂函数
const textMsg = SendElement.text('Hello')
const atMsg = SendElement.at(uid, ntUid, AtType.One, '@用户名')
```

### 错误示例

```typescript
// ❌ 错误：手动拼接消息结构
const textMsg = {
  elementType: ElementType.Text,
  elementId: '',
  textElement: {
    content: 'Hello',
    atType: 0,
    // ... 容易遗漏字段
  }
}
```

### 为什么使用工厂函数

1. 避免遗漏必要字段导致消息发送失败
2. 类型安全，IDE 自动补全
3. 统一消息结构，便于维护
4. 减少重复代码

## 群成员数据获取规范

群成员数据使用全局缓存，通过 `webqqStore` 中的 `fetchGroupMembers` 统一获取。

### 缓存策略

1. **首次进入群聊时强制刷新**：使用 `hasVisitedChat` 函数判断是否首次进入，首次进入时传 `forceRefresh: true`
2. **同一会话内复用缓存**：非首次进入时使用缓存，避免重复请求
3. **刷新浏览器后重置**：`hasVisitedChat` 内部使用的 `visitedChats` 是内存变量（不持久化），刷新浏览器后所有聊天都变成"首次进入"

### 使用示例

```typescript
import { useWebQQStore, hasVisitedChat } from '../../../stores/webqqStore'

const { getCachedMembers, fetchGroupMembers } = useWebQQStore()

// 检查是否首次进入
const isFirstVisit = !hasVisitedChat(2, groupCode)

// 非首次访问时先检查缓存
if (!isFirstVisit) {
  const cached = getCachedMembers(groupCode)
  if (cached) {
    // 使用缓存
    return
  }
}

// 获取群成员，首次进入时强制刷新
const members = await fetchGroupMembers(groupCode, isFirstVisit)
```

### 避免重复请求

1. **使用 ref 存储 store 函数**：避免 useEffect 依赖变化导致重复执行
2. **store 内部去重**：`fetchGroupMembers` 内部使用 `loadingMembersPromises` Map 防止并发请求
3. **只依赖必要的值**：useEffect 依赖数组只包含 `groupCode`，不包含 store 函数

### 错误示例

```typescript
// ❌ 错误：将 store 函数放入依赖数组
useEffect(() => {
  fetchGroupMembers(groupCode)
}, [groupCode, fetchGroupMembers])  // fetchGroupMembers 会导致重复执行

// ✅ 正确：使用 ref 存储函数
const fetchGroupMembersRef = useRef(fetchGroupMembers)
fetchGroupMembersRef.current = fetchGroupMembers

useEffect(() => {
  fetchGroupMembersRef.current(groupCode)
}, [groupCode])  // 只依赖 groupCode
```
