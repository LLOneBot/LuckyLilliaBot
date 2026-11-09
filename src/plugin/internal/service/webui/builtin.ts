import type { BuiltinPlugin } from '../../../host'
import { WebUI } from './BE'

export const builtin: BuiltinPlugin = {
  // The way to manage everything else, so it has no switch; nor a restart, which would end the request asking for it
  name: 'builtin:webui',
  title: '页面设置',
  plugin: WebUI,
  manifest: {
    category: 'service',
    icon: 'globe',
    service: { implements: ['webuiServer'] },
    description: {
      zh: '这个网页界面本身：插件管理、侧边栏和插槽，别的插件的页面和接口都挂在它上面',
      en: 'This web interface itself: plugin management, the sidebar and the slots other plugins hang their pages and API on',
    },
  },
  core: true,
}
