import React, { useEffect, useState } from 'react'
import type { PluginDetailsSource } from '@luckylillia/plugin-sdk/webui'
import { ChevronDown, Loader2, X } from 'lucide-react'
import { Portal } from '../common'
import { Lightbox, LightboxImage } from '../common/Lightbox'
import { Markdown } from '../common/Markdown'
import { PluginAuthor, PluginDetails } from '../../types/plugins'
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

/** One details view for installed plugin cards and market previews. */
const PluginDetailsDialog: React.FC<{ source: PluginDetailsSource; onClose(): void }> = ({ source, onClose }) => {
  const [result, setResult] = useState<{ source: PluginDetailsSource; details?: PluginDetails; error?: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [viewing, setViewing] = useState<{ images: LightboxImage[]; index: number } | null>(null)
  const details = result?.source === source ? result.details : undefined
  const error = result?.source === source ? result.error : undefined
  const markdown = details?.markdown?.trim()
  const shots = details?.screenshots ?? source.screenshots ?? []

  useEffect(() => {
    let alive = true
    setResult(null)
    setViewing(null)
    const load = source.load
    if (!load) return
    Promise.resolve().then(load).then(
      details => alive && setResult({ source, details }),
      (e: unknown) => alive && setResult({ source, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      alive = false
    }
  }, [source, attempt])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <Portal>
      {/* A click outside does not close it: too easy to hit by accident */}
      <div className="fixed inset-0 scrim flex items-center justify-center p-4" style={{ zIndex: 9000 }}>
        <div role="dialog" aria-modal="true" aria-label={`${source.title} 的详情`} className="glass glass-thick r-window glass-pop w-full max-w-3xl max-h-[85vh] flex flex-col">
          <div className="flex shrink-0 items-start gap-3 p-4 sm:gap-4 sm:p-6 hairline-b">
            <PluginIcon plugin={{ iconUrl: source.iconUrl, manifest: { icon: source.icon } }} className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl" fill="gradient-primary-br text-white" size={28} />
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-theme break-words">{source.title}</h3>
              <p className="text-xs text-theme-hint break-all">{source.name}{source.version ? ` · v${source.version}` : ''}</p>
              {source.author && <p className="text-xs text-theme-secondary mt-1 break-words">作者 <AuthorName author={source.author} /></p>}
            </div>
            <button type="button" title="关闭" onClick={onClose} className="p-2 -m-2 text-theme-hint hover:text-theme transition-colors">
              <X size={22} />
            </button>
          </div>

          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
            {source.description && <p className="text-sm text-theme">{source.description}</p>}
            {error && (
              <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-500">
                <span className="min-w-0 break-words">读取详情失败：{error}</span>
                <button type="button" onClick={() => setAttempt(value => value + 1)} className="btn-glass">重试</button>
              </div>
            )}
            {source.load && !details && !error && <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-pink-500" /></div>}
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
            {markdown && (
              <details className="group border-t border-theme-divider pt-4">
                <summary className="flex items-center gap-2 list-none cursor-pointer text-sm text-theme-secondary hover:text-theme [&::-webkit-details-marker]:hidden">
                  <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                  完整说明
                </summary>
                <Markdown
                  source={markdown}
                  omitTitle
                  base={details?.base}
                  className="mt-4"
                  onImage={(url, alt) => setViewing({ images: [{ url, caption: alt || undefined }], index: 0 })}
                />
              </details>
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
