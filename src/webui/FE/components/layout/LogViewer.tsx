import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Terminal, Trash2, Pause, Play, ArrowDown } from 'lucide-react'
import { getCookie } from '../../utils/cookie'

interface LogRecord {
  timestamp: number
  type: string
  content: string
  dateTimeStr: string
}

const LOG_ITEM_HEIGHT = 72
const MAX_LOGS = 1000
const BUFFER_SIZE = 10

const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<LogRecord[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [connected, setConnected] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const pausedLogsRef = useRef<LogRecord[]>([])

  const scrollToBottom = useCallback(() => {
    if (containerRef.current && autoScroll) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [autoScroll])

  useEffect(() => {
    let es: EventSource | null = null
    let mounted = true

    const connect = () => {
      const token = getCookie('webui_token') || ''
      const url = `/api/logs/stream?token=${encodeURIComponent(token)}`
      es = new EventSource(url)

      es.addEventListener('connected', () => {
        if (mounted) setConnected(true)
      })

      es.onmessage = (event) => {
        if (!mounted) return
        try {
          const record: LogRecord = JSON.parse(event.data)
          if (isPaused) {
            pausedLogsRef.current.push(record)
          } else {
            setLogs(prev => {
              const newLogs = [...prev, record]
              return newLogs.length > MAX_LOGS ? newLogs.slice(-MAX_LOGS) : newLogs
            })
          }
        } catch (e) {
          console.error('[LogViewer] Failed to parse log:', e)
        }
      }

      es.onerror = () => {
        if (mounted) setConnected(false)
      }
    }

    connect()
    return () => { mounted = false; if (es) es.close() }
  }, [isPaused])

  useEffect(() => { scrollToBottom() }, [logs, scrollToBottom])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const handleResume = () => {
    setIsPaused(false)
    setLogs(prev => {
      const newLogs = [...prev, ...pausedLogsRef.current]
      pausedLogsRef.current = []
      return newLogs.length > MAX_LOGS ? newLogs.slice(-MAX_LOGS) : newLogs
    })
  }

  const handleClear = () => { setLogs([]); pausedLogsRef.current = [] }

  const getLogStyle = (type: string) => {
    switch (type.toLowerCase()) {
      case 'error': return { bg: 'bg-red-50/50 dark:bg-red-900/20', badge: 'text-red-600 dark:text-red-400 bg-red-100/70 dark:bg-red-900/50' }
      case 'warn': return { bg: 'bg-amber-50/50 dark:bg-amber-900/20', badge: 'text-amber-600 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-900/50' }
      case 'info': return { bg: 'bg-blue-50/50 dark:bg-blue-900/20', badge: 'text-pink-500 dark:text-pink-400 bg-pink-100/70 dark:bg-pink-900/50' }
      case 'debug': return { bg: 'bg-gray-50/50 dark:bg-neutral-700/50', badge: 'text-gray-500 dark:text-neutral-400 bg-gray-100/70 dark:bg-neutral-600/50' }
      default: return { bg: 'bg-green-50/50 dark:bg-green-900/20', badge: 'text-green-600 dark:text-green-400 bg-green-100/70 dark:bg-green-900/50' }
    }
  }

  const filteredLogs = useMemo(() => {
    let result = logs
    if (levelFilter !== 'all') result = result.filter(log => log.type.toLowerCase() === levelFilter)
    if (filter) {
      const lowerFilter = filter.toLowerCase()
      result = result.filter(log => log.content.toLowerCase().includes(lowerFilter) || log.type.toLowerCase().includes(lowerFilter))
    }
    return result
  }, [logs, filter, levelFilter])

  const containerHeight = containerRef.current?.clientHeight || 500
  const totalHeight = filteredLogs.length * LOG_ITEM_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / LOG_ITEM_HEIGHT) - BUFFER_SIZE)
  const endIndex = Math.min(filteredLogs.length, Math.ceil((scrollTop + containerHeight) / LOG_ITEM_HEIGHT) + BUFFER_SIZE)
  const visibleLogs = filteredLogs.slice(startIndex, endIndex)
  const offsetY = startIndex * LOG_ITEM_HEIGHT

  return (
    <div className="space-y-4">
      <div className="card p-4">
        {/* 桌面端布局 - 保持原样 */}
        <div className="hidden md:flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
              <Terminal size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-theme">实时日志</h3>
              <div className="flex items-center gap-2 text-xs">
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${connected ? 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
                  {connected ? '已连接' : '未连接'}
                </span>
                <span className="text-theme-muted">{isPaused ? `已暂停 (${pausedLogsRef.current.length} 条待显示)` : `${logs.length} 条日志`}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-neutral-600">
              {[{ value: 'all', label: '全部' }, { value: 'info', label: 'Info' }, { value: 'warn', label: 'Warn' }, { value: 'error', label: 'Error' }].map((item) => (
                <button key={item.value} onClick={() => setLevelFilter(item.value)} className={`px-3 py-1.5 text-xs font-medium transition-all ${levelFilter === item.value ? 'gradient-primary-br text-white' : 'bg-theme-input text-theme-secondary hover:bg-theme-item-hover'}`}>
                  {item.label}
                </button>
              ))}
            </div>
            <input type="text" placeholder="搜索日志..." value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-1.5 text-sm bg-theme-input border border-theme-input rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent w-40 text-theme placeholder:text-theme-hint" />
            <button onClick={() => setAutoScroll(!autoScroll)} className={`p-2 rounded-lg transition-all ${autoScroll ? 'gradient-primary text-white shadow-md' : 'bg-theme-input text-theme-secondary hover:bg-theme-item-hover'}`} title={autoScroll ? '自动滚动已开启' : '自动滚动已关闭'}><ArrowDown size={18} /></button>
            <button onClick={isPaused ? handleResume : () => setIsPaused(true)} className={`p-2 rounded-lg transition-all ${isPaused ? 'bg-gradient-to-br from-green-500 to-emerald-500 text-white shadow-md' : 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md'}`} title={isPaused ? '继续' : '暂停'}>{isPaused ? <Play size={18} /> : <Pause size={18} />}</button>
            <button onClick={handleClear} className="p-2 bg-gradient-to-br from-red-500 to-pink-500 text-white rounded-lg shadow-md hover:shadow-lg transition-all" title="清空日志"><Trash2 size={18} /></button>
          </div>
        </div>
        {/* 移动端布局 */}
        <div className="md:hidden space-y-3">
          {/* 标题行 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md flex-shrink-0">
              <Terminal size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-theme">实时日志</h3>
              <div className="flex items-center gap-2 text-xs">
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full flex-shrink-0 ${connected ? 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
                  {connected ? '已连接' : '未连接'}
                </span>
                <span className="text-theme-muted truncate">{isPaused ? `已暂停 (${pausedLogsRef.current.length} 条待显示)` : `${logs.length} 条日志`}</span>
              </div>
            </div>
          </div>
          {/* 搜索框 */}
          <input type="text" placeholder="搜索日志..." value={filter} onChange={(e) => setFilter(e.target.value)} className="w-full px-3 py-2 text-sm bg-theme-input border border-theme-input rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-theme placeholder:text-theme-hint" />
          {/* 筛选和操作按钮 */}
          <div className="flex items-center justify-between">
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-neutral-600">
              {[{ value: 'all', label: '全部' }, { value: 'info', label: 'Info' }, { value: 'warn', label: 'Warn' }, { value: 'error', label: 'Error' }].map((item) => (
                <button key={item.value} onClick={() => setLevelFilter(item.value)} className={`px-2 py-1.5 text-xs font-medium transition-all ${levelFilter === item.value ? 'gradient-primary-br text-white' : 'bg-theme-input text-theme-secondary hover:bg-theme-item-hover'}`}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setAutoScroll(!autoScroll)} className={`p-1.5 rounded-lg transition-all ${autoScroll ? 'gradient-primary text-white shadow-md' : 'bg-theme-input text-theme-secondary hover:bg-theme-item-hover'}`} title={autoScroll ? '自动滚动已开启' : '自动滚动已关闭'}><ArrowDown size={16} /></button>
              <button onClick={isPaused ? handleResume : () => setIsPaused(true)} className={`p-1.5 rounded-lg transition-all ${isPaused ? 'bg-gradient-to-br from-green-500 to-emerald-500 text-white shadow-md' : 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md'}`} title={isPaused ? '继续' : '暂停'}>{isPaused ? <Play size={16} /> : <Pause size={16} />}</button>
              <button onClick={handleClear} className="p-1.5 bg-gradient-to-br from-red-500 to-pink-500 text-white rounded-lg shadow-md hover:shadow-lg transition-all" title="清空日志"><Trash2 size={16} /></button>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div ref={containerRef} onScroll={handleScroll} className="h-[calc(100vh-240px)] overflow-auto pr-2">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-theme-hint">
              <Terminal size={48} className="mb-3 opacity-50" /><p className="text-sm">等待日志...</p>
            </div>
          ) : (
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div style={{ transform: `translateY(${offsetY}px)` }} className="space-y-1.5">
                {visibleLogs.map((log, index) => {
                  const style = getLogStyle(log.type)
                  return (
                    <div key={`${log.timestamp}-${startIndex + index}`} className={`p-2.5 rounded-lg ${style.bg} hover:shadow-sm transition-shadow`}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs text-theme-hint font-mono">{log.dateTimeStr}</span>
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${style.badge}`}>{log.type.toUpperCase()}</span>
                          </div>
                          <p className="text-sm text-theme-secondary whitespace-pre-wrap break-all font-mono">{log.content}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LogViewer
