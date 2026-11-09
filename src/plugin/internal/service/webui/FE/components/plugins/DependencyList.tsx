import React, { useEffect, useId, useState } from 'react'
import { CheckCircle2, Circle, XCircle } from 'lucide-react'
import { showToast } from '../common'
import { DependencyReport, PackageDependencyInfo, PluginStatus } from '../../types/plugins'
import { getPluginDependencies, setPluginEnabled, TrustRequiredError } from '../../utils/pluginApi'
import { pluginTitle } from './meta'
import TrustDialog from './TrustDialog'

interface DependencyListProps {
  plugin: PluginStatus
  /** The live list: names the other entries, and any change in it may change the report. */
  plugins: PluginStatus[]
}

const DependencyList: React.FC<DependencyListProps> = ({ plugin, plugins }) => {
  const [loaded, setLoaded] = useState<{ pluginId: string; report: DependencyReport } | null>(null)
  const [enabling, setEnabling] = useState<string | null>(null)
  const [trusting, setTrusting] = useState<PluginStatus | null>(null)
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null)
  const listId = useId()
  const expanded = expandedPlugin === plugin.id

  useEffect(() => {
    setExpandedPlugin(null)
  }, [plugin.id])

  useEffect(() => {
    let alive = true
    getPluginDependencies(plugin.id)
      .then(report => alive && setLoaded({ pluginId: plugin.id, report }))
      .catch(() => alive && setLoaded(null))
    return () => {
      alive = false
    }
  }, [plugin.id, plugins])

  const packages = loaded?.pluginId === plugin.id ? loaded.report.packages : undefined
  if (!packages?.length) return null
  const visiblePackages = expanded ? packages : packages.slice(0, 3)

  const byId = new Map(plugins.map(other => [other.id, other]))
  const quote = (id: string) => {
    const other = byId.get(id)
    return other ? `「${pluginTitle(other)}」` : id
  }

  const explainPackage = (dep: PackageDependencyInfo): string => {
    if (dep.state === 'missing') return '未安装，请从插件市场安装'
    const installed = dep.version ? `已安装 ${dep.version}` : '已安装'
    switch (dep.state) {
      case 'incompatible': return `${installed}，版本不满足要求`
      case 'disabled': return `${installed}，尚未启用`
      case 'pending': return `${installed}，等待依赖`
      case 'failed': return `${installed}，运行出错`
      case 'active': return `${installed}，运行中`
    }
  }

  const enable = async (id: string, trust = false) => {
    const other = byId.get(id)
    if (!other) return
    if (!trust && !other.builtin && other.trusted === false) {
      setTrusting(other)
      return
    }
    setEnabling(id)
    try {
      const status = await setPluginEnabled(id, true, trust)
      if (status.state === 'failed') showToast(`启用后运行出错：${status.error ?? '未知错误'}`, 'error')
    } catch (e) {
      if (e instanceof TrustRequiredError && !trust) setTrusting(other)
      else showToast(e instanceof Error ? e.message : '启用失败', 'error')
    } finally {
      setEnabling(null)
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h4 className="text-sm font-medium text-theme">依赖的插件</h4>
        <ul id={listId} className="space-y-3">
          {visiblePackages.map(dep => {
            const entry = dep.entries.map(id => byId.get(id)).find(other => !!other)
            const blocked = dep.state === 'missing' || dep.state === 'incompatible' || dep.state === 'failed'
            const Icon = dep.state === 'active' ? CheckCircle2 : blocked ? XCircle : Circle
            const tone = dep.state === 'active' ? 'text-green-500' : blocked ? 'text-red-500' : 'text-amber-500'
            const enableable = dep.state === 'disabled' ? dep.entries.filter(id => byId.get(id)?.disabled) : []
            return (
              <li key={dep.name} className="flex flex-wrap items-start gap-2 text-sm">
                <Icon size={16} className={`mt-0.5 flex-shrink-0 ${tone}`} />
                <div className="min-w-0 flex-1">
                  <span className="text-theme break-words">{entry ? pluginTitle(entry) : dep.name}</span>
                  <p className="text-xs text-theme-hint font-mono break-all">{dep.name} · {dep.range}</p>
                  <p className="text-xs text-theme-muted">{explainPackage(dep)}</p>
                </div>
                {enableable.map(id => (
                  <button
                    key={id}
                    type="button"
                    disabled={enabling !== null || trusting !== null}
                    onClick={() => enable(id)}
                    className="btn-glass text-xs px-3 py-1.5 flex-shrink-0"
                  >
                    启用{quote(id)}
                  </button>
                ))}
              </li>
            )
          })}
        </ul>
        {packages.length > 3 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpandedPlugin(expanded ? null : plugin.id)}
            className="btn-glass text-xs px-3 py-1.5"
          >
            {expanded ? '收起' : `展开其余 ${packages.length - 3} 项`}
          </button>
        )}
      </section>
      {trusting && (
        <TrustDialog
          plugin={trusting}
          onCancel={() => setTrusting(null)}
          onConfirm={() => {
            setTrusting(null)
            enable(trusting.id, true)
          }}
        />
      )}
    </div>
  )
}

export default DependencyList
