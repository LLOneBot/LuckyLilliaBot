/*
 * Shares the wallpaper canvas with glass elements. Per registered element and
 * frame:
 *
 *   - a lens band: the wallpaper just inside each edge of the element,
 *     stretched outward into a band along that edge -- what the rim of a
 *     convex lens does to whatever is behind it. Drawn with four drawImage
 *     calls into the lens canvas, GPU to GPU, no pixel readback. Earlier this
 *     was an SVG displacement filter applied with CSS filter:url() on the
 *     canvas; Chrome treats a reference filter on a live canvas as a paint
 *     time snapshot on some raster paths and would not refresh it until a
 *     layout change, which showed up as a stale ring after a theme switch.
 *     Only opt in elements that sit on bare wallpaper: the copy knows nothing
 *     about DOM behind the element, and would paint wallpaper over it.
 *
 *   - luminance sampling: average brightness under the element, exposed as
 *     --glass-lum and as .glass-on-dark / .glass-on-light, so a sheet over a
 *     dark pool of wallpaper switches to the dark material on its own. This
 *     reads from a tiny CPU mirror of the wallpaper that AnimatedBackground
 *     paints alongside the real one -- reading back from the accelerated
 *     canvas every frame would make Chrome drop its acceleration.
 *
 * All geometry is in CSS px. The wallpaper bitmap may be scaled (it is
 * painted at half resolution) and may be larger than the viewport, so
 * bitmap coordinates are derived from the canvas client size each frame.
 *
 * The frame is driven by AnimatedBackground after it paints, so there is one
 * animation loop for the whole page.
 */

interface Entry {
  el: HTMLElement
  lens: HTMLCanvasElement | null
  ctx: CanvasRenderingContext2D | null
  band: number
  saturate: string
  tint: string
  /** performance.now() of the last tint read */
  tintAt: number
  /** until this time the tint is re-read every frame: a color transition is running */
  tintHot: number
  onDark: boolean
  fresh: boolean
}

const entries = new Map<HTMLElement, Entry>()
let source: HTMLCanvasElement | null = null
let mirror: HTMLCanvasElement | null = null
let mirrorCtx: CanvasRenderingContext2D | null = null
let frameNo = 0

// Hysteresis, so a sheet drifting across the threshold does not flicker
const DARK_ON = 0.4
const DARK_OFF = 0.48
// Tint refresh is time-based, not frame-based: under prefers-reduced-motion
// the loop runs at a few fps, and a frame-counted refresh turned into a
// 12-second lag that showed as a stale ring after a theme switch.
const TINT_EVERY_MS = 200
const TINT_HOT_MS = 600
// Fraction of the band that is sampled and stretched to fill it: 0.55 means
// the outer edge shows content from 45% of a band further in, i.e. ~1.8x
// magnification at the rim.
const SAMPLE = 0.55

export function setGlassSource(canvas: HTMLCanvasElement | null, cpuMirror: HTMLCanvasElement | null = null) {
  source = canvas
  mirror = cpuMirror
  mirrorCtx = cpuMirror ? cpuMirror.getContext('2d', { willReadFrequently: true }) : null
}

/*
 * Drop every per-element luminance class. The classes outrank the theme
 * class on purpose (a sheet over a bright pool stays light in the dark
 * theme), which also means a stale one pins an element to the wrong
 * material. Clearing on theme change lets the theme apply at once; the next
 * frame re-derives the classes from the repainted wallpaper.
 */
export function resetGlassAdaptive() {
  for (const e of entries.values()) {
    e.el.classList.remove('glass-on-dark', 'glass-on-light')
    e.onDark = false
    e.fresh = true
    heat(e)
  }
}

// Re-read the tint now and keep re-reading every frame for a while: the
// theme just changed and the background color is mid-transition.
function heat(e: Entry) {
  const now = performance.now()
  e.tint = getComputedStyle(e.el).backgroundColor
  e.tintAt = now
  e.tintHot = now + TINT_HOT_MS
}

export function registerGlass(el: HTMLElement, lens: HTMLCanvasElement | null) {
  if (entries.has(el)) return
  const cs = getComputedStyle(el)
  entries.set(el, {
    el,
    lens,
    ctx: lens ? lens.getContext('2d') : null,
    band: parseFloat(cs.getPropertyValue('--lens-band')) || 14,
    saturate: `saturate(${cs.getPropertyValue('--glass-saturate').trim() || '160%'})`,
    tint: cs.backgroundColor,
    tintAt: performance.now(),
    tintHot: performance.now() + TINT_HOT_MS,
    onDark: false,
    fresh: true,
  })
}

export function unregisterGlass(el: HTMLElement) {
  if (!entries.delete(el)) return
  el.classList.remove('glass-on-dark', 'glass-on-light')
  el.style.removeProperty('--glass-lum')
}

function luminanceUnder(r: DOMRect, cw: number, ch: number): number | null {
  if (!mirror || !mirrorCtx) return null
  const sx = mirror.width / cw
  const sy = mirror.height / ch
  const x0 = Math.max(0, Math.floor(r.left * sx))
  const y0 = Math.max(0, Math.floor(r.top * sy))
  const x1 = Math.min(mirror.width, Math.ceil(r.right * sx))
  const y1 = Math.min(mirror.height, Math.ceil(r.bottom * sy))
  const w = Math.max(1, x1 - x0)
  const h = Math.max(1, y1 - y0)
  if (x0 >= mirror.width || y0 >= mirror.height) return null
  const d = mirrorCtx.getImageData(x0, y0, w, h).data
  let lum = 0
  for (let i = 0; i < d.length; i += 4) lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
  return lum / ((d.length / 4) * 255)
}

function drawLens(e: Entry, r: DOMRect, w: number, h: number, k: number) {
  const ctx = e.ctx
  const src = source
  if (!ctx || !src) return
  const band = Math.min(e.band, Math.floor(Math.min(w, h) / 2))
  if (band < 2) return
  const inner = band * SAMPLE
  const L = r.left
  const T = r.top

  ctx.clearRect(0, 0, w, h)
  ctx.filter = e.saturate
  // top and bottom strips span the full width, so the corners belong to them
  ctx.drawImage(src, L * k, (T + band - inner) * k, w * k, inner * k, 0, 0, w, band)
  ctx.drawImage(src, L * k, (T + h - band) * k, w * k, inner * k, 0, h - band, w, band)
  const mid = h - 2 * band
  if (mid > 0) {
    ctx.drawImage(src, (L + band - inner) * k, (T + band) * k, inner * k, mid * k, 0, band, band, mid)
    ctx.drawImage(src, (L + w - band) * k, (T + band) * k, inner * k, mid * k, w - band, band, band, mid)
  }
  ctx.filter = 'none'

  // The sheet tint goes on the band itself: a child cannot paint beneath its
  // parent background.
  ctx.fillStyle = e.tint
  ctx.fillRect(0, 0, w, band)
  ctx.fillRect(0, h - band, w, band)
  if (mid > 0) {
    ctx.fillRect(0, band, band, mid)
    ctx.fillRect(w - band, band, band, mid)
  }
}

/* Snapshot for the ?glassdebug=1 overlay (components/common/GlassDebug.tsx). */
export function glassDebugSnapshot() {
  return {
    build: 'lens=stretch, wallpaper=0.5x, mirror=' + (mirror ? `${mirror.width}x${mirror.height}` : 'none'),
    frame: frameNo,
    source: source ? [source.width, source.height, source.clientWidth, source.clientHeight] : null,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    sheets: [...entries.values()].map((e) => ({
      el: e.el.tagName.toLowerCase() + (e.el.className.includes('r-window') ? '.sidebar' : ''),
      lens: e.lens ? [e.lens.width, e.lens.height] : null,
      lum: e.el.style.getPropertyValue('--glass-lum'),
      cls: [...e.el.classList].filter((k) => k.startsWith('glass-on')).join(',') || '-',
      tint: e.tint,
      bg: getComputedStyle(e.el).backgroundColor,
    })),
  }
}

export function glassFrame() {
  if (!source || entries.size === 0) return
  const cw = source.clientWidth || source.width
  const ch = source.clientHeight || source.height
  if (cw === 0 || ch === 0) return
  // bitmap px per CSS px
  const k = source.width / cw
  frameNo++
  const now = performance.now()

  for (const e of entries.values()) {
    const r = e.el.getBoundingClientRect()
    const w = Math.round(r.width)
    const h = Math.round(r.height)
    if (w === 0 || h === 0) continue
    if (r.right <= 0 || r.bottom <= 0 || r.left >= cw || r.top >= ch) continue

    const lum = luminanceUnder(r, cw, ch)
    if (lum !== null) {
      e.el.style.setProperty('--glass-lum', lum.toFixed(2))
      const onDark = e.onDark ? lum < DARK_OFF : lum < DARK_ON
      if (e.fresh || onDark !== e.onDark) {
        e.fresh = false
        e.onDark = onDark
        e.el.classList.toggle('glass-on-dark', onDark)
        e.el.classList.toggle('glass-on-light', !onDark)
        heat(e)
      }
    }

    if (now < e.tintHot || now - e.tintAt >= TINT_EVERY_MS) {
      e.tint = getComputedStyle(e.el).backgroundColor
      e.tintAt = now
    }

    if (e.lens && e.ctx) {
      if (e.lens.width !== w || e.lens.height !== h) {
        e.lens.width = w
        e.lens.height = h
      }
      drawLens(e, r, w, h, k)
    }
  }
}
