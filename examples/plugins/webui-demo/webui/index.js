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

function DemoCard() {
  const [state] = useDemoState()
  return h('div', { className: 'card', style: { padding: 16, borderLeft: `4px solid ${state?.color ?? 'var(--accent)'}` } },
    h('div', { className: 'text-theme-secondary', style: { fontSize: 13 } }, 'WebUI 示例插件'),
    h('div', { className: 'text-theme', style: { fontSize: 24, fontWeight: 600 } }, state ? `${state.clicks} 次点击` : '…'),
  )
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
  ctx.slot('dashboard', DemoCard)
  // Any plugin's config field declared with .role('color') gets this control
  ctx.field('color', ColorField)
}
