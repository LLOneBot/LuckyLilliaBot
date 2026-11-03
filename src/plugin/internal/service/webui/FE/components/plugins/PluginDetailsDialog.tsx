import React, { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Portal } from '../common'
import { Lightbox, LightboxImage } from '../common/Lightbox'
import { Markdown } from '../common/Markdown'
import { PluginAuthor, PluginDetails, PluginStatus } from '../../types/plugins'
import { getPluginDetails } from '../../utils/pluginApi'
import { pluginDescription, pluginTitle } from './meta'
import PluginIcon from './PluginIcon'

export const AuthorName: React.FC<{ author: PluginAuthor }> = ({ author }) => (
  <>
    {author.url
      ? <a href={author.url} target="_blank" rel="noopener noreferrer" className="text-pink-500 hover:underline">{author.name}</a>
      : author.name}
    {author.email && (
      <>
        {' · '}
        <a href={`mailto:${author.email}`} className="hover:underline">{author.email}</a>
      </>
    )}
  </>
)

/** 详情 on a plugin's card: what its package says about itself, `llbot.screenshots` above `llbot.details`. */
const PluginDetailsDialog: React.FC<{ plugin: PluginStatus; onClose(): void }> = ({ plugin, onClose }) => {
  const [details, setDetails] = useState<PluginDetails | null>(null)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState<{ images: LightboxImage[]; index: number } | null>(null)
  const description = pluginDescription(plugin)
  const shots = details?.screenshots ?? []

  useEffect(() => {
    let alive = true
    getPluginDetails(plugin.id).then(
      loaded => alive && setDetails(loaded),
      (e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      alive = false
    }
  }, [plugin.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <Portal>
      {/* A click outside does not close it: too easy to hit by accident */}
      <div className="fixed inset-0 scrim flex items-center justify-center p-4" style={{ zIndex: 9000 }}>
        <div className="glass glass-thick r-window glass-pop w-full max-w-3xl max-h-[85vh] flex flex-col">
          <div className="flex items-start gap-4 p-6 hairline-b">
            <PluginIcon plugin={plugin} className="w-14 h-14 rounded-2xl" fill="gradient-primary-br text-white" size={28} />
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-theme break-words">{pluginTitle(plugin)}</h3>
              <p className="text-xs text-theme-hint break-all">{plugin.name}{plugin.version ? ` · v${plugin.version}` : ''}</p>
              {plugin.author && <p className="text-xs text-theme-secondary mt-1 break-words">作者 <AuthorName author={plugin.author} /></p>}
            </div>
            <button type="button" title="关闭" onClick={onClose} className="p-2 -m-2 text-theme-hint hover:text-theme transition-colors">
              <X size={22} />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            {description && <p className="text-sm text-theme">{description}</p>}
            {error && <p className="text-sm text-red-500">读取详情失败：{error}</p>}
            {!details && !error && <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-pink-500" /></div>}
            {shots.length > 0 && (
              <div className={shots.length > 1 ? 'flex gap-3 overflow-x-auto pb-2 snap-x' : ''}>
                {shots.map((shot, index) => (
                  <figure key={shot.url} className={shots.length > 1 ? 'flex-shrink-0 snap-start' : ''}>
                    <button
                      type="button"
                      title="放大"
                      onClick={() => setViewing({ images: shots, index })}
                      className="block w-full rounded-xl overflow-hidden border border-theme-divider bg-black/5 dark:bg-white/5 hover:opacity-90 transition-opacity cursor-zoom-in"
                    >
                      <img
                        src={shot.url}
                        alt={shot.caption ?? ''}
                        loading="lazy"
                        className={shots.length > 1 ? 'h-48 w-auto max-w-[32rem] object-cover' : 'w-full max-h-80 object-contain'}
                      />
                    </button>
                    {shot.caption && <figcaption className="mt-1.5 text-xs text-theme-muted text-center truncate">{shot.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            )}
            {details?.markdown && (
              <Markdown
                source={details.markdown}
                base={details.base}
                onImage={(url, alt) => setViewing({ images: [{ url, caption: alt || undefined }], index: 0 })}
              />
            )}
          </div>
        </div>
      </div>
      {viewing && (
        <Lightbox
          images={viewing.images}
          index={viewing.index}
          onIndex={index => setViewing({ ...viewing, index })}
          onClose={() => setViewing(null)}
        />
      )}
    </Portal>
  )
}

export default PluginDetailsDialog
