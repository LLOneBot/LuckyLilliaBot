import React, { useEffect, useState } from 'react'
import { CheckCircle2, Circle, XCircle } from 'lucide-react'
import { showToast } from '../common'
import { DependencyInfo, DependencyReport, PluginStatus } from '../../types/plugins'
import { getPluginDependencies, setPluginEnabled } from '../../utils/pluginApi'
import { pluginTitle, SERVICE_LABEL, STATE_LABEL } from './meta'

interface DependencyListProps {
  plugin: PluginStatus
  /** The live list: names the other entries, and any change in it may change the report. */
  plugins: PluginStatus[]
}

// Provided by the bot itself; the ones that can be missing are the ones that wait for the login
const HOST_SERVICES = new Set(['account', 'bots', 'database', 'timer', 'webuiServer', 'config', 'store', 'app', 'qqProtocol'])

const DependencyList: React.FC<DependencyListProps> = ({ plugin, plugins }) => {
  const [report, setReport] = useState<DependencyReport | null>(null)
  const [enabling, setEnabling] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getPluginDependencies(plugin.id)
      .then(result => alive && setReport(result))
      .catch(() => alive && setReport(null))
    return () => {
      alive = false
    }
  }, [plugin.id, plugins])

  const { service } = plugin
  if (!report || (!report.dependencies.length && !service.implements.length)) return null

  const byId = new Map(plugins.map(other => [other.id, other]))
  const quote = (id: string) => {
    const other = byId.get(id)
    return other ? `「${pluginTitle(other)}」` : id
  }

  const explain = (dep: DependencyInfo): string => {
    if (dep.available) return dep.provider ? `由${quote(dep.provider)}提供` : 'Bot 自带'
    const candidates = dep.candidates.map(id => byId.get(id)).filter((other): other is PluginStatus => !!other)
    const starting = candidates.filter(other => !other.disabled)
    if (starting.length) {
      return starting.map(other => `${quote(other.id)}已启用，${STATE_LABEL[other.state].label}`).join('；')
    }
    if (candidates.length) return `可由${candidates.map(other => quote(other.id)).join('、')}提供，都未启用`
    if (HOST_SERVICES.has(dep.name)) return 'Bot 自带，登录 QQ 后可用'
    return dep.required ? '没有插件提供这个服务' : '没有插件提供，相关功能不会生效'
  }

  const enable = async (id: string) => {
    setEnabling(id)
    try {
      await setPluginEnabled(id, true)
    } catch (e) {
      showToast(e instanceof Error ? e.message : '启用失败', 'error')
    } finally {
      setEnabling(null)
    }
  }

  return (
    <section className="space-y-2">
      <h4 className="text-sm font-medium text-theme">依赖的服务</h4>
      {report.dependencies.length === 0 && <p className="text-xs text-theme-hint">不依赖其他服务</p>}
      <ul className="space-y-2">
        {report.dependencies.map((dep) => {
          const Icon = dep.available ? CheckCircle2 : dep.required ? XCircle : Circle
          const tone = dep.available ? 'text-green-500' : dep.required ? 'text-red-500' : 'text-theme-hint'
          const label = SERVICE_LABEL[dep.name]
          const enableable = dep.available ? [] : dep.candidates.filter(id => byId.get(id)?.disabled)
          return (
            <li key={dep.name} className="flex items-start gap-2 text-sm">
              <Icon size={16} className={`mt-0.5 flex-shrink-0 ${tone}`} />
              <div className="min-w-0 flex-1">
                <span className="text-theme">{label ?? dep.name}</span>
                {label && <span className="text-xs text-theme-hint font-mono ml-1.5">{dep.name}</span>}
                {!dep.required && <span className="text-xs text-theme-hint ml-1.5">可选</span>}
                <p className="text-xs text-theme-muted">{explain(dep)}</p>
              </div>
              {enableable.map(id => (
                <button
                  key={id}
                  type="button"
                  disabled={enabling !== null}
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
      {service.implements.length > 0 && (
        <p className="text-xs text-theme-secondary">提供服务：<span className="font-mono">{service.implements.join('、')}</span></p>
      )}
      {report.conflicts.map(conflict => (
        <p key={conflict.service} className="text-xs text-amber-600 dark:text-amber-400">
          和{conflict.with.map(quote).join('、')}都提供 {conflict.service}，同时只能运行一个
        </p>
      ))}
    </section>
  )
}

export default DependencyList
