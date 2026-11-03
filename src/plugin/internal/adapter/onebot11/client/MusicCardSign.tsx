import React, { useEffect, useState } from 'react'
import { Loader2, Music } from 'lucide-react'
import { usePluginContext } from '@luckylillia/plugin-sdk/webui'

const DEFAULT_URL = 'https://ss.xingzhige.com/music_card/card'

/**
 * The service OneBot's `music` segment turns a song into a signed card with: the bot setting `musicCardSignUrl`,
 * which only this adapter reads, applied as it is saved without dropping a connection.
 */
const MusicCardSign: React.FC = () => {
  const ctx = usePluginContext()
  const [saved, setSaved] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ctx.api('/api/config').then(
      (data: { config: { musicCardSignUrl?: string } }) => {
        setSaved(data.config.musicCardSignUrl ?? '')
        setUrl(data.config.musicCardSignUrl ?? '')
      },
      () => setSaved(null),
    )
  }, [])

  if (saved === null) return null

  const save = async () => {
    setSaving(true)
    try {
      await ctx.api('/api/config', { method: 'POST', body: { config: { musicCardSignUrl: url.trim() } } })
      setSaved(url.trim())
      setUrl(url.trim())
      ctx.toast('音乐卡片签名地址已保存')
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center flex-shrink-0">
          <Music size={20} className="text-white" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-theme">音乐卡片签名地址</h3>
          <p className="text-sm text-theme-secondary">发 music 消息段时，把歌曲信息交给这个服务，换回签好名的卡片</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder={DEFAULT_URL}
          className="input-field flex-1 min-w-[16rem]"
        />
        {url.trim() !== saved && (
          <button onClick={save} disabled={saving} className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5 flex-shrink-0">
            {saving && <Loader2 size={16} className="animate-spin" />}保存
          </button>
        )}
      </div>
    </div>
  )
}

export default MusicCardSign
