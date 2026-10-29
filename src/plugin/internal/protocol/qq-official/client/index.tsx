import React from 'react'
import { SchemaSettings, type WebUIPlugin } from '@luckylillia/plugin-sdk/webui'
import { IntentsField } from './IntentsField'

export const name = 'builtin:qq-official'

const QQOfficialSettings = () => (
  <SchemaSettings
    links={[{ label: '开放平台', href: 'https://q.qq.com/qqbot/' }]}
    sections={[
      { title: '消息', fields: ['useMarkdownIfAt', 'autoStreamText', 'retryWhen', 'manualAcknowledge'] },
      { title: '单聊菜单和群聊指令面板', fields: ['privateSlash', 'privateMenu', 'groupSlash', 'groupPanels'] },
    ]}
  >
    <p className="text-xs text-theme-muted leading-relaxed">
      机器人发的消息会尽量作为被动回复发出：群聊在消息发出 5 分钟内最多回复 5 条，单聊 60 分钟内最多 4 条，频道 5 分钟内。
      超出后改发主动消息，平台通常会拒绝，除非群主开启了主动消息。
    </p>
  </SchemaSettings>
)

const apply: WebUIPlugin = (ctx) => {
  ctx.page({ id: 'qqofficial', title: 'QQ 官方机器人', icon: 'bot', component: QQOfficialSettings, order: 14, settings: true })
  ctx.field('qq-official-intents', IntentsField)
}

export default apply
