import { lazy } from 'react'
import { type WebUIPlugin } from '@luckylillia/plugin-sdk/webui'
import { bindContext } from './context'

// The chat client is about a third of the WebUI bundle: fetched when the page first opens
const WebQQEntry = lazy(() => import('./WebQQEntry'))

export const name = 'builtin:webqq'

const apply: WebUIPlugin = (ctx) => {
  bindContext(ctx)
  ctx.page({ id: 'webqq', title: 'WebQQ', icon: 'message-square', component: WebQQEntry, order: 50 })
  ctx.declareSlot('webqq.chat.actions', {
    title: 'WebQQ 聊天窗口按钮',
    description: 'WebQQ 聊天窗口顶栏右侧的按钮，拿到当前打开的聊天',
    cardinality: 'list',
  })
  ctx.declareSlot('webqq.message.element', {
    title: 'WebQQ 消息显示',
    description: '按元素类型（elementType，如 14 是 markdown）换掉 WebQQ 对它的画法，或者画出 WebQQ 不认识的类型',
    cardinality: 'keyed',
  })
  ctx.declareSlot('webqq.message.bubble', {
    title: 'WebQQ 消息气泡',
    description: '包在每条消息的气泡外面，能加东西，也能改掉里面的内容',
    cardinality: 'chain',
  })
}

export default apply
