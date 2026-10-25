# 卡片消息签名（`cardMsgSignUrl`）调研

> 2026-10-25 调研结论：音乐卡片和链接分享卡片可以在 NT 层原生生成签好名的卡片，不需要第三方签名服务；任意卡片 JSON（OneBot `json`、Milky `light_app`、小程序）做不到自动签名。尚未实现，方案和待实测项见文末。

## 现状

- 只有 OneBot 的 `music` 段会签名：`src/onebot11/transform/message/outgoing.ts` 用 `MusicSign`（`src/common/utils/sign.ts`）把歌曲参数 POST 到 `cardMsgSignUrl`，拿回卡片 JSON，再作为 ark 元素发出。
- OneBot `json` 段和 Milky `light_app` 段把 JSON 原样当 ark 元素发出；NT 层的 `SendElement.ark()`（`src/ntqqapi/entities.ts`）也不签名。Milky、Satori 没有音乐段。
- 推荐联系人卡片已经是 NT 层原生拿到签好名的卡片：`OidbSvcTrpcTcp.0x12b6_0`（`getFriendRecommendContactArk` / `getGroupRecommendContactArk`）。

## 签名服务是怎么工作的

- `OidbSvc.0xb77_9`（OIDB 0xb77，子命令 9，富消息 / 音乐分享）在 Linux QQ 3.2.28 的真机签名白名单里（`src/main/qqProtocol/direct-lib/cmd.ts` 的 `LINUX_STATIC_SIGN`，来源见 LuckyLillia.Sign 的 `docs/Linux/algorithm/QQ-3.2.28-48517.md`），说明 NT 客户端现在仍在用它。
- LuckyLillia.Sign 的手表 QQ 资料（`reference/Android/watch/watch-cmd-list.md` §2、`watch-login-protocol.md`）记录了一个手表 QQ 工具：`music.go` 的 `BuildMusicShare` / `ShareMusicSelf` / `parseMusicOIDBResult`，配合 `messages.go` 的 `WaitPrivateMessage`，上层 `handleMusic` 包成 HTTP 接口，"musicsign" 这个叫法就是从这里来的。
- 也就是说，签名服务就是一个 QQ 号：用 0xb77_9 把卡片分享给自己，等这条私聊消息推回来，把里面服务器签好的卡片 JSON 返回给调用方。0xb77_9 的请求只带标题、摘要、跳转链接、封面、音频链接，以及音乐平台的 appid 和客户端信息；卡片 JSON 和签名都由服务器生成。

## 结论

1. **音乐卡片和链接分享卡片可以在 NT 层原生生成**。bot 本身就是一个登录着的 QQ 客户端，自己做"分享给自己、截获卡片"即可。`sendPB` 在直连和 PMHQ 两种模式下都有实现，OIDB 封装在 `src/main/qqProtocol/base.ts`。
2. **任意卡片 JSON 没法自动签名**。0xb77_9 只接受固定模板的字段；本地命令清单和参考资料里都没有"给任意 JSON 签名"的命令。这类卡片只能由调用方提供已经签好的 JSON（比如转发收到的卡片）。所以"NT 层对所有卡片自动签名"做不到，能做的是"NT 层提供音乐 / 链接分享卡片的生成"。

## 建议方案（未实现）

- NT 层新增一个生成分享卡片的接口：用 0xb77_9 发给自己，在消息推送里等到这条发给自己的私聊（按标题 / 链接匹配，带超时），取出卡片 JSON，撤回这条消息后返回。同一张卡片可以缓存复用。
- 适配器只负责参数转换。OneBot `music` 段的 `custom` 类型可以直接用；`qq` / `163` 等只给歌曲 id 的类型要先查到歌曲信息 —— 原来签名服务替我们做了这一步，自己做就得调各音乐平台的公开接口。
- `cardMsgSignUrl` 改成兜底：原生生成失败、或者只有 id 查不到歌曲信息时再用它。它是 NT 层的配置，留在 bot 设置里，不进 OneBot 的 schema。

## 待实测

- 0xb77_9 的 protobuf 字段、各音乐平台的 appid 和客户端信息在当前 NT 协议下是否仍然有效。旧的公开实现里有这些常量，本项目没有验证过。
- 分享给自己是否可行；推送里能否拿到卡片；截获的卡片转发到别的会话后签名是否仍然有效（现有签名服务就是这么用的，大概率可行）。
- 频率风控。
- 也可以直接把 0xb77_9 发给目标会话，由服务器代发。但那样不在正常发送流程里：不能和别的元素拼成一条消息，消息 id 也要从回推里找。
