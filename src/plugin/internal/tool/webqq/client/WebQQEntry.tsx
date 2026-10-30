import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { usePageView, useSidebar } from '@luckylillia/plugin-sdk/webui'
import WebQQPage from './components/WebQQ/WebQQPage'
import { hydrateWebQQStore } from './stores/webqqStore'
import { useSettingsStore } from './stores/settingsStore'
import { setCurrentUin } from './utils/currentUin'
import { getLoginInfo } from './utils/webqqApi'

/** The page as the WebUI shows it: scoped to the logged-in account first, as its stores and caches are per account. */
const WebQQEntry: React.FC = () => {
  const { fullscreen } = usePageView()
  const { setCollapsed } = useSidebar()
  const autoHideSidebar = useSettingsStore(state => state.autoHideSidebarInWebQQ)
  const [uin, setUin] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (autoHideSidebar && !fullscreen) setCollapsed(true)
  }, [autoHideSidebar, fullscreen, setCollapsed])

  useEffect(() => {
    getLoginInfo()
      .then((info) => {
        if (!info.online) throw new Error('NTQQ 账号还没有登录')
        setCurrentUin(info.uin)
        hydrateWebQQStore(info.uin)
        setUin(info.uin)
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) return <p className="card p-6 text-sm text-red-500">{error}</p>
  if (!uin) return <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>
  return <WebQQPage isFullscreen={fullscreen} />
}

export default WebQQEntry
