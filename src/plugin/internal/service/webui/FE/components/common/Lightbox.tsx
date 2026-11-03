import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

export interface LightboxImage {
  url: string
  caption?: string
}

interface LightboxProps {
  images: LightboxImage[]
  index: number
  onIndex(index: number): void
  onClose(): void
}

/** An image over everything, with the others of its set a ← / → away. */
export const Lightbox: React.FC<LightboxProps> = ({ images, index, onIndex, onClose }) => {
  const count = images.length
  const image = images[index]
  const go = (step: number) => onIndex((index + step + count) % count)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && count > 1) go(-1)
      else if (e.key === 'ArrowRight' && count > 1) go(1)
      else return
      // Capturing on window first: the dialog under it closes on Escape too
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [index, count, onClose])

  if (!image) return null
  const arrow = 'absolute top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors'
  return createPortal(
    <div className="fixed inset-0 bg-black/85 flex flex-col items-center justify-center p-6 select-none" style={{ zIndex: 9500 }} onClick={onClose}>
      <img
        src={image.url}
        alt={image.caption ?? ''}
        onClick={e => e.stopPropagation()}
        className="max-w-full max-h-[calc(100vh-8rem)] object-contain rounded-lg shadow-2xl"
      />
      {(image.caption || count > 1) && (
        <p className="mt-4 text-sm text-white/85 text-center" onClick={e => e.stopPropagation()}>
          {image.caption}
          {count > 1 && <span className="ml-3 text-white/50 tnum">{index + 1} / {count}</span>}
        </p>
      )}
      <button type="button" title="关闭" onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
        <X size={22} />
      </button>
      {count > 1 && (
        <>
          <button type="button" title="上一张" onClick={e => { e.stopPropagation(); go(-1) }} className={`${arrow} left-4`}>
            <ChevronLeft size={24} />
          </button>
          <button type="button" title="下一张" onClick={e => { e.stopPropagation(); go(1) }} className={`${arrow} right-4`}>
            <ChevronRight size={24} />
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
