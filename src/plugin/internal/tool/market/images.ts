export type CatalogScreenshot = string | { readonly src: string; readonly caption?: string }

function imagePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048 && value === value.trim()
    && !value.startsWith('/') && !/[:\\\u0000-\u001f\u007f]/.test(value)
    && !value.split('/').includes('..') && /\.(?:png|jpe?g|gif|webp|svg)$/i.test(value)
}

function imageWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || !/^https?:\/\/[^/?#@]+(?:[/?#]|$)/i.test(value)
    || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
  } catch {
    return false
  }
}

export function isImageSource(value: unknown): value is string {
  return imagePath(value) || imageWebUrl(value)
}

export function isScreenshot(value: unknown): value is CatalogScreenshot {
  if (isImageSource(value)) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  if (!Object.keys(item).every(key => ['src', 'caption'].includes(key)) || !isImageSource(item.src)) return false
  return !Object.hasOwn(item, 'caption') || typeof item.caption === 'string' && item.caption.length > 0
    && item.caption.length <= 200 && item.caption === item.caption.trim() && !/[\u0000-\u001f\u007f]/.test(item.caption)
}

/** Names and versions have already passed catalog validation; each filename remains a literal URL segment. */
export function imageUrl(plugin: { name: string; version: string }, source: unknown): string | undefined {
  if (imageWebUrl(source)) return source
  if (!imagePath(source)) return undefined
  const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  try {
    const file = source.split('/').filter(part => part && part !== '.').map(encode).join('/')
    return `https://cdn.jsdelivr.net/npm/${plugin.name}@${encode(plugin.version)}/${file}`
  } catch {
    return undefined
  }
}

export function previewImages(plugin: { name: string; version: string; screenshots?: readonly CatalogScreenshot[] }): { url: string; caption?: string }[] {
  const images: { url: string; caption?: string }[] = []
  for (const item of plugin.screenshots ?? []) {
    const url = imageUrl(plugin, typeof item === 'string' ? item : item.src)
    if (!url) continue
    const caption = typeof item === 'string' ? undefined : item.caption
    images.push({ url, ...(caption ? { caption } : {}) })
  }
  return images
}
