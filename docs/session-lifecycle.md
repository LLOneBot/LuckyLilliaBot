# 会话生命周期与「假在线」

直连模式下, "Online registered" 打了但收不到 MsgPush、发包全超时的状态叫**假在线**。
本文记录它的成因和现在的处置链路。相关代码: `direct-lib/client.ts` / `direct-lib/online.ts` /
`qqProtocol/direct.ts` / `qqProtocol/base.ts`。

## 服务端作废凭据长什么样

登录凭据 (d2 / tgt) 有寿命 (实测约 28 天)。到期后服务端不发 KickNT, 而是对**每个** SSO 请求回
一个错误帧:

```
retCode = -10001   extraMsg = "身份验证失败，请你重新登录。(s20)"
```

关键坑: **这个错误帧的 seq 是 0**, 匹配不上任何在飞请求。

## 曾经的三层漏判 (2026-09 修复)

1. **帧层丢 retCode**: `handlePacket` 只在 seq 命中 `pendingPackets` 时才看 retCode; 对不上就
   `emit('push')`, 而 push 路径的载荷只有 `{ cmd, payload }` — retCode / extraMsg 被整个丢掉。
   再往下 `dispatcher.ts` 是个只认几个 cmd 的 switch, 无 default, 于是静默蒸发。
2. **心跳吞异常**: `startHeartbeat` 的 catch 只 log 一行, 4.5 分钟一次无限重试, 从不升级。
3. **监控判据错**: `base.startDisconnectMonitoring` 靠 `get_is_connected()`, 而它当时 =
   `client.isLoggedIn` = `session !== null`。session 只是本地对象, 不因服务端作废而变 →
   `lastConnectedTime` 每 5 秒被刷新 → 掉线回调永不触发。

三层叠加的结果: `selfInfo.online` 停在 true, 没有任何日志之外的反应, 只能人工 `mv session.json`
+ 重新扫码。

## 现在的处置链路

```
错误帧 (retCode=-10001)
  └─ client.handlePacket()          认码在 pending 匹配之前, seq 命中与否都认
       ├─ clearSession()            本地凭据当场作废 -> isLoggedIn 转 false
       ├─ reject 所有在飞请求        理由带上真实 retCode, 不是笼统的 Disconnected
       └─ emit 'session-expired'
            └─ direct.ts            停心跳 + 清 reconnectTimer + deleteSession(uin)
                 ├─ qrPollToken++ / resetQrState / setLoginState('need_qrcode')
                 ├─ ensureQrLoop()  直接进扫码, 不绕 disconnect -> 重连
                 └─ ctx 'qq/session-expired' -> 邮件通知 + milky bot_offline
```

要点:

- **认码在分发之前**: 错误帧 seq=0 匹配不上在飞请求, 放到 pending 之后判就晚了。
- **不删 machine_guid**: 凭据到期 ≠ 设备指纹泄露, 删了下次要重新过设备验证。这点跟异地顶号
  (`KickNT` `code=1001`) 相反 — 那个要连 guid 一起清。见 `direct.ts` 的 `nt/kicked-offline`。
- **sign 在飞时的 session 换代**: `sendCommand` 签名期间 session 可能被作废, 发包前再比一次,
  不一致就抛错, 免得拿废凭据出网。
- **无主的非零 retCode 帧不进 dispatcher**: body 不是有效 protobuf, 只 log warn。正常推送走
  13 型帧 (`parseSsoFrame13` 不设 retCode), 不受影响。
- **心跳会升级**: 失败后转 30s 快重试, 连挂 3 次 (或 session 已被清掉) 就主动 `disconnect()`,
  最坏约 5.5 分钟能测出来。这条兜住"服务端不回错误帧, 只是静默不理"的情形 —— 没有它,
  上面整条链路都不会被触发。
- **掉线监控判据**: `get_is_connected()` = `isConnected && isLoggedIn`。失效时 `clearSession`
  让后者转 false; 前者覆盖"连接断了但 session 还在"那一档。

## 测试

| 文件 | 覆盖 |
|------|------|
| `test/unit/qqProtocol/directSession.test.ts` | -10001 认码 / 在飞请求 reject / 登录恢复守卫 / 掉线回调 |
| `test/unit/qqProtocol/offlineNotifications.test.ts` | `qq/session-expired` 的邮件通知 |
| `test/unit/qqProtocol/directResilience.test.ts` | 心跳失败升级 / 无主错误帧不分发 |

`test/unit/setup.ts` 的 `@/common/utils/environment` mock 必须带 `getProtocol` / `getCdn` ——
direct-lib 在 import 期就会走 `getActiveProfile()`, 缺了会在加载阶段炸。
