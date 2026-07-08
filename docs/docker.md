# Docker 部署

## 基础镜像必须是 glibc (debian), 不能用 alpine

sign-proxy 的 Linux `.node` (`src/main/qqProtocol/direct/sign-proxy/`) 是 glibc 链接的
(NEEDED `libc.so.6` / `ld-linux-x86-64.so.2`, 最高要求 `GLIBC_2.29`), musl 加载不了。
且 `llbot.js` 顶层 import 链就 require 它 (base.ts → direct → sign.ts → sign-proxy),
alpine 里启动即崩 (即便只跑非直连模式也一样, require 在 import 期就发生)。

→ 所有 Dockerfile 统一 `node:24-bookworm-slim` (bookworm glibc 2.36)。

## 容器只跑直连模式

Docker 暂时去掉了 pmhq (不再生成 pmhq 服务 / 不带 --pmhq-port)。startup.sh 纯直连:
`node llbot.js [-q <uin>]`。`QQ_UIN` env 指定恢复哪个 session;
没配时 startup.sh 扫 `data/qq-session-*.json`, 恰好一个就自动用它 (稍后配置模式扫码登录后重启免扫码)。

pmhq 模式代码本身还在 (非 docker 场景 CLI/Desktop 仍可用, 靠 `--pmhq-port` argv 触发,
见 `isPmhqMode()`)。若以后要恢复 docker pmhq: startup.sh 加回 `PROTOCOL_MODE` 分发 +
`--pmhq-port/--pmhq-host`, install 脚本加回协议选择和 pmhq+llbot 双服务 compose 分支。

## session 加密 key: 容器内用 data/session-key.bin (直连 session 存活的关键)

直连 session 的敏感字段 (d2/tgt 等) 落盘前用 AES-256-GCM 加密, key 由 getMachineKey()
提供 (`src/main/qqProtocol/direct/session.ts`)。非容器绑 OS machine id;**容器里 machine id
随重建而变, 绑它 = 每次重建都要重新扫码**, 所以 `isDockerEnvironment()` 为真时改用
`data/session-key.bin` (首次 32B 随机, 落盘, 跟着 data volume 走)。startup.sh 不碰 /etc/machine-id。

坑: **不能拿 `data/machine_guid.bin` 当加密 key** —— 它的值 == session 文件里明文的 `guid`
字段 (machineGuid.ts overwriteMachineGuid <-> saveSession 双向同步), 等于密钥明文躺在密文旁边。
所以 session-key.bin 必须是跟 guid 无关的独立随机值。

安全权衡: key 与密文同在 data 卷 → 防线从"机器绑定"降为"data 卷绑定" (拷走整个 data 即可解密)。
对自部署工具可接受 (session.guid 本就明文、docker 卷本就要可迁移备份); 换来 data 卷可整体迁移/备份恢复免重登。
备份 data 时记得连 `session-key.bin` 一起 (它就在 data 里, 整体备份即包含)。

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
