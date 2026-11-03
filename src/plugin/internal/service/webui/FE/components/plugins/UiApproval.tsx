import React, { useState } from 'react'
import { showToast } from '../common'
import { usePluginList } from '../../plugin-host/pluginList'
import { PluginStatus, UiPrefsPatch } from '../../types/plugins'
import { patchUiPrefs } from '../../utils/pluginApi'

/**
 * In the config dialog of a third-party package bringing a WebUI module of its own: approving it lets the module load,
 * revoking takes away everything it added. plugins.json `ui.approved`, so for every browser.
 */
const UiApproval: React.FC<{ plugin: PluginStatus }> = ({ plugin }) => {
  const [busy, setBusy] = useState(false)
  if (plugin.builtin || !plugin.webui) return null

  const patch = async (change: UiPrefsPatch, done: string) => {
    setBusy(true)
    try {
      usePluginList.setState({ prefs: await patchUiPrefs(change) })
      showToast(done, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-theme-item text-sm">
      <p className="flex-1 text-theme-secondary">
        {plugin.webuiApproved
          ? '它带着自己的界面，已批准：这些代码在你的浏览器里运行，能用你的 WebUI 登录调用 Bot 的接口。撤销后它加的页面、卡片和按钮都会去掉'
          : '它带着自己的界面（自己的页面、卡片、配置编辑器等），批准后才会加载；现在用的是通用表单'}
      </p>
      {plugin.webuiApproved ? (
        <button type="button" disabled={busy} onClick={() => patch({ revoke: [plugin.name] }, '已撤销它的界面')} className="btn-glass text-sm flex-shrink-0">
          撤销批准
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={() => patch({ approve: [plugin.name] }, '已批准它的界面')} className="btn-glass text-sm flex-shrink-0">
          批准界面
        </button>
      )}
    </div>
  )
}

export default UiApproval
