import React, { useMemo, useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { usePluginList } from '../../plugin-host/pluginList'
import { pageContributionKey, useRegistry, visiblePages } from '../../plugin-host/registry'
import SidebarDialog from './SidebarDialog'

/** The settings dialog's line about the sidebar; the pages are arranged in a dialog of their own. */
const SidebarSettings: React.FC = () => {
  const contributions = useRegistry(state => state.contributions)
  const plugins = usePluginList(state => state.plugins)
  const prefs = usePluginList(state => state.prefs)
  const [open, setOpen] = useState(false)
  const pages = useMemo(() => visiblePages(contributions, plugins, 'arrange', prefs), [contributions, plugins, prefs])
  const hidden = pages.filter(page => !page.locked && prefs.hidden.includes(pageContributionKey(page))).length

  return (
    <div className="flex items-center gap-3">
      <PanelLeft size={18} className="text-theme-muted flex-shrink-0" />
      <span className="flex-1 text-sm text-theme">
        显示 {pages.length - hidden} 个页面{hidden > 0 && `，隐藏了 ${hidden} 个`}
      </span>
      <button type="button" onClick={() => setOpen(true)} className="btn-glass text-sm px-4 py-1.5 flex-shrink-0">调整</button>
      {open && <SidebarDialog onClose={() => setOpen(false)} />}
    </div>
  )
}

export default SidebarSettings
