# 超级表情与多元素图文混排协议备忘

## 1. 协议背景与服务类型定义

QQ 协议中的表情元素包含多种服务类型（`serviceType`）：

- **普通表情 / 经典小黄脸**：直接通过 `elem.face` 呈现。
- **行内小表情 (`serviceType: 33`, `QSmallFaceExtra`)**：包含小黄脸、超级表情的行内小表情形态。
- **全屏超级大表情 (`serviceType: 37`, `LargeFaceExtra`)**：包含带动画的超级大表情（如 `/吃糖`、`/菜汪`）、骰子（Dice）和猜拳（RPS）的互动大动画形态。

---

## 2. 发送端规则 (MessageBuilding)

### 2.1 混排降级机制
- **单体唯一表情 (`inputElems.length === 1`)**：
  构造 `serviceType: 37`（`LargeFaceExtra`），此时客户端正常播放全屏大表情或骰子掷点动画。
- **图文混排 (`inputElems.length > 1`)**：
  **必须降级为 `serviceType: 33`（`QSmallFaceExtra`）**。
  - **原因**：腾讯 QQ 服务端严格禁止在多元素混排消息中包含 `serviceType: 37`，否则会直接拦截并抛出 `retcode: 1200`（发送失败）；
  - **表现**：官方 QQ 客户端在输入框中混排输入超级表情/互动表情时，底层行为与视觉表现均自动降级为行内小表情形态。

---

## 3. 接收端规则 (MessageParsing)

### 3.1 降级文本 (Fallback Text) 处理
- **腾讯服务端下发逻辑**：
  当用户发送单张超级大表情（`serviceType: 37`）时，为了兼容旧版 QQ / TIM 等老旧客户端，腾讯服务器会在数据包中紧随其后附带一个纯文本元素（例如 `[吃糖]`、`[菜汪]` 或 `[动画表情]`）。
- **解析与清洗规范**：
  - 严禁在解析完 `serviceType: 37` 后直接调用 `break`，否则会中断后续元素遍历，误杀后续真正的聊天消息；
  - 应当智能检测紧随其后的下一个元素（`elems[index + 1]`），若其内容匹配该表情的 fallback 降级纯文本（如 `[${faceName}]`、`[动画表情]` 等），则标记 `skipIndex = index + 1` 精准跳过该冗余段。
