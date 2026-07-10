# Docker 部署

## 基础镜像必须是 glibc (debian), 不能用 alpine

sign-proxy 的 Linux `.node` (`src/main/qqProtocol/direct/sign-proxy/`) 是 glibc 链接的
(NEEDED `libc.so.6` / `ld-linux-x86-64.so.2`, 最高要求 `GLIBC_2.29`), musl 加载不了。
且 `llbot.js` 顶层 import 链就 require 它 (base.ts → direct → sign.ts → sign-proxy),
alpine 里启动即崩 (即便只跑非直连模式也一样, require 在 import 期就发生)。

→ 所有 Dockerfile 统一 `node:24-bookworm-slim` (bookworm glibc 2.36)。

## 容器只跑直连模式

Docker 暂时去掉了 pmhq (不再生成 pmhq 服务 / 不带 --pmhq-port)。startup.sh 纯直连:
`node llbot.js [-q <uin>]`。**启动哪个号由用户决定**, 两条路:
- `QQ` env 设了 → `-q <uin>` 恢复该号 (无头部署重启后免扫码自动恢复);
- 没设 → 起在 WebUI 登录页, 用户从快速登录列表点选账号 (或扫码)。

install 脚本生成的 compose 里始终带 `QQ=`(留空), 方便用户后填。

**不再** "data 里恰好一个 session 就自动用它" (2026-07 改): 那是替用户做了选择,
跟 WebUI 快速登录列表的设计冲突。

pmhq 模式代码本身还在 (非 docker 场景 CLI/Desktop 仍可用, 靠 `--pmhq-port` argv 触发,
见 `isPmhqMode()`)。若以后要恢复 docker pmhq: startup.sh 加回 `PROTOCOL_MODE` 分发 +
`--pmhq-port/--pmhq-host`, install 脚本加回协议选择和 pmhq+llbot 双服务 compose 分支。

## session 加密 key: 容器内从 data/machine_guid.bin 派生 (直连 session 存活的关键)

直连 session 的敏感字段 (d2/tgt 等) 落盘前用 AES-256-GCM 加密, key 由 getMachineKey()
提供 (`src/main/qqProtocol/direct/session.ts`)。非容器绑 OS machine id;**容器里
/etc/machine-id 随重建而变, 绑它 = 每次重建都要重新扫码**, 所以 `isDockerEnvironment()`
为真时改从 `data/machine_guid.bin` (设备 GUID, machineGuid.ts 管理, 随 data volume
持久化) 派生。startup.sh 不碰 /etc/machine-id, 也没有额外的 key 文件。

权衡 (**有意取舍, 别改回去**): machine_guid.bin 的值 == session 文件里明文的 `guid` 字段
(machineGuid.ts overwriteMachineGuid <-> saveSession 双向同步), 拿到 session 文件即可还原
key —— 容器场景这层加密不防"单独泄露 session 文件", 防线实为整个 data 卷的访问边界。
曾实现过独立随机 `session-key.bin` 来堵这一点, 按维护者决定撤掉了: 卷内多一个 key 文件
与密文同卷, 实际防线相同, 不值得多一套文件/逻辑。收益: 备份/迁移整个 data 卷后 session
直接可用, 免重新扫码。

## healthcheck

debian slim 没有 `ps`/`curl`, llbot 容器的 healthcheck 用 node 内置 fetch 探 WebUI:
`node -e "fetch('http://127.0.0.1:'+(process.env.WEBUI_PORT||3080))..."`。
(用户在 WebUI 里关掉 webui 的话会显示 unhealthy, 只影响状态展示, 不影响运行。)

## 文件清单

| 文件 | 用途 |
|------|------|
| `docker/Dockerfile` | 发布镜像, 从 GitHub release 下载 LLBot.zip (CI docker.yml 用) |
| `docker/Dockerfile.local` | 本地两阶段构建 (yarn build 全流程) |
| `docker/Dockerfile.test` | 直接 COPY 本地 dist/ (需先 yarn build), 加了 curl 方便调试 |
| `docker/debug.Dockerfile` | 同 test 类似, debug-build-amd64.ps1 用 |
| `docker/startup.sh` | 容器入口, 纯直连; **shebang 是 #!/bin/sh** (debian 没有 ash) |
| `script/install-llbot-docker.sh` | 交互式向导, 生成单服务 (llbot) docker-compose.yml |
