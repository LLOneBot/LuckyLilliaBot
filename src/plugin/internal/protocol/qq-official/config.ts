import Schema from 'schemastery'
import type { QQOfficialConfig, QQOfficialIntent, QQOfficialMenuItem, QQOfficialPanelItem } from '@/common/types'

const INTENTS: [QQOfficialIntent, string][] = [
  ['GROUP_AND_C2C_EVENT', '群聊和单聊消息、加好友、机器人进退群、群消息接收开关'],
  ['GROUP_MEMBER_EVENT', '群成员进出、入群申请'],
  ['INTERACTION', '按钮回调等互动事件'],
  ['MESSAGE_AUDIT', '消息审核结果'],
  ['GUILDS', '频道和子频道的创建、变更、删除'],
  ['GUILD_MEMBERS', '频道成员进出、变更'],
  ['PUBLIC_GUILD_MESSAGES', '频道里 @ 机器人的消息'],
  ['GUILD_MESSAGES', '频道全部消息（仅私域）'],
  ['DIRECT_MESSAGE', '频道私信'],
  ['GUILD_MESSAGE_REACTIONS', '频道表情表态'],
  ['FORUMS_EVENT', '论坛（仅私域）'],
  ['OPEN_FORUMS_EVENT', '论坛（公域）'],
  ['AUDIO_ACTION', '音频播放和上下麦'],
  ['AUDIO_OR_LIVE_CHANNEL_MEMBER', '音视频 / 直播子频道成员进出'],
]

const name = (max: number) => Schema.string().required().description(`名称，最多 ${max} 个字符，一个汉字算 2 个`)

const MenuItem: Schema<QQOfficialMenuItem> = Schema.union([
  Schema.object({
    type: Schema.const('send_message').required().description('发送'),
    name: name(10),
    value: Schema.string().default('').description('点击后填入输入框的内容'),
  }).description('发送'),
  Schema.object({
    type: Schema.const('link').required().description('链接'),
    name: name(10),
    value: Schema.string().default('').description('跳转链接，必须以 https:// 开头'),
  }).description('链接'),
  Schema.object({
    type: Schema.const('switch').required().description('开关'),
    name: name(10),
    value: Schema.string().default('').description('开关的唯一标识'),
    switchDefault: Schema.boolean().default(false).description('默认打开'),
  }).description('开关'),
  Schema.object({
    type: Schema.const('menu').required().description('子菜单'),
    name: name(10),
    subMenuItems: Schema.array(Schema.object({
      type: Schema.union([
        Schema.const('send_message').description('发送'),
        Schema.const('link').description('链接'),
      ]).default('send_message').description('类型'),
      name: Schema.string().required().description('名称'),
      value: Schema.string().default('').description('发送的内容或跳转链接'),
    })).max(5).default([]).description('子菜单项，最多 5 个'),
  }).description('子菜单'),
]) as Schema<QQOfficialMenuItem>

const PanelItem: Schema<QQOfficialPanelItem> = Schema.union([
  Schema.object({
    type: Schema.const('command').required().description('指令'),
    name: Schema.string().required().description('指令文本，最多 14 个字符'),
    description: Schema.string().default('').description('指令说明，最多 30 个字符'),
    onlyAdmin: Schema.boolean().default(false).description('仅群管理员可点击'),
  }).description('指令'),
  Schema.object({
    type: Schema.const('link').required().description('链接'),
    name: Schema.string().required().description('按钮文本，最多 14 个字符'),
    description: Schema.string().default('').description('说明，最多 30 个字符'),
    value: Schema.string().default('').description('跳转链接，必须以 https:// 开头'),
    onlyAdmin: Schema.boolean().default(false).description('仅群管理员可点击'),
  }).description('链接'),
]) as Schema<QQOfficialPanelItem>

export const Config: Schema<QQOfficialConfig> = Schema.object({
  appId: Schema.string().default('').description('机器人 AppID'),
  secret: Schema.string().role('secret').default('').description('机器人 AppSecret：保存后不再显示，留空保留原值'),
  sandbox: Schema.boolean().default(false).description('连接沙箱环境'),
  type: Schema.union([
    Schema.const('private').description('私域'),
    Schema.const('public').description('公域'),
  ]).default('private').description('机器人类型：私域机器人订阅了频道全部消息时，不再重复处理 @ 消息'),
  // The plugin's WebUI draws it grouped, with what each one brings (client/IntentsField.tsx)
  intents: Schema.array(Schema.union(INTENTS.map(([value, label]) => Schema.const(value).description(label))))
    .role('qq-official-intents').default(['GROUP_AND_C2C_EVENT']).description('订阅的事件'),
  useMarkdownIfAt: Schema.boolean().default(true)
    .description('群里 @ 某人时改用 Markdown 发送（平台只在 Markdown 里渲染 @ 某人）；关闭时写成纯文本的“@名字”，对方不会收到提醒'),
  autoStreamText: Schema.array(Schema.union([
    Schema.const('private').description('单聊'),
    Schema.const('group').description('群聊'),
    Schema.const('guild').description('频道'),
  ])).role('checkbox').default([]).description('用原生 Markdown 流式发送纯文本的会话'),
  retryWhen: Schema.array(Schema.natural()).default([]).description('发送遇到这些平台错误码时重试一次'),
  manualAcknowledge: Schema.boolean().default(false).description('不自动回应按钮回调，由插件自己调用回应接口'),
  privateSlash: Schema.boolean().default(false)
    .description('单聊菜单由插件通过 bot.updateCommands() 提供；关闭时用下面配置的菜单'),
  privateMenu: Schema.array(MenuItem).max(10).default([])
    .description('单聊自定义菜单，最多 10 项；非空时整体覆盖平台上的菜单'),
  groupSlash: Schema.boolean().default(false)
    .description('群聊指令面板由插件通过 bot.updateCommands() 提供；关闭时用下面配置的面板'),
  groupPanels: Schema.array(PanelItem).max(20).default([])
    .description('群聊指令面板，最多 20 项；非空时整体覆盖平台上的面板'),
  // Hidden in the WebUI: set them in plugins.json
  endpoint: Schema.string().default('').hidden().description('API 地址，留空用 https://api.bot.qq.com'),
  gatewayUrl: Schema.string().default('').hidden().description('WebSocket 网关地址，留空向平台查询'),
  userInfoApi: Schema.string().default('').hidden()
    .description('按 openid 查询昵称的第三方接口（如 https://oiapi.net/api/Openid），留空不查询；会把用户 openid 发给该接口'),
  disableUserNamePersist: Schema.boolean().default(false).hidden().description('不把消息里见到的用户名存到磁盘'),
  debug: Schema.boolean().default(false).hidden().description('调试日志：记录收到的每个事件和每次 API 调用'),
}) as Schema<QQOfficialConfig>
