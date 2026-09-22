import React, { useEffect, useRef } from 'react'
import { useThemeStore } from '../../stores/themeStore'
import { glassFrame, resetGlassAdaptive, setGlassSource } from '../../utils/glassRuntime'

/*
 * The wallpaper: a base gradient with a light source, and a few very large,
 * very soft colour fields drifting over it.
 *
 * Everything is painted into the canvas, including the base gradient that
 * the CSS body background duplicates as a fallback. The glass runtime copies
 * regions of this canvas to refract and to sample luminance, so the canvas
 * has to be the complete picture of what is behind a sheet.
 *
 * Three constraints come from the material rather than from taste:
 *   - low alpha on the fields, because the sheets re-saturate the backdrop
 *     and vivid source colour comes back through the glass electric;
 *   - large radii, because the lens band samples across ~20px and small
 *     blobs turn to noise at that scale;
 *   - slow drift, because a fast-moving backdrop makes every glass rim
 *     shimmer in the reader peripheral vision.
 */

interface Blob {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  phase: number
  phaseSpeed: number
  color: string
  sprite?: HTMLCanvasElement
}

const LIGHT_FIELDS = ['196, 138, 232', '168, 146, 246', '242, 152, 204', '140, 156, 250', '246, 178, 210']
const DARK_FIELDS = ['186, 84, 140', '118, 98, 200', '68, 118, 186', '56, 144, 134', '184, 124, 86']

const COUNT = 5
const MIRROR_W = 96
// Bitmap px per CSS px. The fields are soft enough that half resolution is
// indistinguishable, and it is a quarter of the raster work.
const WALL_SCALE = 0.5
const DRIFT = 0.15
const FPS = 24

type Stop = [number, string]

// CSS linear-gradient(<deg>) semantics: the gradient line passes through the
// centre and is long enough for the corners to hit the end stops.
function linear(ctx: CanvasRenderingContext2D, w: number, h: number, deg: number, stops: Stop[]) {
  const a = (deg * Math.PI) / 180
  const dx = Math.sin(a)
  const dy = -Math.cos(a)
  const len = Math.abs(w * dx) + Math.abs(h * dy)
  const g = ctx.createLinearGradient(
    w / 2 - (dx * len) / 2,
    h / 2 - (dy * len) / 2,
    w / 2 + (dx * len) / 2,
    h / 2 + (dy * len) / 2,
  )
  for (const [o, c] of stops) g.addColorStop(o, c)
  return g
}

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stops: Stop[]) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  for (const [o, c] of stops) g.addColorStop(o, c)
  return g
}

// Mirrors the body background in index.css. Keep the two in step.
function paintBase(ctx: CanvasRenderingContext2D, w: number, h: number, dark: boolean) {
  if (dark) {
    ctx.fillStyle = linear(ctx, w, h, 160, [
      [0, '#121114'],
      [0.55, '#16151a'],
      [1, '#121418'],
    ])
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = radial(ctx, w * 0.85, h, 850, [
      [0, '#17222b'],
      [0.55, 'rgba(23, 34, 43, 0)'],
    ])
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = radial(ctx, w * 0.15, 0, 1000, [
      [0, '#241b2c'],
      [0.6, 'rgba(36, 27, 44, 0)'],
    ])
    ctx.fillRect(0, 0, w, h)
    return
  }
  ctx.fillStyle = linear(ctx, w, h, 140, [
    [0, '#e2dffc'],
    [0.28, '#ecdcf8'],
    [0.52, '#f6e0ef'],
    [0.76, '#ecdff6'],
    [1, '#e4e0fa'],
  ])
  ctx.fillRect(0, 0, w, h)
  // The light source. The rims are bright on top because light comes from
  // up here.
  ctx.fillStyle = radial(ctx, w * 0.16, h * 0.06, 840, [
    [0, 'rgba(255, 255, 255, 0.6)'],
    [0.62, 'rgba(255, 255, 255, 0)'],
  ])
  ctx.fillRect(0, 0, w, h)
}

const AnimatedBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const blobsRef = useRef<Blob[]>([])
  const animationRef = useRef<number | undefined>(undefined)
  const lastTimeRef = useRef(0)
  // Only ever grow: on mobile the soft keyboard shrinks innerHeight, and
  // following it makes the whole field jump.
  const sizeRef = useRef<{ width: number; height: number } | null>(null)
  const isDark = useThemeStore((s) => s.isDark)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    // A tiny software copy of the scene for the glass runtime to sample
    // luminance from. Painted from the model, not copied from the real
    // canvas: copying would be a GPU readback every frame.
    const mirror = document.createElement('canvas')
    const mctx = mirror.getContext('2d', { willReadFrequently: true })

    const fields = isDark ? DARK_FIELDS : LIGHT_FIELDS
    const peak = isDark ? 0.4 : 0.46
    // Scene size in CSS px; the bitmap is WALL_SCALE of this
    let css = { width: 1, height: 1 }
    const frameInterval = 1000 / FPS
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const measure = () => {
      const width = Math.max(window.innerWidth, document.documentElement.clientWidth)
      const height = Math.max(window.innerHeight, document.documentElement.clientHeight)
      const prev = sizeRef.current
      sizeRef.current = prev
        ? { width: Math.max(prev.width, width), height: Math.max(prev.height, height) }
        : { width, height }
      return sizeRef.current
    }

    // Pre-render each field once. Radial gradients are expensive per frame,
    // and these only ever get translated and uniformly scaled.
    const renderSprite = (blob: Blob): HTMLCanvasElement => {
      const size = Math.ceil(blob.radius * 2)
      const sprite = document.createElement('canvas')
      sprite.width = size
      sprite.height = size
      const sctx = sprite.getContext('2d')
      if (!sctx) return sprite

      const c = size / 2
      const gradient = sctx.createRadialGradient(c, c, 0, c, c, blob.radius)
      gradient.addColorStop(0, `rgba(${blob.color}, ${peak})`)
      gradient.addColorStop(0.45, `rgba(${blob.color}, ${peak * 0.55})`)
      gradient.addColorStop(1, `rgba(${blob.color}, 0)`)
      sctx.fillStyle = gradient
      sctx.fillRect(0, 0, size, size)
      return sprite
    }

    const build = () => {
      const { width, height } = measure()
      const base = Math.min(width, height)
      blobsRef.current = Array.from({ length: COUNT }, (_, i) => {
        const blob: Blob = {
          // Seed on a diagonal rather than at random, so the fields spread
          // across the viewport instead of clustering on first paint.
          x: width * (0.16 + 0.68 * (i / (COUNT - 1))),
          y: height * (i % 2 === 0 ? 0.28 : 0.72),
          vx: (Math.random() - 0.5) * DRIFT * 2,
          vy: (Math.random() - 0.5) * DRIFT * 2,
          radius: base * (0.3 + Math.random() * 0.16),
          phase: Math.random() * Math.PI * 2,
          phaseSpeed: 0.00018 + Math.random() * 0.00016,
          color: fields[i % fields.length],
        }
        blob.sprite = renderSprite(blob)
        return blob
      })
    }

    const resize = () => {
      const { width, height } = measure()
      const bw = Math.round(width * WALL_SCALE)
      const bh = Math.round(height * WALL_SCALE)
      if (canvas.width !== bw || canvas.height !== bh) {
        const kx = canvas.width ? bw / canvas.width : 1
        const ky = canvas.height ? bh / canvas.height : 1
        for (const blob of blobsRef.current) {
          blob.x *= kx
          blob.y *= ky
        }
        canvas.width = bw
        canvas.height = bh
      }
      css = { width, height }
      mirror.width = MIRROR_W
      mirror.height = Math.max(1, Math.round((MIRROR_W * height) / width))
    }

    const paintMirror = () => {
      if (!mctx) return
      const k = mirror.width / css.width
      mctx.setTransform(k, 0, 0, k, 0, 0)
      paintBase(mctx, css.width, css.height, isDark)
      for (const blob of blobsRef.current) {
        const rr = blob.radius * (1 + Math.sin(blob.phase) * 0.12)
        const g = mctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, rr)
        g.addColorStop(0, `rgba(${blob.color}, ${peak})`)
        g.addColorStop(0.45, `rgba(${blob.color}, ${peak * 0.55})`)
        g.addColorStop(1, `rgba(${blob.color}, 0)`)
        mctx.fillStyle = g
        mctx.fillRect(blob.x - rr, blob.y - rr, rr * 2, rr * 2)
      }
      mctx.setTransform(1, 0, 0, 1, 0, 0)
    }

    const paint = () => {
      ctx.setTransform(WALL_SCALE, 0, 0, WALL_SCALE, 0, 0)
      paintBase(ctx, css.width, css.height, isDark)
      for (const blob of blobsRef.current) {
        if (!still) {
          blob.x += blob.vx
          blob.y += blob.vy
          blob.phase += blob.phaseSpeed * 16
          // Bounce off a margin outside the viewport, so a field never fully
          // leaves the frame and no corner goes flat.
          if (blob.x < -blob.radius * 0.3 || blob.x > css.width + blob.radius * 0.3) blob.vx *= -1
          if (blob.y < -blob.radius * 0.3 || blob.y > css.height + blob.radius * 0.3) blob.vy *= -1
        }
        if (!blob.sprite) continue
        const scale = 1 + Math.sin(blob.phase) * 0.12
        const size = blob.sprite.width * scale
        ctx.drawImage(blob.sprite, blob.x - size / 2, blob.y - size / 2, size, size)
      }
      paintMirror()
      glassFrame()
    }

    // With reduced motion the fields hold still, but the loop keeps running
    // at a modest rate: the glass runtime still has to follow theme changes
    // and newly mounted sheets promptly. It only stops moving things.
    const interval = still ? 125 : frameInterval
    const loop = (time: number) => {
      animationRef.current = requestAnimationFrame(loop)
      const elapsed = time - lastTimeRef.current
      if (elapsed < interval) return
      lastTimeRef.current = time - (elapsed % interval)
      paint()
    }

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(resize, 200)
    }

    resize()
    build()
    setGlassSource(canvas, mirror)
    // Theme just changed (or first mount): let the theme rules apply before
    // the first frame re-derives the per-element luminance classes.
    resetGlassAdaptive()
    paint()
    animationRef.current = requestAnimationFrame(loop)
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      if (resizeTimer) clearTimeout(resizeTimer)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      setGlassSource(null)
    }
  }, [isDark])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden='true'
      // will-change: its own compositing layer, so software raster paths
      // upload the frame whole instead of in tiles.
      className='fixed inset-0 h-full w-full pointer-events-none will-change-transform'
      style={{ zIndex: 0 }}
    />
  )
}

export default AnimatedBackground
