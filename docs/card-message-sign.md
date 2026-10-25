# 卡片消息签名（`cardMsgSignUrl`）调研

> 2026-10-25 调研结论：卡片消息就是 NT 层的 ark 元素，"签名"就是让服务器给这段卡片 JSON 发一个 `config.token`（附带 `ctime`）。腾讯自己有给任意卡片 JSON 签名的网页接口，bot 用自己的登录态就能调，所以可以在 NT 层发送时统一自动签名，不需要第三方签名服务。尚未实现，方案和待实测项见文末。

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
   - 任意卡片 JSON 都能签，所以适用于 OneBot `json`、Milky `light_app`、自己拼出来的音乐卡片。
2. **`OidbSvc.0xb77_9` 分享（只限音乐 / 链接分享）**
   - 它在 Linux QQ 3.2.28 的真机签名白名单里（`direct-lib/cmd.ts` 的 `LINUX_STATIC_SIGN`），NT 客户端仍在用。
   - LuckyLillia.Sign 的手表 QQ 资料（`reference/Android/watch/watch-cmd-list.md` §2）记录了一个工具：`ShareMusicSelf` 把卡片分享给自己，`WaitPrivateMessage` 等这条私聊推回来，把服务器签好的卡片通过 HTTP 返回，"musicsign" 这个叫法就出自这里。现有的音乐签名服务就是这种做法。
   - 只接受标题、链接、封面、音频这类固定字段，卡片由服务器生成，做不了任意 JSON。

## 建议方案（未实现）

- **NT 层统一签名**：发消息时，对没有 `config.token` 的 ark 元素，按这条消息的收件方调 `GenSignedArk`，把返回的卡片换进去再发。已经带 token 的（比如转发收到的卡片）原样发。签名失败时直接报错，不发一张手机端不显示的卡片。
- **音乐卡片**：适配器把参数转换成音乐卡片 JSON，交给 NT 层签名。`custom` 类型参数齐全，可以直接拼；`qq` / `163` 等只给歌曲 id 的类型要先查歌曲信息，原签名服务替我们做了这一步。`cardMsgSignUrl` 可以只留给"按 id 查歌并生成卡片"这件事，或者干脆去掉。
- 这样签名就从 OneBot 层挪到了 NT 层，所有适配器都受益。

## 待实测

- `GenSignedArk` 的返回格式、`uinType` 取值（群和私聊各是多少），以及用哪个域名的 p_skey（vip.qq.com 还是 qzone.qq.com）。
- token 是否和收件方绑定：请求里带了 `toUin`，如果绑定，转发到别的会话就得重签。
- 是否所有 app 类型都能签；频率限制和风控；接口是内部网页接口，可能变动，需要失败兜底。

## 参考

- [mirai issue #2279：希望支持 json 消息的 ark 签名](https://github.com/mamoe/mirai/issues/2279)
- [精易论坛：json 卡片 QQ 群 ark 消息签名](https://bbs.ijingyi.com/thread-14780343-1-1.html)（`GenSignedArk` 地址与请求体）
- [QQ ARK 签名第三方接口说明](https://api.aa1.cn/doc/tenark.html)（签名后卡片的 `config` 样例）
