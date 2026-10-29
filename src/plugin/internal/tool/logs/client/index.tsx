import { type WebUIPlugin } from '@luckylillia/plugin-sdk/webui'
import LogViewer from './LogViewer'

export const name = 'builtin:logs'

const apply: WebUIPlugin = (ctx) => {
  ctx.page({ id: 'logs', title: '日志', icon: 'terminal', order: 20, component: LogViewer })
}

export default apply
