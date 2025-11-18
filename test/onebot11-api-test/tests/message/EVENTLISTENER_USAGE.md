# EventListener 使用指南

## 概述

EventListener 现在支持两种协议来监听 OneBot11 事件：
1. **HTTP 协议**：通过 `/_events` SSE (Server-Sent Events) 接口
2. **WebSocket 协议**：通过 `/` WebSocket 连接

协议类型由配置文件中的 `protocol` 字段决定。

## 事件格式

OneBot11 事件的标准格式：

```json
{
  "self_id": 721011692,
  "user_id": 379450326,
  "time": 1763472666,
  "message_id": 286563975,
  "message_seq": 2162,
  "message_type": "group",
  "sender": {
    "user_id": 379450326,
    "nickname": "林雨辰的猫找到了",
    "card": "",
    "role": "member",
    "title": ""
  },
  "raw_message": "123",
  "font": 14,
  "sub_type": "normal",
  "message": [
    {
      "type": "text",
      "data": {
        "text": "123"
      }
    }
  ],
  "message_format": "array",
  "post_type": "message",
  "group_id": 962472316,
  "group_name": "--test"
}
```

## 事件过滤器

使用 `EventFilter` 接口来指定要等待的事件类型：

```typescript
interface EventFilter {
  post_type?: string;      // 事件类型：message, notice, request, meta_event
  sub_type?: string;        // 子类型：normal, anonymous, notice 等
  message_type?: string;    // 消息类型：private, group
  notice_type?: string;     // 通知类型：group_upload, group_admin 等
  request_type?: string;    // 请求类型：friend, group
  user_id?: string | number;    // 用户 ID
  group_id?: string | number;   // 群组 ID
  message_id?: string | number; // 消息 ID
  [key: string]: any;       // 其他自定义字段
}
```

## 使用示例

### 1. 等待私聊消息事件

```typescript
const listener = context.twoAccountTest.getListener('secondary');

const event = await listener.waitForEvent({
  post_type: 'message',
  message_type: 'private',
  user_id: context.primaryUserId,
}, context.testTimeout);

console.log('Received private message:', event.raw_message);
```

### 2. 等待群消息事件

```typescript
const listener = context.twoAccountTest.getListener('secondary');

const event = await listener.waitForEvent({
  post_type: 'message',
  message_type: 'group',
  sub_type: 'normal',
  group_id: context.testGroupId,
  user_id: context.primaryUserId,
}, context.testTimeout);

console.log('Received group message:', event.raw_message);
```

### 3. 等待好友请求事件

```typescript
const listener = context.twoAccountTest.getListener('primary');

const event = await listener.waitForEvent({
  post_type: 'request',
  request_type: 'friend',
  user_id: context.secondaryUserId,
}, context.testTimeout);

console.log('Received friend request from:', event.user_id);
```

### 4. 等待群通知事件

```typescript
const listener = context.twoAccountTest.getListener('primary');

const event = await listener.waitForEvent({
  post_type: 'notice',
  notice_type: 'group_increase',
  group_id: context.testGroupId,
}, context.testTimeout);

console.log('New member joined group:', event.user_id);
```

## 完整测试示例

```typescript
describe('Message with Event Verification', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  beforeEach(() => {
    clearQueues(context);
  });

  it('should send and receive private message', async () => {
    const testMessage = `Test message ${Date.now()}`;
    const primaryClient = context.twoAccountTest.getClient('primary');
    const secondaryListener = context.twoAccountTest.getListener('secondary');

    // 开始等待事件（在发送之前）
    const eventPromise = secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'private',
      user_id: context.primaryUserId,
    }, context.testTimeout);

    // 发送消息
    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');

    // 等待接收事件
    const receivedEvent = await eventPromise;

    // 验证事件内容
    expect(receivedEvent.post_type).toBe('message');
    expect(receivedEvent.message_type).toBe('private');
    expect(receivedEvent.raw_message).toBe(testMessage);
    expect(String(receivedEvent.user_id)).toBe(context.primaryUserId);
  }, 60000);
});
```

## 协议配置

### HTTP SSE 配置

```json
{
  "accounts": {
    "primary": {
      "host": "http://localhost:3000",
      "protocol": "http",
      ...
    }
  }
}
```

事件将通过 `http://localhost:3000/_events` SSE 接口接收。

### WebSocket 配置

```json
{
  "accounts": {
    "primary": {
      "host": "http://localhost:3000",
      "protocol": "ws",
      ...
    }
  }
}
```

事件将通过 `ws://localhost:3000/` WebSocket 连接接收。

## 注意事项

1. **事件顺序**：先调用 `waitForEvent()` 再执行操作，确保不会错过事件
2. **超时设置**：根据网络情况调整 timeout 值
3. **事件队列**：EventListener 会缓存接收到的事件，可以先接收后匹配
4. **清空队列**：每个测试前调用 `clearQueues()` 清空事件队列
5. **协议选择**：HTTP SSE 更稳定，WebSocket 更实时

## 故障排查

### 事件未接收

1. 检查协议配置是否正确
2. 确认事件监听器已启动（`startAllListeners()`）
3. 验证过滤器条件是否正确
4. 检查网络连接和防火墙设置

### 超时错误

1. 增加 timeout 值
2. 检查事件是否真的被触发
3. 验证过滤器条件是否过于严格
4. 查看事件队列中是否有未匹配的事件

### HTTP SSE 连接问题

1. 确认服务器支持 SSE
2. 检查 `/_events` 端点是否可访问
3. 验证 API Key 是否正确

### WebSocket 连接问题

1. 确认服务器支持 WebSocket
2. 检查 `/` 端点是否可访问
3. 验证 WebSocket 协议版本
