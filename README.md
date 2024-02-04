# LLOneBot API

将NTQQLiteLoaderAPI封装成OneBot11/12标准的API, V12没有完整测试

*注意：本文档对应的是 LiteLoader 1.0.0及以上版本，如果你使用的是旧版本请切换到本项目v1分支查看文档*

## 安装方法

1.安装[LiteLoaderQQNT](https://liteloaderqqnt.github.io/guide/install.html)

2.安装修改后的[LiteLoaderQQNT-Plugin-LLAPI](https://github.com/linyuchen/LiteLoaderQQNT-Plugin-LLAPI/releases)，原版的功能有缺陷

3.安装本项目插件[OneBotApi](https://github.com/linyuchen/LiteLoaderQQNT-OneBotApi/releases/), 注意本插件2.0以下的版本不支持LiteLoader 1.0.0及以上版本

*关于插件的安装方法: 上述的两个插件都没有上架NTQQLiteLoader插件市场，需要自己下载复制到插件目录*

*插件目录:`LiteLoaderQQNT/plugins`*

## 支持的API

目前只支持http协议POST方法，不支持websocket，事件上报也是http协议

主要功能:
- [x] 发送好友消息
- [x] 发送群消息
- [x] 获取好友列表
- [x] 获取群列表
- [x] 获取群成员列表
- [x] 撤回消息
- [x] 上报好友消息
- [x] 上报群消息

消息格式支持:
- [x] 文字
- [x] 图片
- [x] 引用消息
- [x] @群成员
- [x] 语音
- [x] json消息(只上报)
- [ ] 红包
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

## 一些坑

<details>
    <summary>下载了插件但是没有看到在NTQQ中生效</summary>
<br/>
    检查是否下载的是插件release的版本，如果是源码的话需要自行编译。依然不生效请查阅<a href="https://liteloaderqqnt.github.io/guide/plugins.html">LiteLoaderQQNT的文档</a>
</details>
<br/>

<details>
    <summary>调用接口报404</summary>
<br/>
    目前没有支持全部的onebot规范接口，请检查是否调用了不支持的接口，并且所有接口都只支持POST方法，调用GET方法会报404
</details>
<br/>

<details>
    <summary>发送不了图片和语音</summary>
<br/>
    检查当前操作用户是否有LiteLoaderQQNT/data/LLOneBot的写入权限，如Windows把QQ上安装到C盘有可能会出现无权限导致发送失败
</details>
<br/>

<details>
    <summary>不支持cq码</summary>
<br/>
    cq码已经过时了，没有支持的打算(主要是我不用这玩意儿，加上我懒)
</details>
<br/>

<details>
    <summary>onebot 12对接不了</summary>
<br/>
    onebot 12只写了部分兼容，没有完整测试，不保证能用，慎用
</details>
<br/>

<details>
    <summary>QQ变得很卡</summary>
<br/>
    这是你的群特别多导致的，因为启动后会批量获取群成员列表，获取完之后就正常了
</details>
<br/>


## TODO

- [ ] 转发消息记录 
- [ ] 好友点赞api
- [ ] 支持websocket，等个有缘人提PR实现
- [ ] 重构摆脱LLAPI，目前调用LLAPI只能在renderer进程调用，需重构成在main进程调用

## onebot11文档
<https://11.onebot.dev/>
