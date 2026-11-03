// Plain ES module, no build step: `react` and the SDK come from the WebUI through its import map.
import { createElement as h, useCallback, useEffect, useState } from 'react'
import { SchemaSettings, SelectInput, usePluginContext } from '@luckylillia/plugin-sdk/webui'

const errorStyle = { color: 'rgb(239 68 68)', fontSize: 12 }

// One request for every `ai` field on screen; a few seconds old is fresh enough for a dropdown
let cached = { at: 0, promise: undefined }

function fetchAis(ctx, fresh = false) {
  if (fresh || !cached.promise || Date.now() - cached.at > 5000) {
    cached = { at: Date.now(), promise: ctx.api('/api/ai-gateway/ais') }
    cached.promise.catch(() => {
      cached = { at: 0, promise: undefined }
    })
  }
  return cached.promise
}

function useAis() {
  const ctx = usePluginContext()
  const [state, setState] = useState(null)
  const load = useCallback((fresh) => {
    fetchAis(ctx, fresh).then(data => setState(data), error => setState({ failed: error.message }))
  }, [ctx])
  useEffect(() => {
    load(false)
  }, [load])
  return [state, () => load(true)]
}

/** Any plugin's config field declared with `.role('ai')`: one of the gateway's AIs, or empty for its default */
function AiField({ value, onChange, error }) {
  const [state] = useAis()
  if (state?.failed) {
    return h('div', { style: { display: 'grid', gap: 4 } },
      h('input', { className: 'input-field', value: value ?? '', placeholder: 'AI 的名称，留空用默认的', onChange: event => onChange(event.target.value) }),
      h('span', { className: 'text-theme-muted', style: { fontSize: 12 } }, '读不到 AI 网关的 AI 列表：AI 网关启用了吗？'),
      error && h('span', { style: errorStyle }, error),
    )
  }
  const ais = state?.ais ?? []
  const options = [{ value: '', label: state?.default ? `默认（现在是 ${state.default}）` : '默认' }]
  for (const ai of ais) {
    options.push({ value: ai.name, label: `${ai.name}（${ai.model}${ai.vision ? '，能看图' : ''}）` })
  }
  if (value && state && !ais.some(ai => ai.name === value)) {
    options.push({ value, label: `${value}（AI 网关里没有这个）` })
  }
  return h('div', { style: { display: 'grid', gap: 4 } },
    h(SelectInput, { value: value ?? '', options, onChange }),
    error && h('span', { style: errorStyle }, error),
  )
}

// The gateway's AiError kinds, for people
const KIND_TEXT = {
  config: '设置有误',
  auth: 'Key 不对或没有权限',
  quota: '余额或额度用完了',
  'rate-limit': '请求太频繁了',
  request: '请求被拒绝，模型名对吗',
  server: '对方服务出错',
  network: '连不上，地址对吗，要不要代理',
  timeout: '超时',
  response: '回答看不懂，地址是 OpenAI 兼容的吗',
}

function TestResult({ result }) {
  if (!result) return null
  if (result.pending) return h('span', { className: 'text-theme-muted', style: { fontSize: 13 } }, '测试中…')
  if (result.ok) {
    return h('span', { style: { fontSize: 13, color: 'rgb(34 197 94)' } }, `能用，${result.latency} 毫秒，${result.model} 回答：${result.text}`)
  }
  const kind = KIND_TEXT[result.kind]
  return h('span', { style: { ...errorStyle, fontSize: 13 } }, `不能用${kind ? `（${kind}）` : ''}：${result.error}`)
}

function AiRow({ ai, result, onTest }) {
  const stats = ai.calls ? `调用 ${ai.calls} 次，失败 ${ai.failures} 次` : '还没被调用过'
  return h('div', { className: 'card', style: { padding: 12, display: 'grid', gap: 6 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
      h('span', { className: 'text-theme', style: { fontWeight: 600 } }, ai.name),
      h('code', { className: 'text-theme-secondary', style: { fontSize: 13 } }, ai.model),
      ai.vision && h('span', { className: 'text-theme-muted', style: { fontSize: 12 } }, '能看图'),
      ai.proxy && h('span', { className: 'text-theme-muted', style: { fontSize: 12 } }, '走代理'),
      h('span', { className: 'text-theme-muted', style: { fontSize: 12, flex: 1 } }, stats),
      h('button', { type: 'button', className: 'btn-glass', disabled: result?.pending, onClick: onTest }, '测试'),
    ),
    ai.lastError && !result && h('span', { style: errorStyle }, `最近一次失败：${ai.lastError.message}`),
    h(TestResult, { result }),
  )
}

function AiTests() {
  const ctx = usePluginContext()
  const [state, reload] = useAis()
  const [results, setResults] = useState({})
  const test = async (name) => {
    setResults(previous => ({ ...previous, [name]: { pending: true } }))
    let result
    try {
      result = await ctx.api('/api/ai-gateway/test', { body: { ai: name } })
    } catch (error) {
      result = { ok: false, error: error.message }
    }
    setResults(previous => ({ ...previous, [name]: result }))
    reload()
  }
  return h('div', { style: { display: 'grid', gap: 12 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
      h('span', { className: 'text-theme', style: { fontWeight: 500 } }, '测试'),
      h('span', { className: 'text-theme-muted', style: { fontSize: 12, flex: 1 } }, '用的是保存过的设置：改完先保存，再点刷新'),
      h('button', { type: 'button', className: 'btn-glass', onClick: reload }, '刷新'),
    ),
    state?.failed && h('span', { style: errorStyle }, `读不到 AI 列表：${state.failed}`),
    state && !state.failed && state.ais.length === 0 && h('span', { className: 'text-theme-muted' }, '还没有 AI，先在上面添加并保存'),
    ...(state?.ais ?? []).map(ai => h(AiRow, { key: ai.name, ai, result: results[ai.name], onTest: () => test(ai.name) })),
  )
}

function GatewayPage() {
  return h(SchemaSettings, null, h(AiTests))
}

export default function apply(ctx) {
  // Opened from the plugin card too: the settings form with a way to try each AI under it
  ctx.page({ id: 'settings', title: 'AI 网关', icon: 'brain', component: GatewayPage, settings: true })
  ctx.field('ai', AiField)
}
