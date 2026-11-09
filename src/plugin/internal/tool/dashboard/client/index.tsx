import { type WebUIPlugin } from '@luckylillia/plugin-sdk/webui'
import { BotResourcesCard, SystemResourcesCard, UptimeCard } from './cards'
import { DashboardHeader, DashboardPage } from './DashboardPage'

export const name = 'builtin:dashboard'

const apply: WebUIPlugin = (ctx) => {
  ctx.declareSlot('dashboard.header', { title: '状态面板标题', description: '替换状态面板顶部的标题和欢迎语', cardinality: 'single' })
  ctx.declareSlot('dashboard.cards', { title: '状态面板卡片', description: '状态面板上的卡片', cardinality: 'list', configurable: true })
  ctx.page({ id: 'dashboard', title: '状态面板', icon: 'layout-dashboard', order: 0, component: DashboardPage, header: DashboardHeader })
  // Its own cards are contributions like anyone else's, so other plugins' cards line up among them by `order`
  ctx.slot('dashboard.cards', { id: 'uptime', label: '运行时间', component: UptimeCard, order: 1 })
  ctx.slot('dashboard.cards', { id: 'llbot', label: 'LLBot 资源', component: BotResourcesCard, order: 2 })
  ctx.slot('dashboard.cards', { id: 'system', label: '系统资源', component: SystemResourcesCard, order: 3 })
}

export default apply
