import Schema from 'schemastery'
import type { BuiltinConfig } from '../../../host'

/** How the WebUI shows WebQQ; its client reads them, the backend has no use for them. */
export interface WebQQSettings {
  autoHideSidebar: boolean
  fullscreenButton: boolean
}

export const WebQQSchema: Schema<WebQQSettings> = Schema.object({
  autoHideSidebar: Schema.boolean().default(false).description('打开 WebQQ 时自动收起侧边栏'),
  fullscreenButton: Schema.boolean().default(true).description('在 WebQQ 页面右下角显示全屏按钮，点了单独全屏打开 WebQQ'),
})

export const webqqSettings: BuiltinConfig<WebQQSettings> = {}
