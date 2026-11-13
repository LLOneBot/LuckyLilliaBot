import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useBots, usePageView, useSidebar } from '@luckylillia/plugin-sdk/webui'
import WebQQPage from './components/WebQQ/WebQQPage'
import { hydrateWebQQStore } from './stores/webqqStore'
import { useWebQQSettings } from './settings'
import { setCurrentUin } from './utils/currentUin'
import { getLoginInfo, setSelfInfo } from './utils/webqqApi'
import { waitForWebQQAccount, type AccountNotice } from './account'

/** The page as the WebUI shows it: scoped to the logged-in account first, as its stores and caches are per account. */
const WebQQEntry: React.FC = () => {
  const { fullscreen } = usePageView()
  const { setCollapsed } = useSidebar()
  const { autoHideSidebar } = useWebQQSettings()
  const ntqq = useBots()?.find(bot => bot.platform === 'ntqq')
  const [uin, setUin] = useState<string | null>(null)
  const [notice, setNotice] = useState<AccountNotice | null>(null)

  useEffect(() => {
    if (autoHideSidebar && !fullscreen) setCollapsed(true)
  }, [autoHideSidebar, fullscreen, setCollapsed])

  useEffect(() => {
    const controller = new AbortController()
    setUin(null)
    setNotice(null)
    void waitForWebQQAccount(getLoginInfo, controller.signal, setNotice, info => {
      setSelfInfo(info.uid, info.uin)
      setCurrentUin(info.uin)
      hydrateWebQQStore(info.uin)
    }).then(info => {
      if (!info || controller.signal.aborted) return
      setNotice(null)
      setUin(info.uin)
    })
    return () => controller.abort()
  }, [ntqq?.selfId, ntqq?.status])

  if (notice) return (
    <div className="card p-6 flex items-center gap-3 text-sm" role="status">
      <Loader2 size={18} className="animate-spin text-pink-500 shrink-0" />
      <div className={notice.error ? 'text-red-500' : 'text-theme-secondary'}>
        {notice.message}
        {notice.error && <p className="mt-1 text-xs text-theme-muted">正在重试连接...</p>}
      </div>
    </div>
  )
  if (!uin) return <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>
  return <WebQQPage key={uin} isFullscreen={fullscreen} />
}

export default WebQQEntry
