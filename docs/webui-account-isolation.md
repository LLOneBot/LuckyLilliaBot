# WebUI / WebQQ 的账号隔离

WebUI 是单实例多账号的: 同一个浏览器 profile 会先后登录不同 QQ。凡是跟账号绑定的数据
都必须按 uin 分桶, 否则切号后会看到上一个号的会话、好友、未读。

## 数据清单

### 浏览器端

| 存储 | key | 按账号分 | 备注 |
|------|-----|---------|------|
| zustand `webqqStore` | `<uin>-webqq-storage` | 是 | 最近会话 / 好友 / 群 / 未读 / 滚动位置 / 当前会话 等 |
| IndexedDB 消息缓存 | `webqq-messages-<uin>` | 是 | 每会话最多 100 条; `openDb()` 惰性取 uin, 切号自动 close 重开 |
| 最近表情 | `<uin>-webqq_recent_emojis` | 是 | uin 为空时不读不写 |
| 最近收藏表情 | `<uin>-webqq_recent_fav_emojis` | 是 | 同上 |
| `current-uin` | `current-uin` | — | 分区键本身。**永远不会被清除**, 未登录时它是上一个账号的值 |
| 主题 | `llbot-theme` | 否 | UI 偏好, 有意全局 |
| WebUI 设置 | `llbot-settings` | 否 | UI 偏好, 有意全局 |
| Cookie `webui_token` | — | 否 | WebUI 自身登录态, 与 QQ 号无关 |

### 后端 `data/`

按账号分: `config_<uin>.json`、`qq-session-<uin>.json`、`database/<uin>.v3.db`、`log-bot-<uin>.log`。

有意全局: `machine_guid.bin` / `device_ids.json` (设备指纹, 跨账号共用同一台"设备")、
`auth_token.txt` (sign 服务 token, 机器级)、`email_config.json`、`webui_token.txt`。

BE 路由 (`src/webui/BE/routes/webqq/*`) 全是现打现取当前账号的 NTQQApi, 无跨账号缓存。

## 曾经的坑: 分区键取值时机

key 拼了 uin **不等于**隔离生效 —— 关键是取 uin 的那一刻值对不对。

`localStorage['current-uin']` 由 `App.tsx` 拿到 `/api/config` 响应后才写, 而 zustand
`persist` 默认在**模块 import 时同步 hydrate 一次**(localStorage 是同步 storage)。
两者之间隔着一个 `await`, 于是:

```
t0  current-uin 还是上一个账号 A (登出不清它, 只有全新浏览器才是空)
t1  import webqqStore -> hydrate -> 读 A-webqq-storage -> 内存装的是 A 的数据
t2  /api/config 返回, setCurrentUin(B)
t3  任意一次 set() -> 写入 B-webqq-storage, 内容是 A 的数据   <- 永久污染
```

`recentChats` 的合并逻辑 (`loadContacts` / `refreshContacts` 从本地 map 起手再 merge
服务端数据, 只加不删) 会让 A 的会话在 B 的列表里永远留着。

IndexedDB 逃过一劫只因为它是**惰性**的: `openDb()` 要等用户点开会话才调, 那时 uin 已就位。

### 现在的做法

1. 分区键 `activeUin` 由模块显式持有, 不再现读 `current-uin`; 未赋值前 storage 全部空转,
   宁可不持久化也不写错桶。
2. `skipHydration: true` + `hydrateWebQQStore(uin)`, 由 `App.tsx` 在 `setCurrentUin` 之后调。
3. payload 里带 `_uin` 属主标记。hydrate 前比对, 对不上 (或旧版本没这个字段) 直接删桶 ——
   这条负责清掉存量已被污染的数据。
4. `merge` 用 `INITIAL_PERSISTED` 兜底: 新账号没有存档时, 默认 merge 会让旧账号的内存数据
   活下来, 必须显式抹掉。

回归测试见 `test/webui/stores/webqqStore.test.ts`。

**新增按账号隔离的存储时**: 别用"读全局变量拼 key"这种惰性方案, 除非能确保读取点一定
晚于 uin 就位; 更稳的是显式绑定 + 属主标记。
