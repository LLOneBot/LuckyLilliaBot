# NativeQQ 接入

官方 QQ 客户端桥接由 Bot 进程内的 `NativeQQ` 管理，没有独立的桥接服务，也没有给桌面端用的
IPC。启动参数、设置、路由和 docker 变量都用 NativeQQ 的名字（2026-11-02 起，旧名字
不再识别；已保存的设置启动时由 `config/migrate.ts` 的 `renameNativeQQSettings()` 改名）。
纯协议模式仍使用同一原生包的签名接口。
签名与设备信息代码直接调用 `@/native` 的 `getNativeAddon()`；旧签名加载入口、
独立签名二进制及废弃的 token 兼容文件已移除。

## Windows 启动

在 Bot 工作目录中保存 `data/auth_token.txt`，运行：

```powershell
node dist/llbot.js --nativeqq -q 123456789
```

将示例 QQ 号替换为实际账号。Windows 默认使用 debugger；QQ 安装路径从系统解析，
也可传 `--qq-path`。`-q` / `--qq` 指定的账号会覆盖配置文件的 `quick_login_qq`。
快速登录依赖 QQ 已保存的有效登录状态。

其他配置可通过绝对路径 `--nativeqq-config` 指定。JSON 配置可设置 `hook_mode` 为
`debugger`，以及字符串形式的 `quick_login_qq`。配置文件只能由启动参数给（2026-11-02 起 WebUI
不再有这一项）；WebUI 里只选 QQ 可执行文件，留空时用自动检测到的，见 core-pluginization.md §6。

会话由 WebUI「NTQQ 协议」页的「启动 QQ」创建（`POST /api/nativeqq/launch` → `qqProtocol.launch()`）；启动时给了 `-q` / `quick_login_qq` 或在 docker 里，协议一启动就自动创建。界面上的状态（会话阶段、QQ 进程、是否登录）从 `health()` 读，经 `/api/login-info` 的 `nativeQQ.status` 给页面，见 core-pluginization.md §5。
登录成功后还可勾选「自动登录」，把这个 QQ 号保存在当前实例；下次启动实例时自动创建会话并登录。优先级为 `-q` / `--qq`、NativeQQ 配置文件的 `quick_login_qq`、实例保存的 `autoLoginUin`。勾选项不会重启当前 QQ 会话。
Bot 先创建会话，再由 token watcher 校验授权并允许 QQ 启动。只有 health 同时提供
有效 UIN 和非空 UID 才发布在线状态；启动成功和收到数据包都不能单独代表登录成功。
健康轮询 `probe` 使用实例箭头函数，固定在协议所属实例上；经 WebUI 的 Cordis 服务代理启动后，
也不会随每秒轮询累积 shadow 代理并导致栈溢出（见 `cordis-upgrade-notes.md`）。

「启动 QQ」后，WebUI 通过 `getQuickLoginList()` 读取官方客户端保存的可用账号；选择账号后，
通过 `quickLogin(uin)` 在已启动的 QQ 中登录，不需要重建会话。原生返回接受请求后，Bot 仍等待
health 中的所选 UIN 和非空 UID 确认登录完成。列表暂时未就绪或读取失败会重试，也可继续扫码。
原生包缺少列表或登录接口时，页面明确提示更新，不再静默当成没有账号。
更新原生包后应重启 LLBot；如果 QQ 进程里仍有旧版注入脚本，也需退出并重新启动该 QQ 进程。

协议 `sendPB()` 调用 `NativeQQ.send()`，直接结果不重复广播。接收回调在校验后去掉
可选的 MSF 长度头，`qq/raw` 和响应监听器使用同一份 protobuf 包体。停止 Bot 时等待
原生会话结束；Windows debugger 模式解除调试后保留 QQ 进程。

## 同步与构建

在 LuckyLillia.node 中构建并验证完整 bundle，然后运行：

```text
node scripts/sync-to-bot.mjs --bot-dir <Bot绝对路径>
```

同步目标为 `src/native/lucky-lillia/production`。Bot 中运行 `npm run check` 和
`npm run build`，产物及其完整原生包写入 `dist`。运行时验证哈希，并将当前平台文件
复制到按 buildId 区分的缓存后加载，以便 Windows 上更新原安装目录。

新版只导出 `NativeQQ` 构造器。旧 manifest 使用 `lucky-lillia.node`
文件名时，先验证并备份整个旧 bundle，再同步；不要单独替换二进制或沿用旧 loader。
`--dev` 使用独立 development bundle，不能用 production 自动替代。

## Docker 更新

`docker/Dockerfile.nativeqq` 将 QQ 基础镜像、Node 和 Bot 组合为一个容器（`PROTOCOL_MODE=nativeqq`，
`startup.sh` 以 `--nativeqq --nativeqq-config` 启动；配置文件取 `NATIVEQQ_CONFIG`，默认
`/app/llbot/data/nativeqq_config.json`）。Linux 使用
inline 模式及配套 sidecar，不能使用 Windows debugger。QQ 基础镜像应固定 digest，
并满足 Node 和原生模块的 glibc 运行要求。

Docker 下载按内容哈希复用镜像层。QQ 基础层未变时，更新 Bot 不需要重新下载 QQ。
当前 `COPY dist/` 将 Bot、原生包和依赖放在同一层，所以只修改 JS 也会重新下载这一层；
分开原生包、依赖和 Bot 文件可进一步减少更新体积。镜像层不是文件差量更新。

更新镜像会替换整个容器，容器内的 QQ 和 Bot 都会重启。镜像分层解决下载复用，
不能保留运行中的 QQ 进程。将 `/app/llbot/data` 和 `/root/.config/QQ` 持久化可保留
Bot 配置与 QQ 登录缓存，但不能保证 QQ 永远无需重新验证登录。

## 验证记录（2026-10-31）

- 已同步完整七平台 production bundle；Windows buildId 为
  `6600ba44-b486-4174-a1b2-eedcd58f857b`，不含 sidecar。
- `npm run check`、`npm run build` 通过；原生桥接、生命周期、IPC、协议装载和
  登录路由相关测试共 43 项通过。
- 使用实际 `dist/llbot.js` 和隔离配置，新启动 QQ PID 16648，约 10.6 秒登录
  `721011692`，UIN/UID 就绪。约 11.7 秒 Bot 的自身昵称查询成功，随后连续稳定
  10 秒；最终收发 134/149 包，没有异常或昵称查询失败。
- 通过 IPC 停止 Bot，退出码 0；测试 QQ 以及启动前的 QQ PID 10944 均保留。
  测试没有启用消息适配器，没有修改现有 Bot 配置。

复现命令：

```text
node script/native-debugger-smoke.mjs --uin 721011692 --auth-token-file <授权文件路径>
```

脚本验证内置原生包版本、全新 QQ PID、实际在线身份、Bot 查询得到的昵称和正常退出。
它会启动真实 QQ；输出仅包含元数据，凭证通过内存环境传给子进程。

2026-11-02 去掉 IPC 后两个冒烟脚本改了控制方式，改完没有在真机上重跑：

- 状态：开启只监听 127.0.0.1、随机密码的 WebUI，读 `/api/login-info`（`online` / `uin` / `uid` / `nick`，
  桥接还有 `nativeQQ.status` 的会话阶段、QQ 是否在跑、是否登录、Auth Token）。端口从日志
  `Webui 服务器已启动 127.0.0.1:<port>` 取。
- QQ PID：`health()` 的 `qq_pid` 不再对外，改为 QQ 起来后对比启动前后的 QQ 主进程，多出的那一个就是；
  一个都没多出却登录了，算复用了已有 QQ。收发包计数也不再检查，自身昵称查询已经是一次真实收发。
- 停止：脚本起一个占位进程，通过 `--parent-pid=<PID>` 传给 Bot（它跟着脚本退出），要停时结束它，Bot 的父进程监视
  （`src/main/hostLifecycle.ts`）照常 dispose 后以 0 退出。Windows 上发信号等于直接结束进程，不会 dispose。
  这条路径用真实的 `hostLifecycle` 测过：结束占位进程约 1.2 秒后 Bot dispose 并退出 0。
本次日志位于相邻 Node 项目的 `target/bot-nativeqq-live.log`、
`target/bot-nativeqq-tests.log`、`target/bot-nativeqq-typecheck.log`、
`target/bot-nativeqq-build.log`。Docker、Linux/macOS 的 Bot 实机运行不在本次验证范围。

## 纯协议签名实测（2026-10-31）

移除旧签名入口后，`npm run check`、`npm run build` 和 6 个文件中的 64 项相关
测试通过。签名初始化、签名请求、设备信息和 token 获取统一由新版原生包提供。

在 Windows 上运行实际 `dist/llbot.js`，使用 `direct` 模式和 macOS QQ 协议，
加载上述 Windows production build。隔离配置只复制账号 `721011692` 的有效
加密会话和设备文件，并清空副本昵称，确保自身昵称需要通过实际请求取得。

- 原生 `init` 成功；11 次真实 `signRequest` 调用全部成功，其中 6 次返回的
  sign/token/extra 均为非空 Buffer。登录阶段有些命令允许 token 为空。
- 约 4.6 秒完成登录和自身资料查询 `OidbSvcTrpcTcp.0xfe1_2`。IPC 返回
  `logged_in` 和预期 UIN；`/api/login-info` 返回在线状态、相同 UIN 和非空 UID。
  UID 与加密会话中的身份一致，实时查询得到的昵称与 IPC、HTTP 返回值一致。
- 全程 `NativeQQ` 构造次数为 0；在线状态连续稳定超过 10 秒，IPC 正常停止
  Bot，退出码 0。源会话和设备文件哈希均未改变。

在 Bot 目录复现（需要该协议已保存的有效会话）：

```text
node script/sign-smoke.mjs --uin 721011692 --protocol macos --auth-token-file <授权文件路径> --expected-build-id 6600ba44-b486-4174-a1b2-eedcd58f857b
```

脚本用进程内探针观察真实原生调用，保留原始参数、结果和 Promise，不替换签名
实现。只记录调用和状态元数据，不保存授权、会话内容、签名字节或包体。上面记录里 IPC
的部分是当时的做法，现在登录状态只看 `/api/login-info`，停止方式同上一节。
可用 `--prepare-only` 检查构建和准备隔离配置。

日志位于相邻 Node 项目的 `target/bot-sign-macos-live.log`、
`target/bot-sign-tests.log`、`target/bot-sign-typecheck.log` 和
`target/bot-sign-build.log`。本次验证的是 Windows 主机上的 macOS QQ 协议；
没有验证 macOS 主机、其他协议或聊天消息发送。

## 桥接快速登录更新（2026-11-09）

已重建并同步七平台 production/release 原生包，包含 `getQuickLoginList` 和运行时 `quickLogin`；
Windows buildId 为 `8daaebdf-c1fc-4e52-ae42-07718fcb0edc`。Bot `dist` 也已重新构建，包含
新版 WebUI 和完整原生包。源包与分发目录的完整性校验、57 项相关回归、Bot 类型检查及两端
构建通过。浏览器模拟验证列表读取失败后的恢复、选择账号提交、登录完成前保持等待、空列表
刷新及登录成功后才显示自动登录勾选。WebUI 全量类型检查仍有公共设置和 WebQQ 的既存错误，
本次 NTQQ 改动没有报告类型错误。

原生侧通过 9 项注入脚本测试、3 项本地管道测试，以及 Windows / 四个 Linux 目标的模块加载
和接口检查（ARM64 Linux 使用 QEMU）；macOS 双目标只有构建和静态检查。没有做真实 QQ 登录。
详细记录及旧包备份位置见相邻 Node 项目的 `docs/7-live-node-validation.md`。
