# Docker 部署

## 基础镜像用 alpine (musl)

sign-proxy 的 Linux `.node` (`src/main/qqProtocol/direct/sign-proxy/`) 现在有 **musl 变体**
(`sign-proxy.linux-x64-musl.node` / `sign-proxy.linux-arm64-musl.node`), loader
(`sign-proxy/index.ts` 的 `pickTriple` / `isMusl`) 在 musl 环境自动选它, 所以能用
`node:24-alpine` base。镜像 ~540MB, 比 debian (~880MB) 小近一半。

> 历史 (2026-07 前曾结论"必须 glibc/debian, 不能 alpine"): 当时只有 glibc 链接的 .node
> (NEEDED `libc.so.6`, 要 `GLIBC_2.29`), alpine 加载不了。现已被 musl 变体推翻。glibc 版
> (`sign-proxy.linux-x64.node` / `linux-arm64.node`) 仍保留, 非 musl 环境 (debian/裸机) 走它。

`llbot.js` 顶层 import 链就 require sign-proxy (base.ts → direct → sign.ts → sign-proxy),
require 在 import 期即发生, 所以 .node 必须能加载 —— musl 变体保证 alpine 下不崩。

### musl sign-proxy 怎么编出来的 (LuckyLillia.SignProxy 仓库)

Windows 本机即可交叉编译 (靠 zig, 不用 alpine 机器)。一键 (确保 std target -> 编两颗 -> 只同步
musl 到 Bot):

    npm run build:musl-bot            # scripts/build-musl.mjs, 一条龙

拆开手动跑:

    rustup target add x86_64-unknown-linux-musl aarch64-unknown-linux-musl   # 一次性
    npm run build:linux-x64-musl      # 或 build:linux-arm64-musl / build:linux-musl(两个)
    npm run sync-to-bot               # 注意: 这个拷 dist 下全部 .node, 会覆盖 gnu/win 等; 只要
                                      # musl 用 build:musl-bot (只同步两颗 musl)

> 国内装 musl std 的坑: `rustup target add` 拉 `rust-std-<ver>-*-musl` 时, 官方源常卡死
> (0 KB/s), tuna 镜像可能没同步新版本 (404)。用 rsproxy: `RUSTUP_DIST_SERVER=https://rsproxy.cn
> rustup target add aarch64-unknown-linux-musl` 秒下。zig 交叉本身不需要网络。

命门 (踩过的坑):
- `--cross-compile` 让 napi 用 **zig** 当交叉 C 工具链 + musl 链接器 (不用 alpine/docker)。
- `.cargo/config.toml` 给 musl target 设 `rustflags = -C target-feature=-crt-static`:
  .node 是 cdylib (.so), musl 默认 `+crt-static` 会把 libc 静态焊进 .so → alpine dlopen 出问题
  且体积大; 关掉 → 动态链系统 musl (`/lib/ld-musl-*.so.1`), 正常加载。验证过: clean 重编产物
  跟手敲 `RUSTFLAGS=-crt-static` 逐字节一致 (config.toml 确被 zig 交叉吃到)。
- crypto 能跑因为 SecureSDK 用 rustls + ring (非 openssl), 全 musl 兼容 (SignToken 握手成功即证)。
- `postbuild-rename.mjs` 特意**保留 -musl 后缀** (只折叠 gnu/msvc), 否则 linux-x64-musl 被改名成
  linux-x64 会覆盖掉 glibc 那颗。

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

## GNU sed (alpine 自带 busybox sed 不够)

startup.sh 里的 sed 用了 `\s` (GNU 扩展), alpine 自带的 busybox sed 不认, 所以三个
Dockerfile 都 `apk add sed` 装 GNU sed 覆盖。startup.sh shebang 是 `#!/bin/sh` (POSIX,
alpine 的 /bin/sh = busybox ash 也能跑)。

## healthcheck

alpine / debian slim 都没有 `curl`, llbot 容器的 healthcheck 用 node 内置 fetch 探 WebUI:
`node -e "fetch('http://127.0.0.1:'+(process.env.WEBUI_PORT||3080))..."`。
(用户在 WebUI 里关掉 webui 的话会显示 unhealthy, 只影响状态展示, 不影响运行。)

## 文件清单

| 文件 | 用途 |
|------|------|
| `docker/Dockerfile` | 发布镜像 (alpine), 从 GitHub release 下载 LLBot.zip (CI docker.yml 用); **release zip 须含 musl .node, 即 v8.0.8+** |
| `docker/Dockerfile.local` | 本地两阶段构建 (builder debian 跑 yarn build, production alpine) |
| `docker/debug.Dockerfile` | COPY 本机预构建 dist/ (需先 yarn build), alpine; debug-build-amd64.ps1 用 |
| `docker/startup.sh` | 容器入口, 纯直连; **shebang 是 #!/bin/sh** (POSIX, alpine ash 兼容) |
| `script/install-llbot-docker.sh` | 交互式向导, 生成单服务 (llbot) docker-compose.yml |
