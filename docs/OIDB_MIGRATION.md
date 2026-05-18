# NT API → OIDB Migration Roadmap

## Status

70+ methods identified. Migration in progress.

## Migration Pattern

For each NT method:
1. Find OIDB command in Lagrange `Internal/Services/`
2. Add proto definition in `src/ntqqapi/proto/oidb.ts` (or `action.ts` for non-OIDB SSO)
3. Add mixin method in `src/main/qqProtocol/mixins/<topic>.ts` (using `sendPB`)
4. In `src/ntqqapi/api/<topic>.ts`, wrap `invoke` with try-catch that falls back to OIDB

## ✅ Migrated

### Profile/User (8/8)
- `GroupService/getMemberInfo` → OIDB 0xfe7_3
- `ProfileService/getUserSimpleInfo` → OIDB 0xfe1_2 (UID)
- `ProfileService/getCoreAndBaseInfo` → OIDB 0xfe1_2
- `ProfileService/getUserDetailInfoByUin` → OIDB 0xfe1_2 (UIN)
- `BuddyService/getBuddyNick` → OIDB 0xfe1_2
- `UixConvertService/getUin` → via getUserSimpleInfo
- `ProfileService/getUidByUin` → via getUserDetailInfoByUin

### 群操作 (10/13)
- `KICK_MEMBER` → OIDB 0x8a0_1
- `MUTE_MEMBER` → OIDB 0x1253_1
- `MUTE_GROUP` → OIDB 0x89a_0
- `SET_MEMBER_CARD` → OIDB 0x8fc_3
- `SET_MEMBER_ROLE` → OIDB 0x1096_1
- `SET_GROUP_NAME` → OIDB 0x89a_15
- `QUIT_GROUP` → OIDB 0x1097_1
- `HANDLE_GROUP_REQUEST` → OIDB 0x10c8_1 / 0x10c8_2
- `addGroupEssence` → OIDB 0xeac_1
- `removeGroupEssence` → OIDB 0xeac_2

### 群信息查询 (2/9)
- `getSingleScreenNotifies` → OIDB 0x10c0_1 / 0x10c0_2
- `searchMember` → fetchGroupMembers + 本地过滤

### 消息（mixin only，未 wire 到 ntMsgApi）
- `getGroupMessages` → SsoGetGroupMsg
- `getC2CMessages` → SsoGetC2CMsg
- `recallGroupMessage` → SsoGroupRecallMsg
- `recallC2CMessage` → SsoC2CRecallMsg

### Misc (1/10)
- `MSFService/getServerTime` → 本地 Date.now()

## ⏸️ TODO

### 群操作（剩 3）
- `setHeader` (group avatar) → OIDB 0x88c_0
- `modifyGroupRemark` → OIDB 0x10c1_0
- `setGroupMsgMask` → OIDB 0x89e_0

### 群信息查询（剩 7）
- 群公告 CRUD: 0xb44_1/2/3
- queryCachedEssenceMsg: 0xeac_3
- getGroupHonorList: HTTP API
- getGroupShutUpMemberList: 0xed1_0
- checkGroupMemberCache: 本地缓存
- getGroupRecommendContactArkJson: HTTP API
- batchGetGroupFileCount: 0x6d8_1

### 消息查询（wire 到 ntMsgApi）
ntMsgApi 用 NT 内部 msgId 而 OIDB 用 seq+random，需要 msgId↔seq 映射缓存才能完整 wrap。复杂度高，未做。

### 消息发送 ⚠️ 最复杂
- `MessageSvc.PbSendMsg`: 文本+@+表情+回复消息可实现
- 图片/语音/视频/文件: 需要 **highway 上传协议** 实现
- 合并转发: SsoSendLongMsg（已部分有）

**单独成里程碑，需要 ~20h 实现 + 调试**

### 文件/相册（全部待做）
- FlashTransfer (闪传) - 私密文件分享, 复杂
- RichMediaService (群文件) - 部分 mixin 已有
- AlbumService (群相册) - 走 HTTP API

### Login (已部分有)
- getQRCodePicture → 已有 `fetchQrCode`
- quickLoginWithUin → 用 wtlogin.login + tempPassword (已有 loginWithQrResult)

### Misc（剩 9）
- TicketService/forceFetchClientKey → 0xfde_1
- TipOffService/getPskey → 0xfd1_1
- RecentContactService/getRecentContactListSnapShot → 0x1100_1
- RobotService/getRobotUinRange → 0xfe2_0
- FlashFile (4 个，FlashTransfer 关联)
- 其他

## 架构说明

直连模式 + PMHQ 模式共用同一份 NT API 代码。每个方法的实现：
```ts
async someMethod(...args) {
  try {
    return await this.ctx.qqProtocol.invoke(...)  // PMHQ 路径
  } catch {
    return await this.ctx.qqProtocol.someMixinMethod(...)  // OIDB fallback
  }
}
```

`invoke` 在直连模式下立即失败，触发 OIDB fallback；PMHQ 模式下不会触发 fallback。

## 当前完成度

- **核心读取**: ✅ 用户信息/群成员/群通知/群历史消息查询都能用
- **群管理**: ✅ 踢人/禁言/管理员/群名/精华/表情回应等都能用
- **消息接收**: ✅ 完整解析（之前已完成）
- **消息发送**: ❌ 需要 PMHQ（highway 协议未实现）
- **文件/相册**: ❌ 需要 PMHQ

