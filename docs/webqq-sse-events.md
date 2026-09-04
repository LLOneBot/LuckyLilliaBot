# WebQQ 的 SSE 事件契约

BE (`src/webui/BE/server.ts` `setupMessageListener`) 把 cordis 事件转成 SSE 推给 FE,
FE 在 `WebQQPage.tsx` 的 `createEventSource` 回调里分发。

## 各事件的 payload 是否已归一化

| 事件 | payload | id 字段类型 |
|------|---------|-----------|
| `message-created` / `message-sent` | **原样广播 `data.message`** (RawMessage) | `peerUin` / `msgSeq` / `msgTime` 都是 **number** |
| `message-deleted` | BE 手工组装 | `peerUin` / `msgSeq` 已 `.toString()` |
| `emoji-reaction` | BE 手工组装 | `groupCode` / `msgSeq` / `emojiId` / `userId` 已 `.toString()` |

前两类事件的 id 字段类型**不一致**, 这是踩过坑的地方。

## 陷阱: number vs string

FE 侧的 `ChatSession.peerId`、`RecentChatItem.peerId`、`GroupItem.groupCode`、
`FriendItem.uin` **全是 string**; 而 `RawMessage` 里 `peerUin: number`、
`msgSeq: number`、`msgTime: number`(`src/ntqqapi/types/msg.ts`)。

`peerUin` 原本是 string, 在 `95fdd552 refactor` 里改成了 number。WebQQ 的
`chat.peerId === peerId` 是按 string 写的, 于是**静默恒为 false** ——
新消息全被算成未读, 进不了已经打开的聊天窗口, 但最近会话预览照常更新
(因为那条路径调用时写了 `peerId.toString()`)。要切会话或刷新页面才看得到。

**tsc 抓不到这类错误**: `createEventSource` 回调的 `data` 是 `unknown`,
`const rawMessage: RawMessage = data.data` 之后所有字段访问都不受检查
(WebQQPage.tsx 现存 15 条 TS18046 就是这个)。所以只能靠人工归一化 + 这份文档。

## 约定

**RawMessage 的 id 字段跟 FE 状态比较 / 当参数传之前, 一律 `String()` 归一化。**
排序、大小比较用 `Number()`, 不要用 `parseInt()` (它对 number 入参先隐式 `String()`,
大数会变科学计数法而截断)。

## 类型对照

| 来源 | 字段 | 类型 |
|------|------|------|
| `RawMessage` (`src/ntqqapi/types/msg.ts`) | `peerUin` / `senderUin` / `msgSeq` / `msgTime` | **number** |
| `RawMessage` | `msgId` / `peerUid` / `senderUid` | string |
| FE 状态 (`types/webqq.ts`) | `ChatSession.peerId` / `RecentChatItem.peerId` / `GroupItem.groupCode` / `FriendItem.uin` / `GroupMemberItem.uin` | **string** |

## 曾经踩过的坑 (已全部修掉)

`95fdd552 refactor` 把这些字段从 string 改成 number 后, WebQQ 里 21 处比较/传参静默失效。
tsc 报了其中 20 处 (TS2367 / TS2345), 但被基线里一百多条既有错误淹没; 剩下 1 处
(`WebQQPage.tsx` 的 `chat.peerId === peerId`) 因为 `peerUin || peerUid` 推导成
`number | string` 跟 `string` 有交集, tsc 根本不报。

失效表现分两类:

- **主路径失效** — `chat.peerId === peerId` 恒 false, 新消息进不了已打开的聊天窗口
  (最近会话预览却正常, 因为那条路径写了 `.toString()`)。
- **fallback 失效** — 主键 (msgId / uid) 匹配得上时看不出来, 匹配不上才暴露:
  撤回标记、跳转到被引用消息、群成员角色/等级、私聊对方备注昵称。

修完后 FE 的 tsc 错误数 126 → 105。

**新增消息相关代码时**: 别假设 `RawMessage` 的 id 是 string。写 `===` 之前先看一眼上面的类型对照表。
