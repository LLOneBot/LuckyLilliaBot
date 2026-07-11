# Event 推送 TODO

直连模式下 OneBot11 接收端事件已基本接通（消息、群通知、戳一戳等），但仍有以下问题待修复或实现。下面按优先级和可观察现象列出。

## 已知问题

### 1. 戳一戳的 `raw_info` 跟文档有出入 ✅ 已修复
- **现象**：上报的 `raw_info` 字段结构跟 OneBot11 / go-cqhttp 文档对不上，第三方框架按文档解析会拿不到正确值。
- **位置**：`src/onebot11/event/notice/OB11PokeEvent.ts` 中 `OB11FriendPokeEvent` / `OB11GroupPokeEvent` 的 `raw_info` 拼装。
- **修复**：补齐 `jp` / `tp` 字段，加上 `actionImg` 时追加 `img` 类型项；`adapter.ts` 里两处 poke 桥接同步更新。

### 2. 撤回戳一戳事件没有上报 ✅ 已修复
- **现象**：戳一戳消息在 QQ 客户端可被撤回（变成"取消戳"），bot 端 `OB11FriendPokeRecallEvent` / `OB11GroupPokeRecallEvent` 类已定义但**没有触发路径**。
- **修复**：
  - dispatcher 的 `handleGroupGrayTip` / `handleFriendGrayTip` 把 `contentHead.msgUid` 透传到 `nt/raw/group-poke` / `nt/raw/friend-poke` payload。
  - adapter 把每条 poke 的 `(msgUid → 事件信息)` 缓存到 `pokeCache` (LRU 500 条)。
  - 直接监听 `nt/raw/delete-msg`（直连模式 poke 没对应 RawMessage，core 那条 `nt/message-deleted` 永远到不了），命中 `pokeCache` 就 dispatch `OB11GroupPokeRecallEvent` / `OB11FriendPokeRecallEvent`。

### 3. Bot 被添加好友时，一次推 2 个 request 事件，其中一个不正常 ✅ 已修复
- **现象**：对方发起加好友请求，bot 端收到 **2 个** `request.friend` 事件，第二个字段不全/重复。
- **位置**：`src/ntqqapi/dispatcher.ts` 里 `handleFriendRequest`，可能 `0x210` subType=35 与其他兜底分支重复触发。
- **修复**：core.ts 里 `nt/raw/friend-request` 处理加上 `(friendUid, reqTime)` 去重，30s 内同一申请只 emit 一次 `nt/friend-request`。

### 4. 好友申请通过时，没有上报 `friend_add` 事件，反而又出 2 个不正常的 request ✅ 已修复
- **现象**：bot 同意加好友后应该上报 `notice.friend_add`，实际**没有这条事件**；同时又出现两条不该出现的 `request` 事件。
- **位置**：`OB11FriendAddNoticeEvent` 没有被任何代码路径 emit。
- **修复**：dispatcher `handleFriendGrayTip` 增加 `busiId === 19324 || templId === 10229` 分支，emit `nt/raw/friend-added`；adapter 桥接到 `OB11FriendAddNoticeEvent`。同时 `entities.ts privateEvent` 放宽 `msgType` 检查支持直连模式 (msgType=2)。重复 request 由 #3 的去重一并解决。

### 5. `profile_like` 事件没有上报 ✅ 已修复
- **现象**：被点赞时 `OB11ProfileLikeEvent` 类已定义，但**没有触发路径**。
- **来源**：可能在 `0x210` subType=39（friend-pin / 资料赞）分支里漏识别。
- **修复**：dispatcher `handleFriendDeleteOrPin` 之前 forward 时只发了 msgContent bytes，adapter 解码失败；改为 forward 完整 `Msg.Message` bytes，adapter 现在能正确路由到 `OB11ProfileLikeEvent`。

### 6. `group_upload` 事件没有上报 ✅ 已修复
- **现象**：群成员上传文件后，secondary bot 应该收到 `notice.group_upload`，实际**没有**。
- **位置**：`OB11GroupUploadNoticeEvent` 类已定义。直连模式下需要在群消息推送里识别 `RichText` 中的 `groupFile` 元素并 emit。
- **修复**：直连模式下所有消息 `msgType=2`，但 `entities.ts groupEvent` 之前要求 `msgType in [3, 5]`；放宽到 `[2, 3, 5]`，按 element 判别。

### 7. 邀请机器人入群时，申请加群事件没有上报 ✅ 已修复
- **现象**：被邀请加群（`request.group, sub_type='invite'`）应该上报，**直连模式下没收到**。
- **位置**：`src/ntqqapi/dispatcher.ts` 里 `handleGroupInvitation`（处理 `MsgType.Event0x20D` / `GroupInvitation`）。
- **修复**：dispatcher 之前用 `msg.contentHead.msgSeq` 当 `notify.seq`，但 core.ts 把 seq 当微秒时间戳过滤启动前事件（`+seq / 1000 / 1000 < startupTime`），导致 invite 全被滤掉。改为 `Date.now() * 1000`。

### 8. Bot 为群管理员/群主时，有人申请入群，没有上报 `request.group, sub_type='add'` ✅ 已修复
- **现象**：群管理员视角下别人申请入群应该收到通知，直连模式没收到。
- **位置**：`src/ntqqapi/dispatcher.ts` 里 `handleGroupJoinRequest`（处理 `MsgType.GroupJoinRequest=84`）。
- **修复**：同 #7，`notify.seq` 改为 `Date.now() * 1000` 微秒时间戳。

### 9. 解散群聊事件没有上报 ✅ 部分修复（kick_me 路径）
- **现象**：群被解散时应该上报 `notice.group_dismiss`，实际**没有**。
- **位置**：`OB11GroupDismissEvent` 类已定义，但直连模式下没有触发路径——`nt/raw/group-detail-update` 是 wrapper 模式 NT listener 才有的。
- **修复**：adapter `nt/system-message-created` msgType=34 增加 `tip.type === 3` (KickSelf) 分支，emit `OB11GroupDecreaseEvent` (`sub_type='kick_me'`)。群解散时 bot 也走这条路径（operatorUid 是群主）。完整的 `OB11GroupDismissEvent` 区分需要抓包到独立的 dismiss SSO 推送。

### 10. 群头衔事件没有上报 ✅ 已修复
- **现象**：群成员头衔变更时应该上报 `notice.notify, sub_type='title'`，实际**没有**。
- **位置**：`OB11GroupTitleEvent` 类已定义，可能在 `0x2DC` 灰条提示分支里需要识别 `groupTitleChange` 类的 grayTip。
- **修复**：dispatcher `handleGroupGrayTip` 增加 `busiId === 2407` 分支，emit `nt/raw/group-title-changed`；adapter 桥接到 `OB11GroupTitleEvent`。templateParam key 取 `mqq_uin/member_uin/uin` 兜底，`title/new_title/honor` 兜底，需后续按抓包微调。

### 11. 群消息贴表情事件没有上报 ✅ 已修复
- **现象**：`set_msg_emoji_like` 调用后接收方应该收到 `notice.group_msg_emoji_like`，**没有**。
- **位置**：dispatcher 已有 `nt/raw/group-reaction` 事件 emit（`0x2DC` subType=16 + GeneralGrayTip 解析），但 OB11 adapter 那边没把它转成 OB11 事件。
- **修复**：adapter 增加 `nt/raw/group-reaction` 桥接；dispatcher 顺手补全 `groupCode`（之前固定为 '0'），从 0x2DC content 头 4 字节读取。

### 12. 群禁言事件没有上报 ✅ 已修复
- **现象**：被禁言/解除禁言时应该上报 `notice.group_ban`，实际**没有**。
- **位置**：dispatcher 里 `handleGroupMute`（`0x2DC` subType=12）已 emit `nt/raw/group-mute` 和 `nt/raw/group-mute-all`，但 OB11 adapter 没桥接。
- **修复**：adapter 增加 `nt/raw/group-mute` / `nt/raw/group-mute-all` 桥接 → `GroupBanEvent`；dispatcher `handleGroupMute` 也兜底从 0x2DC 头读 groupCode。

### 13. 群精华事件没有上报 ✅ 已修复
- **现象**：精华消息变更（添加/删除）应该上报 `notice.essence`，实际**没有**。
- **位置**：dispatcher 里 `handleGroupEssenceChange`（`0x2DC` subType=21）已 emit `nt/raw/group-essence-change`，但 OB11 adapter 没桥接。
- **修复**：adapter 增加 `nt/raw/group-essence-change` 桥接 → `GroupEssenceEvent`，通过 `findCachedMsgByPeerSeq` + `createMsgShortId` 拿到 `message_id` 和 `sender_id`。

### 14. 闪传文件事件没有上报
- **现象**：闪传文件状态（uploading / uploaded / downloading / downloaded）应该上报 `notice.flash_file`，实际**没有**。
- **位置**：`OB11FlashFileEvent` 4 个子类已定义；NT 模式下走 `nodeIKernelFlashTransferListener` 桥接，直连模式下需要识别相关 SSO 推送（目前 `nt/raw/flash-file-*` 事件主要是 NT wrapper 模式）。
- **状态**：直连模式下闪传相关 SSO 推送命令未确定，需抓包后实现。

## 共同模式

很多都是 **「raw event 已 emit 但 OB11 adapter 没把它转成 OB11 标准事件」**——优先看 `src/onebot11/adapter.ts` 里 `this.ctx.on('nt/raw/...', ...)` 的桥接代码，缺的就补。

剩下少数（#3 / #4 / #6 / #7 / #8 / #14）需要在 `src/ntqqapi/dispatcher.ts` 解析对应 SSO 推送、emit 出新的 `nt/raw/*` 事件，再到 adapter 里桥接。

## 已完成进度

13/14 已修复（#1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13）。剩 1 项（#14 闪传文件）需要抓包确认 SSO 推送命令——直连模式下 `trpc.flashtransfer.*` 推送的 cmd 名和 proto 字段都没有现成参考（Lagrange / tanebi 都没实现），需要实际样本才能补 dispatcher 解析逻辑。

