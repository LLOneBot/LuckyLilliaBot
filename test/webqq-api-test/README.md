# WebQQ API Integration Tests

WebUI BE REST endpoint 集成测试。**真起 bot + webui，HTTP 直接打**，不 mock。

## 目的

验证 `src/webui/BE/routes/webqq/*.ts` 暴露的 ~40 个 endpoint 在真协议层下的端到端行为：

- 重构 NT API 字段时端到端发现 webui 是否漏改
- 验证新加的 endpoint 真的 work（最近的 `chats` / `actions` / `fav-emoji/add-from-url`）
- 跟 `test/webui/` 下的 vitest 单测（mock NT API）互补

## 跑前提

- bot 在跑（已经登录、SSO session 还活着）
- webui 已起，能从外部 HTTP 访问到（默认 `http://127.0.0.1:3080`）
- WebUI 密码已经设过

## 配置

```bash
cd test/webqq-api-test
cp config/test.config.example.json config/test.config.json
$EDITOR config/test.config.json
```

```json
{
  "host": "http://127.0.0.1:3080",
  "password": "<你的 webui 登录密码 明文>",
  "user_id": "<bot 自己的 QQ 号>",
  "test_group_id": "<查询测试用的群号 - 不会被改动>",
  "test_user_id": "<查询测试用的用户 QQ 号 - 不会被改动>"
}
```

`password` 是明文（client 会自己算 sha256 当 X-Webui-Token 发）。`config/test.config.json` 在 .gitignore 里，不会上传。

## 安装 + 运行

```bash
npm install

# 默认: 跑所有非破坏性测试 (GET 列表/查询/状态)
npm test

# 跑 destructive 测试 (戳一戳/添加收藏/etc) — 真改 bot 状态
RUN_DESTRUCTIVE=1 npm test

# 单文件
npm test -- tests/chats.test.ts

# Serial 模式 (本来就 maxWorkers=1，没区别)
npm run test:serial
```

跑完会生成 `test-report.html` 可在浏览器打开看报告。

## 覆盖范围 (Phase 1)

| 文件 | 覆盖 endpoints |
|------|----------------|
| `tests/chats.test.ts` | GET `/friends` `/groups` `/pins` |
| `tests/members.test.ts` | GET `/members` `/group-member` `/group-detail` `/uid` `/uin` `/user` `/user-info` |
| `tests/messages.test.ts` | GET `/messages` `/forward-msg` (skip - 没现成 resId) `/video-url` (skip - 没现成 fileUuid) |
| `tests/notifications.test.ts` | GET `/notifications/group` `/notifications/friend` `/notifications/friend/doubt` |
| `tests/fav-emoji.test.ts` | GET `/fav-emoji`; POST `/fav-emoji/add-from-url` (destructive) |
| `tests/actions.test.ts` | POST `/group/poke` `/friend/poke` (destructive); kick/ban/quit/setRole 等更危险的写注释里默认不跑 |

## 不在覆盖内 (Phase 2)

- `/upload` / `/upload-file` (multipart)
- `/events` (SSE)
- `/file-proxy` `/image-proxy` `/audio-proxy` (返二进制流)
- `/messages` POST (发消息 — 需要双账号互发验证)
- `/messages/recall` `/messages/emoji-like` `/messages/ptt-to-text` (需要先有真 msgId/msgSeq)

## 跟 OB11 测试的关系

OB11 测试 (`test/onebot11-api-test/`) 是双账号 OB11 协议测试，结构更复杂（事件订阅 + 双向断言）。
WebQQ 测试是单账号 webui REST 测试，结构上更简单——webui 是给单 bot 的管理面板，无需双向交互。
