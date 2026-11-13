import type { BuiltinPlugin } from '../../../host'
import * as MessageOrder from '.'

export const builtin: BuiltinPlugin = {
  name: 'builtin:message-order',
  title: '消息处理顺序',
  plugin: MessageOrder,
  manifest: {
    category: 'tool',
    icon: 'messages-square',
    description: { zh: '调整消息经过各插件的先后顺序', en: 'Arrange the order in which plugins process incoming messages' },
  },
}
