# Event 推送 TODO

直连模式下 OneBot11 接收端事件已基本接通（消息、群通知、戳一戳等），但仍有以下问题待修复或实现。下面按优先级和可观察现象列出。

## 已知问题

### 1. 戳一戳的 `raw_info` 跟文档有出入
- **现象**：上报的 `raw_info` 字段结构跟 OneBot11 / go-cqhttp 文档对不上，第三方框架按文档解析会拿不到正确值。
- **位置**：`src/onebot11/event/notice/OB11PokeEvent.ts` 中 `OB11FriendPokeEvent` / `OB11GroupPokeEvent` 的 `raw_info` 拼装。

### 2. 撤回戳一戳事件没有上报
- **现象**：戳一戳消息在 QQ 客户端可被撤回（变成"取消戳"），bot 端 `OB11FriendPokeRecallEvent` / `OB11GroupPokeRecallEvent` 类已定义但**没有触发路径**。

### 3. Bot 被添加好友时，一次推 2 个 request 事件，其中一个不正常
- **现象**：对方发起加好友请求，bot 端收到 **2 个** `request.friend` 事件，第二个字段不全/重复。
- **位置**：`src/ntqqapi/dispatcher.ts` 里 `handleFriendRequest`，可能 `0x210` subType=35 与其他兜底分支重复触发。

### 4. 好友申请通过时，没有上报 `friend_add` 事件，反而又出 2 个不正常的 request
- **现象**：bot 同意加好友后应该上报 `notice.friend_add`，实际**没有这条事件**；同时又出现两条不该出现的 `request` 事件。
- **位置**：`OB11FriendAddNoticeEvent` 没有被任何代码路径 emit。

### 5. `profile_like` 事件没有上报
- **现象**：被点赞时 `OB11ProfileLikeEvent` 类已定义，但**没有触发路径**。
- **来源**：可能在 `0x210` subType=39（friend-pin / 资料赞）分支里漏识别。

### 6. `group_upload` 事件没有上报
- **现象**：群成员上传文件后，secondary bot 应该收到 `notice.group_upload`，实际**没有**。
- **位置**：`OB11GroupUploadNoticeEvent` 类已定义。直连模式下需要在群消息推送里识别 `RichText` 中的 `groupFile` 元素并 emit。

### 7. 邀请机器人入群时，申请加群事件没有上报
- **现象**：被邀请加群（`request.group, sub_type='invite'`）应该上报，**直连模式下没收到**。
- **位置**：`src/ntqqapi/dispatcher.ts` 里 `handleGroupInvitation`（处理 `MsgType.Event0x20D` / `GroupInvitation`）。

### 8. Bot 为群管理员/群主时，有人申请入群，没有上报 `request.group, sub_type='add'`
- **现象**：群管理员视角下别人申请入群应该收到通知，直连模式没收到。
- **位置**：`src/ntqqapi/dispatcher.ts` 里 `handleGroupJoinRequest`（处理 `MsgType.GroupJoinRequest=84`）。

### 9. 解散群聊事件没有上报
- **现象**：群被解散时应该上报 `notice.group_dismiss`，实际**没有**。
- **位置**：`OB11GroupDismissEvent` 类已定义，但没有触发路径。

### 10. 群头衔事件没有上报
- **现象**：群成员头衔变更时应该上报 `notice.notify, sub_type='title'`，实际**没有**。
- **位置**：`OB11GroupTitleEvent` 类已定义，可能在 `0x2DC` 灰条提示分支里需要识别 `groupTitleChange` 类的 grayTip。

### 11. 群消息贴表情事件没有上报
- **现象**：`set_msg_emoji_like` 调用后接收方应该收到 `notice.group_msg_emoji_like`，**没有**。
- **位置**：dispatcher 已有 `nt/raw/group-reaction` 事件 emit（`0x2DC` subType=16 + GeneralGrayTip 解析），但 OB11 adapter 那边没把它转成 OB11 事件。

### 12. 群禁言事件没有上报
- **现象**：被禁言/解除禁言时应该上报 `notice.group_ban`，实际**没有**。
- **位置**：dispatcher 里 `handleGroupMute`（`0x2DC` subType=12）已 emit `nt/raw/group-mute` 和 `nt/raw/group-mute-all`，但 OB11 adapter 没桥接。

### 13. 群精华事件没有上报
- **现象**：精华消息变更（添加/删除）应该上报 `notice.essence`，实际**没有**。
- **位置**：dispatcher 里 `handleGroupEssenceChange`（`0x2DC` subType=21）已 emit `nt/raw/group-essence-change`，但 OB11 adapter 没桥接。

### 14. 闪传文件事件没有上报
- **现象**：闪传文件状态（uploading / uploaded / downloading / downloaded）应该上报 `notice.flash_file`，实际**没有**。
- **位置**：`OB11FlashFileEvent` 4 个子类已定义；NT 模式下走 `nodeIKernelFlashTransferListener` 桥接，直连模式下需要识别相关 SSO 推送（目前 `nt/raw/flash-file-*` 事件主要是 NT wrapper 模式）。

## 共同模式

很多都是 **「raw event 已 emit 但 OB11 adapter 没把它转成 OB11 标准事件」**——优先看 `src/onebot11/adapter.ts` 里 `this.ctx.on('nt/raw/...', ...)` 的桥接代码，缺的就补。

剩下少数（#3 / #4 / #6 / #7 / #8 / #14）需要在 `src/ntqqapi/dispatcher.ts` 解析对应 SSO 推送、emit 出新的 `nt/raw/*` 事件，再到 adapter 里桥接。
