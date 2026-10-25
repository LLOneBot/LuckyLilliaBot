# 卡片消息签名

> 卡片消息就是 NT 层的 ark 元素，"签名"就是让服务器给这段卡片 JSON 发一个 `config.token`（附带 `ctime`）。没有 token 的卡片发得出去，但手机端不显示。两个签名服务（2026-10-25 实现）：
>
> - **通用卡片签名**：NT 层发送时把没有 token 的卡片交给它签。服务由我们自己部署，接口约定见下文；地址写死在 `src/common/utils/sign.ts` 的 `CARD_SIGN_URL`，不作为配置项（owner 定），部署前为空。
> - `musicCardSignUrl`（配置项）：OneBot `music` 段用，兼容原来的音乐签名服务（提交歌曲参数，返回签好名的卡片），默认 `ss.xingzhige.com/music_card/card`。旧字段名 `musicSignUrl` 由迁移和兼容层映射过来。
>
> 不是所有卡片都签得出来，目前已知能签的只有链接分享卡片（`com.tencent.tianxuan.share`）和音乐卡片。

## bot 这边怎么做

- **NT 层统一签名**：`Core.sendMessage`（`src/ntqqapi/core.ts`）发送前对整条消息调 `signCards()`（`src/common/utils/sign.ts`），合并转发节点里的卡片也签。已经带 `config.token` 的卡片（比如转发收到的）原样发；签名失败整条消息不发，并报错。OneBot、Milky、Satori、WebQQ 发消息都经过这里。
- **`CARD_SIGN_URL` 为空时**：卡片原样发送（以前 OneBot `json` / Milky `light_app` 就是这样）。以前短暂存在过的配置项 `cardMsgSignUrl` 已删除，旧配置里的这一项加载时去掉（里面是音乐服务地址的，先挪到 `musicCardSignUrl`）。
- **音乐卡片**（OneBot `music` 段，`src/common/utils/musicCard.ts`）：
  - 配了 `musicCardSignUrl`：`requestMusicCard()` 照原来的方式把歌曲参数 POST 给它，拿回签好名的卡片（带 token，NT 层不再签）。custom 写法同时填 `singer` 和 `content`（各家服务认的不一样）。返回的不是带 token 的 JSON 一律当失败 —— 拒绝可能是 HTTP 200 加一句纯文本，以前会被当成卡片发出去。
  - 没配 `musicCardSignUrl`、`CARD_SIGN_URL` 不为空：`buildMusicCard()` 拼出未签名的音乐卡片，交给 NT 层签名。`subtype` 选平台，默认 QQ 音乐。
  - 两个都没有：报"音乐卡片签名地址未配置"，没签名的音乐卡片在手机上不显示，发了也没用。
  - 歌曲反查（只给 id 时）：网易云用 `music.163.com/api/song/detail`；QQ 音乐用 `u.y.qq.com` 的 `get_song_detail_yqq`，id 可以是数字 songid 或 songmid。QQ 音乐没有登录态的 vkey，大部分歌拿不到播放地址，`musicUrl` 退回成歌曲页面链接。酷狗 / 酷我 / 咪咕没有简单可用的反查接口。
- **`ss.xingzhige.com` 实测**（2026-10-25）：网易云 `{type, id}` 可用（版权 / VIP 歌曲返回 500"无法准确获取歌曲信息"，比如周杰伦的歌网易云没有）；QQ 音乐 `{type, id}` 返回 HTTP 200 加"关闭id解析功能"，所以 QQ 音乐的 id 由 bot 先查歌、再按 custom 写法提交；custom 写法 `{type, url, audio, title, singer, image}` 可用，但部分内容会被服务端过滤成 500"异常拦截"。返回卡片的 `extra.uin` 是服务自己的号。
- 推荐联系人卡片不经过签名服务：它是 NT 层直接从服务器拿到签好名的卡片（`OidbSvcTrpcTcp.0x12b6_0`，`getFriendRecommendContactArk` / `getGroupRecommendContactArk`）。

## 签名服务的接口约定

- 请求：`POST <CARD_SIGN_URL>`，`Content-Type: application/json`，请求体就是未签名的卡片 JSON 原文。不带收件方。
- 成功：HTTP 200，响应体是签好名的卡片 JSON 原文，`config` 里要有 `token`（bot 会检查，没有就当失败）。
- 失败：非 200，响应体是错误信息，bot 原样放进报错里。
- 音乐卡片的输入长这样，服务按 `extra.appid` 认平台，从 `meta.music` 取字段：

```json
{
  "app": "com.tencent.music.lua", "bizsrc": "qqconnect.sdkshare_music", "view": "music", "ver": "0.0.0.1",
  "prompt": "[分享]晴天", "config": { "type": "normal", "forward": 1 },
  "extra": { "app_type": 1, "appid": 100497308 },
  "meta": { "music": { "app_type": 1, "appid": 100497308, "title": "晴天", "desc": "周杰伦",
    "jumpUrl": "…", "musicUrl": "…", "preview": "…", "tag": "QQ音乐" } }
}
```

平台 appid：QQ 音乐 100497308、网易云 100495085、酷狗 205141、酷我 100243533、咪咕 1101053067（取自公开实现，未在本项目实测）。

## 服务端拿 token 的两条路

1. **网页接口 `ark-share/GenSignedArk`**
   - 地址：`https://zb.vip.qq.com/tx/trpc/ark-share/GenSignedArk?g_tk=…`，或 `https://act.qzone.qq.com/v2/vip/tx/trpc/ark-share/GenSignedArk?g_tk=…`，POST。
   - 请求体：`{ "ark": "<未签名卡片 JSON 字符串>", "config": { "forward": 1, "type": "normal" }, "uinType": …, "toUin": "<收件方>" }`。鉴权用对应域名的登录态 cookie（`uin` / `skey` / `p_skey`）加 `g_tk`。网上的第三方"ark 签名"接口要用户交出 uin / skey / pskey，背后转调的就是它。
   - 有资料说它只签 `app: com.tencent.tianxuan.share`（新闻 / 链接分享样式），别的 app 返回无权限。
   - 请求里要收件方，而 bot 发给签名服务时不带收件方，服务端得自己决定填什么，或者确认 token 不和收件方绑定。
2. **`OidbSvc.0xb77_9` 分享（音乐 / 链接分享）**
   - 它在 Linux QQ 3.2.28 的真机签名白名单里（`direct-lib/cmd.ts` 的 `LINUX_STATIC_SIGN`），NT 客户端仍在用。
   - LuckyLillia.Sign 的手表 QQ 资料（`reference/Android/watch/watch-cmd-list.md` §2）记录了一个工具：`ShareMusicSelf` 把卡片分享给自己，`WaitPrivateMessage` 等这条私聊推回来，再把服务器签好的卡片通过 HTTP 返回，"musicsign" 这个叫法就出自这里。原来的音乐签名服务就是这种做法。
   - 只接受标题、链接、封面、音频这类固定字段，卡片由服务器生成。

## 待实测（签名服务部署时）

- `GenSignedArk` 的返回格式、`uinType` 取值，用哪个域名的 p_skey（vip.qq.com 还是 qzone.qq.com）。
- token 是否和收件方绑定；如果绑定，"不带收件方"的约定要改。
- 0xb77_9 的字段和平台 appid 在当前 NT 协议下是否仍然有效；频率限制和风控。

## 参考

- [mirai issue #2279：希望支持 json 消息的 ark 签名](https://github.com/mamoe/mirai/issues/2279)
- [精易论坛：json 卡片 QQ 群 ark 消息签名](https://bbs.ijingyi.com/thread-14780343-1-1.html)（`GenSignedArk` 地址与请求体）
- [QQ ARK 签名第三方接口说明](https://api.aa1.cn/doc/tenark.html)（签名后卡片的 `config` 样例）
- [QQ 空间 ark 消息签名（CSDN）](https://blog.csdn.net/weixin_55873007/article/details/139032323)：`GenSignedArk` 只对 `com.tencent.tianxuan.share` 有效
- [Alife.QQEnhance v4.9.26 发布说明](https://github.com/AinaLife-ai/Alife.QQEnhance/releases/tag/v4.9.26)：`ss.xingzhige.com` 各平台实测结果
