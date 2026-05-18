# NT API → OIDB Migration Roadmap

## Status

70+ methods identified. Not all need OIDB equivalents — some can use existing `fetchXxx` mixin methods or compute locally.

## Migration Pattern

For each NT method:
1. Find OIDB command in Lagrange `Internal/Services/`
2. Add proto definition in `src/ntqqapi/proto/oidb.ts`
3. Add mixin method in `src/main/qqProtocol/mixins/<topic>.ts` (using `sendPB`)
4. In `src/ntqqapi/api/<topic>.ts`, wrap the existing `invoke` call:
   ```ts
   try {
     return await this.ctx.qqProtocol.invoke(...)  // PMHQ path
   } catch {
     return await /* OIDB fallback via mixin */
   }
   ```

## Migrated ✓

- `GroupService/getMemberInfo` → OIDB 0xfe7_3 (`fetchGroupMembers`)
- `ProfileService/getUserSimpleInfo` → OIDB 0xfe1_2 (`fetchUserInfoByUid`)
- `ProfileService/getCoreAndBaseInfo` → OIDB 0xfe1_2
- `ProfileService/getUserDetailInfoByUin` → OIDB 0xfe1_2 (`fetchUserInfo`)
- `BuddyService/getBuddyNick` → OIDB 0xfe1_2
- `UixConvertService/getUin` → via getUserSimpleInfo

## TODO (priority order)

### Profile (剩余 4 个)
- `ProfileService/fetchUserDetailInfo` → OIDB 0xfe1_2
- `ProfileService/getUserDetailInfoWithBizInfo` → OIDB 0xfe1_2
- `ProfileService/getUidByUin` → OIDB 0xfe1_2 by UIN (response 含 uid，但当前 proto 没解析)
- `ProfileService/setHeader` → OIDB 0x88c_0

### 群操作 (13 个)
| 方法 | OIDB |
|---|---|
| KICK_MEMBER | 0x8a0_0 |
| MUTE_MEMBER | 0x1253_1 |
| MUTE_GROUP | 0x89a_0 |
| SET_MEMBER_CARD | 0x8fc_3 |
| SET_MEMBER_ROLE | 0x8fc_2 |
| SET_GROUP_NAME | 0x89a_0 |
| QUIT_GROUP | 0x1097_1 |
| HANDLE_GROUP_REQUEST | 0x10c8_1 |
| modifyGroupRemark | 0x10c1_0 |
| setGroupMsgMask | 0x89e_0 |
| addGroupEssence | 0xeac_1 |
| removeGroupEssence | 0xeac_2 |
| setHeader | 0x88c_0 |

### 群信息查询 (9 个)
- 群公告 CRUD: 0xb44_1/2/3
- queryCachedEssenceMsg: 0xeac_3
- getGroupHonorList: HTTP API (非 OIDB)
- getGroupShutUpMemberList: 0xed1_0
- searchMember: 0xfe7_3 + filter (本地)
- getSingleScreenNotifies: 0x10c0_2
- checkGroupMemberCache: 本地缓存
- getGroupRecommendContactArkJson: HTTP API
- batchGetGroupFileCount: 0x6d8_1

### 消息查询 (12+ 个)
- getMsgsByMsgId/getSingleMsg/getMsgsBySeqAndCount: `MessageSvc.PbGetMsg`
- queryMsgsWithFilterEx: `MessageSvc.PbGetGroupMsg`
- setMsgRead: `MessageSvc.PbMsgReadInfoUpdate`
- getMsgEmojiLikesList: 0x9082_1
- recallMsg: 0x12fe_1
- forwardMsgWithComment: `MessageSvc.PbSendMsg` (合并转发)
- getSourceOfReplyMsgByClientSeqAndTime: 拼合消息
- getAioFirstViewLatestMsgs: PbGetMsg
- getTempChatInfo: 0x10b8_0
- generateMsgUniqueId: 本地 (Date.now() + random)
- sendShowInputStatusReq: `MessageSvc.PbInputStatus`

### 消息发送 (最复杂)
- sendMsg: `MessageSvc.PbSendMsg` — 涉及消息体编码、文本/图片/语音/视频/合并转发/At 提及 等所有元素
- 图片/语音/视频上传走 highway
- 合并转发：Multi-message 协议

### 文件/相册 (12 个)
- FlashTransfer (闪传): 0x6d8_2 / 0x6d6_2 等
- RichMediaService (群文件): 0x6d6_0 (已有)、0x6d8_1、0x6d9_0
- AlbumService (群相册): HTTP API

### Login (3 个)
- getQRCodePicture → 已有 `fetchQrCode`
- quickLoginWithUin → 用 wtlogin.login + tempPassword (复用 loginWithQrResult)
- getLoginList → 本地 sessions 文件列表

### Misc (10+ 个)
- MSFService/getServerTime → Date.now()
- TicketService/forceFetchClientKey → 0xfde_1
- TipOffService/getPskey → 0xfd1_1
- RecentContactService/getRecentContactListSnapShot → 0x1100_1
- RobotService/getRobotUinRange → 0xfe2_0

## 实施建议

1. **现阶段**：修缺口（仅迁移上层 adapter 实际调用的、会报错的方法）
2. **下一阶段**：批量迁移 群操作 + 群信息查询（13+9 = 22 个）
3. **最后**：消息发送（sendMsg 最复杂，需 highway 上传）+ 文件/相册

## 工作量估算

- Profile: ~2h（已基本完成）
- 群操作: ~6h（操作类相对简单，但 13 个）
- 群信息查询: ~5h
- 消息查询: ~8h（涉及 MessageSvc 协议）
- 消息发送: ~20h（最复杂，含 highway 文件上传）
- 文件/相册: ~10h
- Misc: ~4h

**总计估算 50-60 小时实施 + 调试**，无法在单次会话完成。
