import React, { useCallback, useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { ChangePasswordDialog, OtherConfig, otherSettings, showToast } from '../components'
import { Config, ResConfig } from '../types'
import { apiFetch } from '../utils/api'

/** 其他配置: the bot settings of this instance (settings.json), and the WebUI password. */
const OtherSettingsPage: React.FC = () => {
  const [config, setConfig] = useState<Config | null>(null)
  const [envLocked, setEnvLocked] = useState<ResConfig['envLocked']>([])
  const [instance, setInstance] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    apiFetch<ResConfig>('/api/config')
      .then((response) => {
        if (!response.success) throw new Error(response.message || '读取配置失败')
        setConfig(response.data.config)
        setEnvLocked(response.data.envLocked ?? [])
        setInstance(response.data.instance)
      })
      .catch(e => showToast(e instanceof Error ? e.message : String(e), 'error'))
  }, [])

  // Only the sections this page edits go up; the server merges them
  const save = useCallback(async (sections: Partial<Config>) => {
    setSaving(true)
    try {
      const response = await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: sections }),
      })
      if (!response.success) {
        showToast(response.message || '保存失败', 'error')
        return
      }
      showToast('配置保存成功', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }, [])

  if (!config) return <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>

  return (
    <>
      <div className="pb-24">
        <OtherConfig
          config={config}
          onChange={setConfig}
          envLocked={envLocked}
          instance={instance}
          onOpenChangePassword={() => setChangingPassword(true)}
        />
      </div>
      <div className="fixed bottom-8 right-8 z-40">
        <button
          onClick={() => save(otherSettings(config, envLocked))}
          disabled={saving}
          className="btn-primary flex items-center gap-2 shadow-2xl hover:shadow-3xl"
        >
          {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>

      {saving && (
        <div className="fixed inset-0 bg-black/20 dark:bg-black/40 flex items-center justify-center" style={{ zIndex: 9000 }}>
          <div className="glass glass-thick r-panel glass-pop p-6">
            <Loader2 size={48} className="animate-spin text-pink-500 mx-auto" />
            <p className="mt-4 text-theme">加载中...</p>
          </div>
        </div>
      )}

      <ChangePasswordDialog
        visible={changingPassword}
        onClose={() => setChangingPassword(false)}
        // set-token does not answer with the new token: a reload asks for it
        onSuccess={() => window.location.reload()}
      />
    </>
  )
}

export default OtherSettingsPage
