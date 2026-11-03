import { type WebUIPlugin } from '@luckylillia/plugin-sdk/webui'
import LogViewer from './LogViewer'

export const name = 'builtin:logs'

const apply: WebUIPlugin = (ctx) => {
  // A settings page for the card's gear: the switch for writing log files is on it
  ctx.page({ id: 'logs', title: '日志', icon: 'scroll-text', order: 20, component: LogViewer, settings: true })
}

export default apply
