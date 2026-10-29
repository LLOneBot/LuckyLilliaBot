import type { BuiltinPlugin } from '../../../host'
import * as QQOfficial from '.'
import { qqOfficialSettings } from './settings'

export const builtin: BuiltinPlugin = {
  name: 'builtin:qq-official',
  title: 'QQ 官方机器人',
  plugin: QQOfficial,
  config: qqOfficialSettings,
  manifest: {
    category: 'protocol',
    icon: 'bot',
    description: {
      zh: '接入 QQ 开放平台的官方机器人（AppID 登录），插件同样能在它上面收发消息',
      en: 'Runs a QQ open platform bot (AppID login) that plugins can chat through as well',
    },
  },
}
