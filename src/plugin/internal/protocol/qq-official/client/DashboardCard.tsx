import React, { useEffect, useState } from 'react'
import { ArrowUpRight, Bot, Loader2, MessageSquare, Send } from 'lucide-react'
import { usePluginContext, usePluginStatus } from '@luckylillia/plugin-sdk/webui'
import type { QQOfficialStats } from '../statsTypes'

const GLYPH = 'text-white drop-shadow-[0_1px_1.4px_rgba(0,0,0,0.5)]'
const POLL_INTERVAL = 5000

/** The card polls only while visible; failed requests never turn unknown counts into zero. */
function useStats() {
  const ctx = usePluginContext()
  const [stats, setStats] = useState<QQOfficialStats | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const data = await ctx.api<QQOfficialStats>('/api/qq-official/stats')
        if (!stopped) {
          setStats(data)
          setFailed(false)
        }
      } catch {
        if (!stopped) setFailed(true)
      }
      if (!stopped) timer = setTimeout(poll, POLL_INTERVAL)
    }
    void poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [ctx])
  return { stats, failed }
}

const Avatar: React.FC<{ src?: string }> = ({ src }) => {
  const [broken, setBroken] = useState(false)
  return src && !broken ? (
    <img src={src} alt="机器人头像" className="w-10 h-10 rounded-full object-cover shrink-0" onError={() => setBroken(true)} />
  ) : (
    <div className="w-10 h-10 rounded-xl gradient-primary-br flex items-center justify-center shadow-md shrink-0">
      <Bot size={20} className={GLYPH} />
    </div>
  )
}

const Stat: React.FC<{ sent?: boolean; value: number }> = ({ sent, value }) => {
  const Icon = sent ? Send : MessageSquare
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-theme-item min-w-0">
      <div className={'w-10 h-10 rounded-xl flex items-center justify-center shadow-md shrink-0 ' + (sent
        ? 'bg-gradient-to-br from-orange-500 to-amber-500'
        : 'bg-gradient-to-br from-green-500 to-emerald-500')}>
        <Icon size={20} className={GLYPH} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-theme-muted">{sent ? '发送消息' : '收到消息'}</p>
        <p className="text-lg font-bold text-theme truncate">{value.toLocaleString()}</p>
      </div>
    </div>
  )
}

export const QQOfficialCard: React.FC = () => {
  const ctx = usePluginContext()
  const entry = usePluginStatus()
  const { stats, failed } = useStats()
  const connected = !failed && stats?.status === 1
  const status = failed ? '状态暂不可用' : !stats ? '正在读取' : connected ? '已连接'
    : stats.status === 2 ? '正在连接' : stats.status === 4 ? '正在重连' : '未连接'

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
        <h3 className="text-base font-semibold text-theme">QQ 官方机器人</h3>
        <span role="status" className="inline-flex items-center gap-1.5 text-xs text-theme-secondary whitespace-nowrap">
          <span aria-hidden="true" className={'h-2 w-2 rounded-full ' + (connected ? 'bg-emerald-500' : 'bg-neutral-400')} />
          {status}
        </span>
        <a href={ctx.pageHref('qqofficial')} className="ml-auto inline-flex items-center gap-1 text-xs text-pink-500 hover:underline shrink-0">
          前往设置<ArrowUpRight size={14} />
        </a>
      </div>
      {!stats ? (
        <div className="flex-1 flex items-center justify-center gap-2 py-6 text-sm text-theme-muted">
          {failed ? '暂时无法获取机器人信息，正在重试' : <><Loader2 size={20} className="animate-spin" />正在加载机器人信息</>}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4">
            <Avatar key={stats.avatar ?? stats.appId} src={stats.avatar} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-theme truncate">{stats.name || (stats.configured ? 'QQ 机器人' : '等待配置')}</p>
              <p className="text-xs text-theme-muted break-all">{stats.appId ? `AppID：${stats.appId}` : '还没有填写 AppID 和 AppSecret'}</p>
            </div>
            {stats.configured && <span className="shrink-0 text-xs text-theme-muted bg-theme-item px-2 py-0.5 rounded-full">
              {stats.sandbox ? '沙箱环境' : '正式环境'}
            </span>}
          </div>
          {stats.configured ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat value={stats.messageReceived} />
                <Stat sent value={stats.messageSent} />
              </div>
              <div className="mt-auto pt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-theme-muted">
                <span title={`开始统计：${new Date(stats.startedAt).toLocaleString('zh-CN')}`}>本次启用后累计</span>
                <span>{stats.lastMessageAt ? `最近消息：${new Date(stats.lastMessageAt).toLocaleString('zh-CN')}` : '暂无收发消息'}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-theme-muted">{entry?.notice || '前往设置，通过手机 QQ 扫码或填写 AppID 和 AppSecret 连接机器人。'}</p>
          )}
          {failed && <p role="alert" className="mt-3 text-xs text-amber-600 dark:text-amber-400">更新失败，当前显示上次获取的信息，正在重试。</p>}
        </>
      )}
    </div>
  )
}
