import React, { useEffect, useState } from 'react'
import { Loader2, MonitorSmartphone } from 'lucide-react'
import { usePluginContext } from '@luckylillia/plugin-sdk/webui'

interface LaunchQQProps {
  /** What the bridge runs with, from /api/login-info: the chosen QQ, and a configuration file given at launch */
  target?: { configPath: string; qqPath: string }
  /** Why the last session ended, from NativeQQ */
  failure?: string
  onLaunched: () => void
}

/** The official QQ client bridge before its session: QQ starts, and gets injected, when the user asks */
const LaunchQQ: React.FC<LaunchQQProps> = ({ target, failure, onLaunched }) => {
  const ctx = usePluginContext()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  // The QQ found on the bot's machine, looked for again after a failed launch: QQ may have been installed since
  const [found, setFound] = useState<{ detected: string | null } | null>(null)
  const [looks, setLooks] = useState(0)
  const chosen = target?.qqPath
  // A configuration file given at launch may name the QQ itself
  const findsItself = !chosen && !target?.configPath

  useEffect(() => {
    if (!findsItself) return
    let current = true
    ctx.api('/api/nativeqq/qq-path').then(
      data => current && setFound(data as { detected: string | null }),
      () => current && setFound(null),
    )
    return () => {
      current = false
    }
  }, [findsItself, looks])

  const launch = async () => {
    setStarting(true)
    setError('')
    try {
      await ctx.api('/api/nativeqq/launch', { method: 'POST' })
      onLaunched()
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动 QQ 失败')
      setLooks(looks + 1)
    } finally {
      setStarting(false)
    }
  }

  const message = error || failure
  const missing = findsItself && found?.detected === null
  const which = chosen || (findsItself ? found?.detected : undefined)
  return (
    <div className="py-10 flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-2xl gradient-primary-br flex items-center justify-center">
        <MonitorSmartphone size={28} className="text-white" />
      </div>
      <div>
        <div className="text-base font-medium text-theme">启动官方 QQ 客户端</div>
        <p className="text-sm text-theme-secondary mt-1">LLBot 启动本机的 QQ 并注入，之后在这里快速登录或扫码登录</p>
        {which && <p className="text-xs text-theme-muted mt-1 break-all">将启动 {which}</p>}
      </div>
      {missing && !message && (
        <div className="w-full max-w-md p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-700 dark:text-amber-400 text-sm text-left">
          这台机器上没找到官方 QQ 客户端。请先安装 QQ，或点上面「登录方式」的「更改」选择 QQ 的可执行文件
        </div>
      )}
      {message && (
        <div className="w-full max-w-md p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm text-left">
          {message}
        </div>
      )}
      <button onClick={launch} disabled={starting} className="btn-primary flex items-center gap-2 disabled:opacity-60">
        {starting && <Loader2 size={18} className="animate-spin" />}
        {starting ? '正在启动...' : message ? '重新启动 QQ' : '启动 QQ'}
      </button>
    </div>
  )
}

export default LaunchQQ
