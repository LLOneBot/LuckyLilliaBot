import { type WebUIPlugin } from '@luckylillia/plugin-sdk/webui'
import NTProtocolPage from './NTProtocolPage'

export const name = 'builtin:nt-protocol'

const apply: WebUIPlugin = (ctx) => {
  ctx.page({ id: 'ntqq', title: 'NTQQ 协议', icon: 'smartphone', component: NTProtocolPage, order: 5, settings: true })
}

export default apply
