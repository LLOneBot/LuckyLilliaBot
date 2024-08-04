# LLOneBot

LiteLoaderQQNT插件，使你的NTQQ支持OneBot11协议进行QQ机器人开发

> [!CAUTION]\
> **请不要在 QQ 官方群聊和任何影响力较大的简中互联网平台（包括但不限于:B站，微博，知乎，抖音等）发布和讨论*任何*与本插件存在相关性的信息**

TG群：<https://t.me/+nLZEnpne-pQ1OWFl>

## 安装方法

见 <https://llonebot.github.io/zh-CN/guide/getting-started>

## 设置界面

<img src="./doc/image/setting.png" width="400px" alt="设置界面"/>

## HTTP 调用示例

<img src="./doc/image/example.jpg" width="500px" alt="HTTP调用示例"/>

## 支持的 api 和功能详情

见 <https://llonebot.github.io/zh-CN/develop/api>

## TODO

- [x] 重构摆脱LLAPI，目前调用LLAPI只能在renderer进程调用，需重构成在main进程调用
- [x] 支持正、反向websocket（感谢@disymayufei的PR）
- [x] 转发消息记录
- [x] 好友点赞api
- [x] 群管理功能，禁言、踢人，改群名片等
- [x] 视频消息
- [x] 文件消息
- [x] 群禁言事件上报
- [x] 优化加群成功事件上报
- [x] 清理缓存api
- [ ] 框架对接文档

## onebot11文档

<https://11.onebot.dev/>

## Stargazers over time

[![Stargazers over time](https://starchart.cc/LLOneBot/LLOneBot.svg?variant=adaptive)](https://starchart.cc/LLOneBot/LLOneBot)

## 鸣谢

- [LiteLoaderQQNT](https://liteloaderqqnt.github.io/guide/install.html)
- [LLAPI](https://github.com/Night-stars-1/LiteLoaderQQNT-Plugin-LLAPI)
- [chronocat](https://github.com/chrononeko/chronocat/)
- [koishi-plugin-adapter-onebot](https://github.com/koishijs/koishi-plugin-adapter-onebot)
- [silk-wasm](https://github.com/idranme/silk-wasm)

## 友链

- [Lagrange.Core](https://github.com/LagrangeDev/Lagrange.Core) 一款用C#实现的NTQQ纯协议跨平台QQ机器人框架
