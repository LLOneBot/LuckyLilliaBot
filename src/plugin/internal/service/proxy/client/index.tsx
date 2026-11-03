import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { SchemaForm, usePluginContext, type ConfigEditorProps, type WebUIPlugin } from '@luckylillia/plugin-sdk/webui'

export const name = 'builtin:proxy'

// DEFAULT_TEST_URL of the backend
const DEFAULT_TEST_URL = 'https://www.google.com/generate_204'

type TestResult =
  | { ok: true; status: number; latency: number; proxy: string }
  | { ok: false; error: string; latency: number; proxy: string }

/** `address`: what the form holds, saved or not */
const ProxyTest: React.FC<{ address: string }> = ({ address }) => {
  const ctx = usePluginContext()
  const [target, setTarget] = useState(DEFAULT_TEST_URL)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TestResult | { ok: false; error: string; proxy?: undefined; latency?: undefined }>()

  const run = async () => {
    setBusy(true)
    try {
      setResult(await ctx.api<TestResult>('/api/proxy/test', { body: { url: target, proxyAgent: address } }))
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-theme">测试</div>
      <div className="text-xs text-theme-muted">用上面填的代理地址访问下面的地址，不用先保存</div>
      <div className="flex gap-2">
        <input value={target} onChange={event => setTarget(event.target.value)} className="input-field flex-1 font-mono text-sm" />
        <button type="button" onClick={run} disabled={busy} className="btn-glass flex items-center gap-1.5 text-sm flex-shrink-0">
          {busy && <Loader2 size={16} className="animate-spin" />}
          测试
        </button>
      </div>
      {result?.ok && (
        <div className="text-sm text-green-600 dark:text-green-400">
          通了：HTTP {result.status}，{result.latency} 毫秒{result.proxy ? `，经 ${result.proxy}` : '（没填代理地址，这是直连的结果）'}
        </div>
      )}
      {result && !result.ok && (
        <div className="text-sm text-red-500">
          不通{result.proxy ? `（经 ${result.proxy}）` : result.proxy === '' ? '（没填代理地址，这是直连的结果）' : ''}：{result.error}
        </div>
      )}
    </div>
  )
}

// In the plugin's config dialog rather than a page of its own: one address, seldom changed
const ProxyEditor = ({ value, onChange, schema, errors }: ConfigEditorProps<{ proxyAgent?: string }>) => (
  <div className="space-y-6">
    <SchemaForm schema={schema} value={value} onChange={onChange} errors={errors} />
    <ProxyTest address={value?.proxyAgent ?? ''} />
  </div>
)

const apply: WebUIPlugin = (ctx) => {
  ctx.config(ProxyEditor)
}

export default apply
