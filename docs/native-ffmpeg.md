# 可选 FFmpeg 插件与精简原生引擎

FFmpeg 由用户按需安装的 `lucky-lillia-plugin-ffmpeg` 提供，Bot 不内置、不自动安装。插件通过 `ctx.ffmpeg` 共享媒体能力，独立安装、停用和更新不影响 QQ 登录与适配器启动。安装前可在插件市场查看；尚未发布到市场时，可使用插件工程生成的 `.tgz` 从「本地压缩包」安装。

## 调用范围与缺插件时的行为

| 使用位置 | 缺少或未启用插件时 |
| --- | --- |
| NTQQ 的语音发送（OneBot、Milky、Satori、通用插件）和官方机器人语音发送 | SILK 直接发送，时长暂用 1 秒并提示安装插件以读取准确时长；WAV 等其他格式返回安装提示 |
| NTQQ 视频发送的信息和封面 | 使用既有默认信息和默认封面，并在日志提示安装；用户提供的封面仍可用 |
| 群相册视频封面 | 使用默认封面并提示 |
| OneBot `get_record` | 已有 AMR/WAV 的同格式输出无需插件；SILK → WAV 等转码返回安装提示 |
| WebQQ 语音播放 | 原始 WAV 可直接播放；SILK、AMR 等需要解码时显示安装提示 |

必须转换时抛 `FFmpegUnavailableError`，错误码 `FFMPEG_PLUGIN_MISSING`，提示安装并启用 `lucky-lillia-plugin-ffmpeg`。不会自动安装，也不会使用机器上的 FFmpeg 命令作为兜底。损坏媒体、磁盘错误与插件缺失分开处理。

## 工程边界

- `../LuckyLillia.Plugins/lucky-lillia-plugin-ffmpeg/`：唯一的插件仓库和 npm 包，`src/` 保存服务入口，`native/` 包含加载器、六个平台的 `.node`、许可证和 `build-sources.json`。插件更新一起替换这些资源。
- 插件仓库的 `engine/`：C++、裁剪配置、跨平台构建、测试样本和 FFmpeg / SILK SDK submodule，与插件入口在同一个 Git 仓库维护。插件根目录运行 `npm run sync:native`，校验全部产物后从 `engine/artifacts/` 同步到 `native/`。`engine/` 不作为独立 npm 包，也不进入插件安装包。
- Bot：只保留媒体调用和 fallback。SDK 只定义 `FFmpegAPI`、`FFmpegAudioFormat`、`FFmpegMediaInfo` 与 `Context.ffmpeg`。Bot 构建不要求检出插件仓库，也不打包 FFmpeg 二进制。

新插件按需声明 `inject: ['ffmpeg']`；可选功能使用局部 `ctx.inject(['ffmpeg'], ...)`，不要将整个协议或适配器设为依赖该服务。`main.ts` 调用 `installFFmpegBridge(ctx)`，通过局部注入为现有媒体工具绑定当前服务；清理使用 `ctx.effect`，服务停用或更新时撤销旧引用。这样保留旧内置 npm 包的 `getVideoInfo(filePath)` 等调用签名，普通插件仍通过 `ctx.ffmpeg` 访问。

旧 `settings.json.ffmpeg` 和 `setFFMpegPath()` 仅保留读取兼容，不再控制转换。`FFMPEG_PATH` 不用于寻找可执行文件。Docker 和发布流程不再安装、下载 FFmpeg / ffprobe。

## 上游源码与精简配置

FFmpeg submodule 固定在 [`9bfa1635aef08e777deaeeae15ff9a5ade412188`](https://github.com/FFmpeg/FFmpeg/commit/9bfa1635aef08e777deaeeae15ff9a5ade412188)，标题为 `avformat/iff: Error out with 0 channel loudspeaker configuration`。原始源码的 10,080 个文件全部匹配该提交，没有源码补丁；精简内容在原有构建组件白名单中。旧快照工具误过滤的两个 FATE 测试文件完整保留，来源记录同时校验完整树和历史兼容摘要。

各平台共用引擎工程的 `components.txt`，从 `--disable-everything` 开始，禁用 CLI、网络、设备、avfilter 和自动检测。继续保留原有精简音视频解码器，为既有八种音频输出增加编码器、封装器及固定源码依赖。直接链接 libavformat、libavcodec、libswresample、libswscale，耗时任务在 Node-API 8 异步工作线程执行，不启动子进程。

原始 `script/ffmpeg` 中的本地生成物已完整移到引擎忽略的 `output/legacy-source`，旧 CLI 配方在 `legacy/build-ffmpeg.sh`。实际构建从干净 submodule 导出源码，不使用旧快照。

在插件仓库根目录执行 `git submodule update --init --recursive` 准备两个上游。`npm run build:native -- --target <平台>` 在对应系统构建，其他原生构建命令见插件的 `engine/README.md`。根目录 `.github/workflows/build.yml` 构建并测试六个平台，汇总原生产物后同步、验证和打包插件，同时提供对应源码和六份重新链接材料。构建与打包不要求安装未发布的 SDK；服务生命周期测试使用本地 Bot 提供的 SDK。

SILK SDK 来自 [kn007/silk-v3-decoder](https://github.com/kn007/silk-v3-decoder) 的 `silk/` 目录，submodule 固定在 `507be6bca8ce1fb977a061481f1d79e8c610e309`，SDK 版本为 `1.0.9.6`。只编译通用 C 编解码库，与精简 libav 一起静态链接到同一个 `.node`；不运行上游转换脚本，不给 FFmpeg 或 SDK 源码打补丁。SDK 自带的 Skype 许可及镜像许可均随插件分发。Bot 已移除 `silk-wasm` 依赖。

插件 1.1.0 增加 `silkVersion()` 及 `format: 'silk'`。`probe` / `decodeAudio` / `transcodeAudio` 按文件内容识别标准和腾讯 SILK，编码输出腾讯格式；时长按解出的实际帧数计算，支持每包多个帧。尾部不足 20 ms 的 PCM 补零。旧版插件缺少 SILK 能力时，Bot 提示更新并启用。

## 平台、加载与更新

支持 `win-x64`、`macos-arm64`、`linux-glibc-x64`、`linux-glibc-arm64`、`linux-musl-x64`、`linux-musl-arm64`。每个产物的 `build.json` 记录实际二进制、FFmpeg 与 SILK SDK 来源和源码树、组件配置与 addon 源码摘要；插件构建校验六个平台及共享来源记录。

加载器根据 Node 平台、架构与 libc 报告选择模块，验证 SHA256 后复制到系统临时目录 `lucky-lillia-ffmpeg/<平台>/LuckyLillia.FFmpeg.<SHA256>.node` 再加载。副本原子就位，支持多实例和 Worker。Windows 不锁住插件安装目录中的原文件，更新后加载新哈希版本；旧的在途任务仍使用已加载副本。

视频封面保留旋转和镜像方向。5 秒内没有结果就使用默认 JPEG，晚返回的原生任务不会覆盖默认文件。原生输入限制为 256 MiB PCM 和 64 MP 图像。

## 验证

引擎 `smoke.mjs` 验证 SILK 与既有八种格式、独立参考音频兼容性、标准 / 腾讯头、多帧包、截断与尾帧补零、PCM 回读、采样率和声道、视频与图片探测、旋转及镜像、超大图像拒绝、并发和错误输入。插件 `test/native-loader.mjs` 验证哈希缓存、运行中替换、损坏缓存和 Worker 并发加载。

`npx tsx test/manual/ffmpeg-media.mts [插件目录]` 在隔离数据目录和空 PATH 下测试真实插件服务、MP3 → Silk → 八种格式、视频探测与封面，并在插件停用后验证 SILK 直接发送、缺插件时的转码 / 播放安装提示和重新启用。默认插件目录为上述同级插件工程；不启动 QQ。

Bot 的 `test/unit/common/ffmpeg.test.ts` 验证服务生命周期与无插件启动，`video.test.ts` 验证超时和默认封面。WebQQ 的语音代理与前端错误处理另有回归用例。

2026-11-11 原生产物验证范围：

| 平台 | 验证范围 |
| --- | --- |
| win-x64 | 实机完整原生测试、加载器测试、Bot/Silk 媒体调用 |
| 两个 Linux x64 | WSL 中对应 libc 的 Node 运行完整原生和加载测试 |
| 两个 Linux arm64 | QEMU 中对应 libc 的 Node 运行完整原生和加载测试 |
| macos-arm64 | 已交叉编译并核对 Mach-O、N-API 导出、macOS 11 最低版本与系统依赖；尚无 macOS 真机运行验证 |
