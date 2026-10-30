import h from '@satorijs/element'
import { Methods } from '@satorijs/protocol'
import type { Bot } from '@luckylillia/plugin-sdk'

// Satori clients have always seen the NT account as `llonebot`, with its own elements `llonebot:*` and faces marked
// `platform="llonebot"`; the neutral layer names it `luckylillia` (ntqq-universal/bot.ts). Everything else goes
// out under the name it has inside.
const WIRE_NAMES: Record<string, string> = { luckylillia: 'llonebot' }

export function wirePlatform(platform: string): string {
  return WIRE_NAMES[platform] ?? platform
}

/** Undefined for a neutral name that clients know by another one. */
export function neutralPlatform(platform: string): string | undefined {
  if (Object.hasOwn(WIRE_NAMES, platform)) return
  return Object.keys(WIRE_NAMES).find(neutral => WIRE_NAMES[neutral] === platform) ?? platform
}

type Rewrite = (element: h) => h

function rewrite(content: string, from: string, change: Rewrite): string {
  // Left as it is unless there is something to rename, so the markup stays byte for byte
  if (!content.includes(`<${from}:`) && !content.includes('<face')) return content
  const visit = (elements: h[]): h[] => elements.map((element) => {
    const changed = change(element)
    return h(changed.type, changed.attrs, visit(element.children))
  })
  return visit(h.parse(content)).join('')
}

function rename(element: h, from: string, to: string, face: (attrs: Record<string, any>) => Record<string, any>): h {
  if (element.type === 'face') return h('face', face(element.attrs))
  if (element.type.startsWith(`${from}:`)) return h(`${to}:${element.type.slice(from.length + 1)}`, element.attrs)
  return element
}

/** A bot's element markup as its clients know it. */
export function wireContent(content: string, platform: string): string {
  const wire = WIRE_NAMES[platform]
  if (!wire) return content
  return rewrite(content, platform, element => rename(element, platform, wire, attrs => ({ ...attrs, platform: wire })))
}

/** A client's element markup as the neutral layer reads it. */
export function neutralContent(content: string, platform: string): string {
  const wire = WIRE_NAMES[platform]
  if (!wire) return content
  return rewrite(content, wire, element => rename(element, wire, platform, ({ platform: _, ...attrs }) => attrs))
}

/**
 * An event or resource as clients get it: every `platform` field and every message `content` renamed, and nothing
 * undefined, as JSON would have it.
 */
export function toWire<T>(value: T, platform: string): T {
  if (Array.isArray(value)) return value.map(item => toWire(item, platform)) as T
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(value)) {
    if (field === undefined) continue
    if (key === 'platform' && typeof field === 'string') out[key] = wirePlatform(field)
    else if (key === 'content' && typeof field === 'string') out[key] = wireContent(field, platform)
    else out[key] = toWire(field, platform)
  }
  return out as T
}

/** The bot's own call for a Satori method, if it has one; createMessage and getLogin are the adapter's. */
export function implemented(bot: Bot, name: string): boolean {
  if (name === 'createMessage' || name === 'getLogin') return true
  return typeof (bot as unknown as Record<string, unknown>)[name] === 'function'
}

/** Satori's features: the methods the bot has, and what it says it can send. */
export function featuresOf(bot: Bot): string[] {
  const methods = Object.entries(Methods).filter(([, method]) => implemented(bot, method.name)).map(([feature]) => feature)
  return [...methods, ...(bot.features ?? [])]
}
