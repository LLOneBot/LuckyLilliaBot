# LuckyLillia.Bot

## 文档索引

| 文档 | 什么时候必读 |
|------|--------------|
| [docs/docker.md](docs/docker.md) | 改 Dockerfile / startup.sh / compose 生成脚本 / 排查容器内启动崩溃时 |
| [docs/OIDB_MIGRATION.md](docs/OIDB_MIGRATION.md) | 迁移或新增 OIDB 协议调用时 |
| [docs/EVENT_PUSH_TODO.md](docs/EVENT_PUSH_TODO.md) | 处理事件推送相关 TODO 时 |
| [docs/webui-account-isolation.md](docs/webui-account-isolation.md) | 改 WebUI/WebQQ 前端存储 (localStorage / IndexedDB / zustand persist) 或排查切号后显示上个账号数据时 |
| [docs/webqq-sse-events.md](docs/webqq-sse-events.md) | 改 WebQQ 实时事件 (新消息/撤回/表情回应) 或排查"要刷新才更新"类问题时 |
| [docs/multi-protocol.md](docs/multi-protocol.md) | 改协议常量 / 加协议端 / 改 --protocol 或 profile / session 命名 / 排查换协议后登录发包问题时 / 处理某端不支持的 cmd (-10122) 时 / 改各端 sign token 取法 (macOS ESK/A2/SA2) 时 |
| [docs/session-lifecycle.md](docs/session-lifecycle.md) | 排查"假在线"(在线但收不到消息) / 改登录凭据失效检测 / 心跳 / 掉线监控 / session 存删时 / 改设备 guid (machine_guid.bin) 或从它派生的东西 (session 加密 key / macos_device.json) / 排查顶号或切号后快速登录失效时 / 改掉线重连或二维码自动刷新 (qrLoop / 刷新上限) 时 |
