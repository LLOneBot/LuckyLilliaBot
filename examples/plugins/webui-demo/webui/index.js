// Plain ES module, no build step: `react` and the SDK come from the WebUI through its import map.
// Styling sticks to the WebUI's semantic classes (card, btn-primary, text-theme...) and CSS variables;
// Tailwind utility classes only exist when the WebUI happens to use them itself.
import { createElement as h, useCallback, useEffect, useState } from 'react'
import { usePluginContext } from '@luckylillia/plugin-sdk/webui'

function useDemoState() {
  const ctx = usePluginContext()
  const [state, setState] = useState(null)
  const load = useCallback((options) => {
    return ctx.api('/api/webui-demo/state', options)
      .then(setState)
      .catch(error => ctx.toast(error.message, 'error'))
  }, [ctx])
  useEffect(() => {
    load()
  }, [load])
  return [state, () => load({ method: 'POST' })]
}

function DemoPage() {
  const [state, click] = useDemoState()
  if (!state) return h('div', { className: 'card', style: { padding: 24 } }, '加载中…')
  return h('div', { className: 'card', style: { padding: 24, display: 'grid', gap: 16 } },
    h('h3', { style: { fontSize: 20, fontWeight: 600, color: state.color, margin: 0 } }, state.greeting),
    h('p', { className: 'text-theme-secondary', style: { margin: 0 } },
      '这一页由插件 luckylillia-plugin-webui-demo 注册，按钮调用的是它自己挂在 /api/webui-demo 的接口。'),
    h('div', null,
      h('button', { type: 'button', className: 'btn-primary', onClick: click }, `点了 ${state.clicks} 次`)),
  )
}

// Only the inside: the WebUI draws the card with the title and icon given at registration
function DemoCard() {
  const [state] = useDemoState()
  if (!state) return null
  return h('div', { style: { borderLeft: `4px solid ${state.color}`, paddingLeft: 12 } },
    h('div', { className: 'text-theme', style: { fontSize: 24, fontWeight: 600 } }, `${state.clicks} 次`),
    h('div', { className: 'text-theme-secondary', style: { fontSize: 13 } }, '在「WebUI 示例」页里点按钮'),
  )
}

// Gets the chat open in WebQQ; WebQQ declares the slot and draws the header around it
function CopyNumberButton({ chat }) {
  const ctx = usePluginContext()
  const copy = () => navigator.clipboard.writeText(chat.peerId)
    .then(() => ctx.toast(`已复制「${chat.name}」的号码`))
    .catch(() => ctx.toast('复制失败', 'error'))
  return h('button', {
    type: 'button',
    title: '复制号码（WebUI 示例插件）',
    onClick: copy,
    className: 'text-theme-muted',
    style: { padding: 8, borderRadius: 8, fontSize: 13, fontWeight: 600 },
  }, '#')
}

// Keyed by element type: WebQQ has no drawing of its own for markdown (14), so it showed nothing for such a message
function MarkdownSource({ element }) {
  return h('pre', { className: 'text-theme', style: { margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 } },
    element.markdownElement?.content ?? '')
}

// A link of the bubble chain: passes short messages through, folds long ones around what the rest drew
function FoldLongMessage({ message, next }) {
  const [open, setOpen] = useState(false)
  if (message.text.length <= 200) return next
  return h('div', null,
    h('div', { style: open ? undefined : { maxHeight: 120, overflow: 'hidden' } }, next),
    h('button', {
      type: 'button',
      className: 'text-theme-muted',
      style: { fontSize: 12, marginTop: 4 },
      onClick: () => setOpen(!open),
    }, open ? '收起' : '展开全文'),
  )
}

// On the plugin page, its own card only: a way to its page
function OpenPageButton({ plugin }) {
  const ctx = usePluginContext()
  if (plugin.name !== ctx.plugin.name) return null
  return h('a', { href: ctx.pageHref('home'), className: 'text-theme-muted', style: { fontSize: 13, padding: 8 } }, '打开示例页')
}

function ColorField({ value, onChange, error }) {
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
    h('input', { type: 'color', value: value || '#000000', onChange: event => onChange(event.target.value) }),
    h('code', { className: 'text-theme-secondary' }, value),
    error && h('span', { style: { color: 'rgb(239 68 68)', fontSize: 12 } }, error),
  )
}

export default function apply(ctx) {
  ctx.page({ id: 'home', title: 'WebUI 示例', icon: 'sparkles', component: DemoPage })
  ctx.slot('dashboard.cards', { id: 'clicks', title: '点击计数', icon: 'sparkles', component: DemoCard })
  ctx.slot('webqq.chat.actions', { id: 'copy-number', label: '复制号码', component: CopyNumberButton })
  ctx.slot('webqq.message.element', { id: 'markdown', label: 'Markdown 原文', match: '14', component: MarkdownSource })
  ctx.slot('webqq.message.bubble', { id: 'fold', label: '折叠长消息', component: FoldLongMessage })
  ctx.slot('plugins.card.actions', { id: 'open-page', label: '打开示例页', component: OpenPageButton })
  // Any plugin's config field declared with .role('color') gets this control
  ctx.field('color', ColorField)
}
