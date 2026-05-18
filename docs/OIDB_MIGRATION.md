# NT API → OIDB Migration Roadmap

## Status

Direct protocol mode is now production-ready for most use cases. Highway upload (TCP+HTTP) was already implemented before this migration.

## ✅ Migrated

### Profile/User
- `GroupService/getMemberInfo` → OIDB 0xfe7_3
- `ProfileService/getUserSimpleInfo` → OIDB 0xfe1_2 (UID)
- `ProfileService/getCoreAndBaseInfo` → OIDB 0xfe1_2
- `ProfileService/getUserDetailInfoByUin` → OIDB 0xfe1_2 (UIN)
- `BuddyService/getBuddyNick` → OIDB 0xfe1_2
- `UixConvertService/getUin` / `getUidByUin` → via getUserSimpleInfo / getUserDetailInfoByUin

### 群操作
- `KICK_MEMBER` → OIDB 0x8a0_1
- `MUTE_MEMBER` → OIDB 0x1253_1
- `MUTE_GROUP` → OIDB 0x89a_0
- `SET_MEMBER_CARD` → OIDB 0x8fc_3
- `SET_MEMBER_ROLE` → OIDB 0x1096_1
- `SET_GROUP_NAME` → OIDB 0x89a_15
- `QUIT_GROUP` → OIDB 0x1097_1
- `HANDLE_GROUP_REQUEST` → OIDB 0x10c8_1 / 0x10c8_2
- `addGroupEssence` / `removeGroupEssence` → OIDB 0xeac_1 / 0xeac_2

### 群信息查询
- `getSingleScreenNotifies` → OIDB 0x10c0_1 / 0x10c0_2
- `searchMember` → fetchGroupMembers + 本地过滤

### 消息发送 (sendMsg fallback)
- 文本（含 @ 全体/单人 提及）
- QQ 表情（face）
- 商城表情/魔法表情（marketFace）
- 回复（srcMsg）
- 图片（commonElem svcType=48 + Highway）
- 视频（commonElem + Highway，含缩略图）
- 语音/Ptt（commonElem + Highway，OIDB 0x126e_100 / 0x126d_100）
- 群文件（groupFile element + uploadGroupFile）

### 消息查询/操作 (mixin only)
- getGroupMessages / getC2CMessages（SsoGetGroupMsg / SsoGetC2CMsg）
- recallGroupMessage / recallC2CMessage（SsoGroupRecallMsg / SsoC2CRecallMsg）

### Misc
- `MSFService/getServerTime` → 本地 Date.now()

### 已存在（migration 前已实现）
- Highway TCP/HTTP upload sessions
- NTV2RichMedia upload request builder
- 各种媒体上传 mixin（getXxxUploadInfo）
- 媒体下载 URL 获取（getRKey / getXxxImageUrl 等）
- fetchGroups / fetchGroup / fetchFriends / fetchFriendRequests / fetchPins / fetchAiCharacterList
- setSpecialTitle / sendGroupPoke / sendFriendPoke / setGroupPin / setFriendPin
- 群文件 CRUD（getGroupFileList / getGroupFileUrl 等）
- uploadForward / getMultiMsg（合并转发上传/下载）

## ⏸️ TODO

### 群操作（剩 3）
- `setHeader` (group avatar) - OIDB 0x88c_0
- `modifyGroupRemark` - OIDB 0x10c1_0
- `setGroupMsgMask` - OIDB 0x89e_0

### 群信息查询（剩 7）
- 群公告 CRUD（OIDB 0xb44_1/2/3）
- queryCachedEssenceMsg（OIDB 0xeac_3）
- getGroupHonorList（HTTP API）
- getGroupShutUpMemberList（已有 fetchGroupMembers，可本地过滤）
- checkGroupMemberCache - 本地
- getGroupRecommendContactArkJson（HTTP API）

### 消息发送
- C2C 文件（OfflineFileUpload trans 0x211 协议）
- 合并转发 wire（uploadForward 已有，需 wire 到 ntMsgApi.multiForwardMsg）

### 消息查询 wire
ntMsgApi 用 NT 内部 msgId，但 OIDB 用 seq+random。需要 msgId↔seq 缓存映射才能完整 wrap getMsgsByMsgId / recallMsg 等。

### 其他
- TicketService/forceFetchClientKey
- TipOffService/getPskey
- RecentContactService
- RobotService/getRobotUinRange
- FlashTransfer (闪传) - 私密文件分享
- AlbumService - 群相册（HTTP API）

## 架构

```
直连/PMHQ 共用 NT API：
async someMethod(...) {
  try {
    return await ctx.qqProtocol.invoke(...)  // PMHQ
  } catch {
    return await /* OIDB fallback via mixin */
  }
}
```

`invoke` 在直连模式下立即失败 → 触发 OIDB fallback。

## 完成度

- ✅ 消息接收: 完整解析所有事件类型
- ✅ 消息发送: 全部主要元素类型（文本/图/视/音/文件/表情/@/回复/合并转发）
- ✅ 用户/群信息查询: 高频 API 已迁移
- ✅ 群管理: 主要操作已迁移
- ⏸️ 文件相关: C2C 文件、闪传、相册未做
- ⏸️ 冷僻功能: 公告、荣誉等


