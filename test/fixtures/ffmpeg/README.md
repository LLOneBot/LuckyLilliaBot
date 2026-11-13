`video.mp4` 是一个 32×24、1 秒、5 帧的合成红色视频，用于 Bot 媒体调用测试。
原生模块源码和完整测试样本位于 `../LuckyLillia.Plugins/lucky-lillia-plugin-ffmpeg/engine/`（路径相对 Bot 仓库根目录）；Bot 测试保留这个小样本，独立检出即可验证。

样本生成命令（测试运行时不需要 FFmpeg 可执行文件）：

```sh
ffmpeg -f lavfi -i color=c=red:s=32x24:r=5:d=1 -c:v mpeg4 -q:v 4 -an -map_metadata -1 video.mp4
```

`reference.silk` 是移除旧编解码依赖前生成的独立参考文件。`reference-silk.json` 保留旧生成器、输入信号及编码文件 / 旧解码 PCM 的 SHA256。旧解码结果与上游 SDK 不一致，返回的 `durationMs: 1040` 也不等于实际 PCM 长度；测试使用 `reference-silk-sdk.json` 中未经修改的上游 `Decoder.c` 的独立输出摘要、48000 字节和 24 kHz 单声道（1 秒）作为基准。两份记录均保留来源，测试无需安装旧生成器。
