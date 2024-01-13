# LLOneBot API

将NTQQLiteLoaderAPI封装成OneBot11/12标准的API, V12没有完整测试

## 安装方法

1.安装[NTQQLiteLoader](https://github.com/LiteLoaderQQNT/LiteLoaderQQNT)

2.安装修改后的[LiteLoaderQQNT-Plugin-LLAPI](https://github.com/linyuchen/LiteLoaderQQNT-Plugin-LLAPI)，原版的功能有缺陷

3.安装本项目插件[OneBotApi](https://github.com/linyuchen/LiteLoaderQQNT-OneBotApi/releases/)

*关于插件的安装方法: 上述的两个插件都没有上架NTQQLiteLoader插件市场，需要自己下载源码复制到插件目录*

*Windows插件目录:`%USERPROFILE%/Documents/LiteLoaderQQNT/plugins`*

*Mac插件目录:`~/Library/Containers/com.tencent.qq/Data/Documents/LiteLoaderQQNT/plugins`*

## 支持的API

目前只支持http协议POST方法，不支持websocket，事件上报也是http协议

- [x] 获取群列表
- [x] 获取群成员列表
- [x] 获取好友列表
- [x] 发送群消息
- [x] 发送好友消息
- [x] 撤回消息
- [x] 上报好友消息
- [x] 上报群消息

消息格式支持:
- [x] 文字
- [x] 图片
- [x] 引用消息
- [x] @群成员
- [x] 发送语音(只测试了silk编码的amr)
- [ ] 转发消息记录
- [ ] xml

支持的api:
- [x] get_login_info
- [x] send_msg
- [x] send_group_msg
- [x] send_private_msg
- [x] delete_msg
- [x] get_group_list
- [x] get_group_member_list
- [x] get_group_member_info
- [x] get_friend_list

**自己发送成功的消息也会上报，可以用于获取需要撤回消息的id**

## 示例

![](doc/image/example.jpg)

*暂时不支持`"message": "hello"`这种message为字符串的形式*

## onebot11文档
<https://11.onebot.dev/>
