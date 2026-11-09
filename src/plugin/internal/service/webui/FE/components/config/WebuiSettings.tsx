import React, { useEffect, useState } from 'react'
import { KeyRound, Loader2, Lock } from 'lucide-react'
import { HostSelector } from '../common/HostSelector'
import { showToast } from '../common/Toast'
import ChangePasswordDialog from './ChangePasswordDialog'
import { ResConfig } from '../../types'
import { apiFetch } from '../../utils/api'
import { lockedBy, webuiPatch } from './webuiPatch'

const DEFAULT_PORT = 3080

const LockedHint: React.FC<{ text: string }> = ({ text }) => (
  <p className='text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1'>
    <Lock size={12} />{text}
  </p>
)

/** The WebUI's own connection settings: where it listens (settings.json) and its password. */
const WebuiSettings: React.FC = () => {
  const [loaded, setLoaded] = useState<ResConfig | null>(null)
  const [host, setHost] = useState('')
  const [port, setPort] = useState(DEFAULT_PORT)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    apiFetch<ResConfig>('/api/config')
      .then((res) => {
        setLoaded(res.data)
        setHost(res.data.config.webui?.host ?? '')
        setPort(res.data.config.webui?.port || DEFAULT_PORT)
      })
      .catch(e => showToast(e instanceof Error ? e.message : String(e), 'error'))
  }, [])

  if (!loaded) return <div className='flex justify-center py-4'><Loader2 size={24} className='animate-spin text-pink-500' /></div>

  const lockOf = (path: string) => loaded.envLocked.find(lock => lock.path === path)
  const hostLock = lockOf('webui.host')
  const portLock = lockOf('webui.port')
  const saved = loaded.config.webui
  const changed = (!hostLock && host !== (saved?.host ?? '')) || (!portLock && port !== (saved?.port || DEFAULT_PORT))

  const save = async () => {
    setSaving(true)
    try {
      const webui = webuiPatch({ host, port }, loaded.envLocked)
      const res = await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { webui } }),
      })
      if (!res.success) throw new Error(res.message || '保存失败')
      setLoaded({ ...loaded, config: { ...loaded.config, webui: { ...saved, ...webui } } })
      const moved = webui.port !== undefined && webui.port !== saved?.port
      showToast(moved ? `已保存，WebUI 改到端口 ${webui.port}，要用新端口重新打开` : '已保存，WebUI 会重新启动', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='space-y-4'>
      <div>
        <div className='text-sm text-theme-secondary mb-1.5'>监听地址</div>
        {hostLock
          ? <><input type='text' value={saved?.host || '全部 (0.0.0.0 和 ::)'} disabled className='input-field opacity-70 cursor-not-allowed' /><LockedHint text={lockedBy(hostLock)} /></>
          : <HostSelector value={host} onChange={setHost} />}
      </div>
      <div>
        <div className='text-sm text-theme-secondary mb-1.5'>端口</div>
        <input
          type='number'
          min={1}
          max={65535}
          value={portLock ? saved?.port : port}
          disabled={!!portLock}
          onChange={e => setPort(parseInt(e.target.value) || 0)}
          className={`input-field ${portLock ? 'opacity-70 cursor-not-allowed' : ''}`}
        />
        {portLock && <LockedHint text={lockedBy(portLock)} />}
      </div>
      {changed && (
        <div className='flex items-center justify-end gap-3'>
          <span className='text-xs text-theme-muted'>保存后 WebUI 会重新启动</span>
          <button onClick={save} disabled={saving || !(port >= 1 && port <= 65535)} className='btn-primary text-sm px-4 py-1.5 flex items-center gap-1.5'>
            {saving && <Loader2 size={16} className='animate-spin' />}保存
          </button>
        </div>
      )}
      <div className='flex items-center gap-3'>
        <KeyRound size={18} className='text-theme-muted flex-shrink-0' />
        <span className='flex-1 text-sm text-theme'>访问密码</span>
        <button onClick={() => setChangingPassword(true)} className='btn-glass text-sm px-4 py-1.5'>修改密码</button>
      </div>
      <ChangePasswordDialog
        visible={changingPassword}
        onClose={() => setChangingPassword(false)}
        // set-token does not answer with the new token: a reload asks for it
        onSuccess={() => window.location.reload()}
      />
    </div>
  )
}

export default WebuiSettings
