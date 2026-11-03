import { type WebUIPlugin } from '@luckylillia/plugin-sdk/webui'
import { AccountCard, QQResourcesCard } from './DashboardCards'
import NTProtocolPage from './NTProtocolPage'

export const name = 'builtin:nt-protocol'

const apply: WebUIPlugin = (ctx) => {
  ctx.page({ id: 'ntqq', title: 'NTQQ 协议', icon: 'smartphone', component: NTProtocolPage, order: 5, settings: true })
  ctx.slot('dashboard.cards', { id: 'account', label: 'NTQQ 账号', component: AccountCard, size: 'wide', order: 10 })
  ctx.slot('dashboard.cards', { id: 'qq-resources', component: QQResourcesCard, title: 'QQ 资源', icon: 'cpu', order: 11 })
}

export default apply
