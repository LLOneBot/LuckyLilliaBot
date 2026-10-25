# 卡片消息签名（`cardMsgSignUrl`）调研

> 2026-10-25 调研结论：卡片消息就是 NT 层的 ark 元素，"签名"就是让服务器给这段卡片 JSON 发一个 `config.token`（附带 `ctime`）。方向（owner 定）：NT 层发送时，没有 token 的 ark 交给 `cardMsgSignUrl` 指向的签名服务签，签名不在 OneBot 层做。但不是所有卡片都签得出来：目前已知能签的只有链接分享卡片（`com.tencent.tianxuan.share`）和音乐卡片。尚未实现，接口约定和待实测项见文末。

## 现状

- 只有 OneBot 的 `music` 段会签名：`src/onebot11/transform/message/outgoing.ts` 用 `MusicSign`（`src/common/utils/sign.ts`）把歌曲参数 POST 到 `cardMsgSignUrl`，拿回整段卡片 JSON，再作为 ark 元素发出。
- OneBot `json` 段和 Milky `light_app` 段把 JSON 原样当 ark 元素发出；NT 层的 `SendElement.ark()`（`src/ntqqapi/entities.ts`）也不签名。没有 token 的卡片发得出去，但手机端不显示。
- 推荐联系人卡片是 NT 层原生拿到签好名的卡片：`OidbSvcTrpcTcp.0x12b6_0`（`getFriendRecommendContactArk` / `getGroupRecommendContactArk`）。

## 签名是什么

签好名的卡片多了 `config.ctime` 和 `config.token`，比如 `"config":{"ctime":1681945810,"forward":1,"token":"6b97ddb1…","type":"normal"}`。token 由服务器生成，本地算不出来。

## 两条拿 token 的路

1. **网页接口 `ark-share/GenSignedArk`（推荐）**
   - 地址：`https://zb.vip.qq.com/tx/trpc/ark-share/GenSignedArk?g_tk=…`，或 `https://act.qzone.qq.com/v2/vip/tx/trpc/ark-share/GenSignedArk?g_tk=…`，POST。
   - 请求体：`{ "ark": "<未签名卡片 JSON 字符串>", "config": { "forward": 1, "type": "normal" }, "uinType": …, "toUin": "<收件方>" }`。
   - 鉴权：对应域名的登录态 cookie（`uin` / `skey` / `p_skey`）加 `g_tk`。网上的第三方"ark 签名"接口要用户交出 uin / skey / pskey，背后转调的就是它。
   - bot 已经有现成的基础设施：`ntWebApi.getCookies(domain)` 能拿到指定域名的 skey / p_skey，`ntWebApi.genBkn()` 就是 `g_tk` 算法，`getExpertInfo` 已经在用 vip.qq.com 的 p_skey。
   - 有资料说这个接口只签 `app: com.tencent.tianxuan.share`（新闻 / 链接分享样式），别的 app 返回无权限。所以它能把任意链接做成可用卡片，但签不了任意 app 的卡片。
2. **`OidbSvc.0xb77_9` 分享（只限音乐 / 链接分享）**
   - 它在 Linux QQ 3.2.28 的真机签名白名单里（`direct-lib/cmd.ts` 的 `LINUX_STATIC_SIGN`），NT 客户端仍在用。
   - LuckyLillia.Sign 的手表 QQ 资料（`reference/Android/watch/watch-cmd-list.md` §2）记录了一个工具：`ShareMusicSelf` 把卡片分享给自己，`WaitPrivateMessage` 等这条私聊推回来，把服务器签好的卡片通过 HTTP 返回，"musicsign" 这个叫法就出自这里。现有的音乐签名服务就是这种做法。
   - 只接受标题、链接、封面、音频这类固定字段，卡片由服务器生成，做不了任意 JSON。

## 方案（未实现）

- **NT 层统一签名**：发消息时，没有 `config.token` 的 ark 元素交给 `cardMsgSignUrl` 签（bot 自己不调腾讯的网页接口，风控和接口变动留给签名服务），把返回的卡片换进去再发。已经带 token 的（比如转发收到的卡片）原样发。签不了就直接报错，不发一张手机端不显示的卡片。OneBot `json`、Milky `light_app` 和音乐卡片都走这一处。
- **签名服务的接口要改**：现在默认的 `ss.xingzhige.com/music_card/card` 只接受音乐参数（`{type, id}` 或带歌名 / 封面 / 链接的 custom 写法），返回整段音乐卡片，不接受"给一段卡片 JSON 签名"。而且有人实测它的 `{type, id}` 写法只有网易云可用（`qq` 返回"关闭 id 解析功能"，酷狗 / 酷我 / 咪咕 500），custom 写法各平台都行。需要一个能收卡片 JSON 的签名服务，约定待定。
- **音乐卡片**：OneBot `music` 段只给 id 时，签名服务得先查歌曲信息；或者由 bot 先查好再按 custom 写法提交。

## 待实测

- `GenSignedArk` 的返回格式、`uinType` 取值（群和私聊各是多少），以及用哪个域名的 p_skey（vip.qq.com 还是 qzone.qq.com）。
- token 是否和收件方绑定：请求里带了 `toUin`，如果绑定，转发到别的会话就得重签。
- 是否所有 app 类型都能签；频率限制和风控；接口是内部网页接口，可能变动，需要失败兜底。

## 参考

- [QQ 空间 ark 消息签名（CSDN）](https://blog.csdn.net/weixin_55873007/article/details/139032323)：`GenSignedArk` 只对 `com.tencent.tianxuan.share` 有效
- [Alife.QQEnhance v4.9.26 发布说明](https://github.com/AinaLife-ai/Alife.QQEnhance/releases/tag/v4.9.26)：`ss.xingzhige.com` 各平台实测结果

- [mirai issue #2279：希望支持 json 消息的 ark 签名](https://github.com/mamoe/mirai/issues/2279)
- [精易论坛：json 卡片 QQ 群 ark 消息签名](https://bbs.ijingyi.com/thread-14780343-1-1.html)（`GenSignedArk` 地址与请求体）
- [QQ ARK 签名第三方接口说明](https://api.aa1.cn/doc/tenark.html)（签名后卡片的 `config` 样例）
