# 会话生命周期与「假在线」

直连模式下, "Online registered" 打了但收不到 MsgPush、发包全超时的状态叫**假在线**。
本文记录它的成因和现在的处置链路。相关代码: `direct-lib/client.ts` / `direct-lib/online.ts` /
`qqProtocol/direct.ts` / `ntqqapi/dispatcher.ts`。

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
   再往下 `dispatcher.ts` 是个只认 5 个 cmd 的 switch, 无 default, 于是静默蒸发。
2. **心跳吞异常**: `startHeartbeat` 的 catch 只 log 一行, 4.5 分钟一次无限重试, 从不升级。
3. **监控判据错**: `base.startDisconnectMonitoring` 靠 `get_is_connected()`, 而它当时 =
   `client.isLoggedIn` = `session !== null`。session 只是本地对象, 服务端作废它照样为 true →
   `lastConnectedTime` 每 5 秒被刷新 → 掉线回调永不触发。

三层叠加的结果: `selfInfo.online` 停在 true, 没有任何日志之外的反应, 只能人工 `mv session.json`
+ 重新扫码。

## 现在的处置链路

```
错误帧 (seq=0, retCode=-10001)
  └─ client.checkSessionExpired()      认码, 置 sessionExpired, emit 'qq-session-expired'
       └─ direct.ts 'qq-session-expired'  停心跳 + deleteSession(uin) + clearSession + online=false
            └─ client.disconnect()
                 └─ 'close' → scheduleReconnect → initDirectClient
                      └─ session 文件已删 → loadSession 返 null → 退回扫码
```

要点:

- **认码在分发之前**: `checkSessionExpired` 在 pending 匹配之前调, 所以 seq 命中与否都认。
  只 emit 一次 (`sessionExpired` 去重), `setSession` / `clearSession` 时复位。
- **无主的非零 retCode 帧不再进 dispatcher**: 它的 body 不是有效 protobuf, 只 log warn。
  正常推送走 13 型帧 (`parseSsoFrame13` 不设 retCode), 不受影响。
- **emit 推迟一个 microtask**: 监听方会 `disconnect()` 清空 `pendingPackets`; 同步 emit 会把这条帧
  对应请求的 reject 理由从 retCode 改写成 `Disconnected`, 真错因又丢一次。
- **复用 `nt/kicked-offline` 通知**: `kickedType` 填 retCode (不会撞顶号的 1001), 邮件通知和 milky
  `bot_offline` 都能收到。
- **不删 machine_guid**: 凭据到期 ≠ 设备指纹泄露, 删了下次要重新过设备验证。这点跟异地顶号
  (`KickNT` `code=1001`) 相反 — 那个要连 guid 一起清。见 `direct.ts` 的 `nt/kicked-offline`。
- **心跳会升级**: 失败后转 30s 快重试, 连挂 3 次 (或 `isSessionValid` 已 false) 就主动 `disconnect()`,
  最坏约 5.5 分钟能测出来。这条兜住"服务端不回错误帧, 只是静默不理"的情形。

## isLoggedIn vs isSessionValid

两个 getter 语义**不能混用**:

| getter | 含义 | 谁该用 |
|--------|------|--------|
| `isLoggedIn` | 本地有没有 session 对象 | 登录流程判重 (`shouldSkipQrPrint` / QR poll 自退) |
| `isSessionValid` | 凭据是否还被服务端认 | 掉线监控 (`get_is_connected`) / 发包前置检查 (`sendPB`) |

`get_is_connected()` 现在是 `isConnected && isSessionValid` — 加上 TCP 状态, 顺带覆盖"连接断了但
session 还在"那一档。

回归测试在 `test/unit/direct-session-expired.test.ts` (造 12 型未加密错误帧直喂 `handlePacket`)。
