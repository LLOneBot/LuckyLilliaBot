import type { BuiltinPlugin } from '../../../host'
import { WebQQ } from '.'
import { webqqSettings } from './settings'

export const builtin: BuiltinPlugin = {
  name: 'builtin:webqq',
  title: 'WebQQ',
  plugin: WebQQ,
  config: webqqSettings,
  manifest: {
    category: 'tool',
    icon: 'message-square',
    description: { zh: '在 WebUI 里像 QQ 客户端一样收发消息', en: 'Chat from the WebUI like a QQ client' },
  },
}
