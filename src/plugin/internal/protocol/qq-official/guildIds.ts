import h from '@satorijs/element'
import { Channel } from '@satorijs/protocol'
import type { NeutralResource } from '@luckylillia/plugin-sdk'

const PREFIX = 'qqguild:'
const DIRECT_PREFIX = 'private:' + PREFIX

export const isGuildId = (id: string) => id.startsWith(PREFIX) || id.startsWith(DIRECT_PREFIX)
export const guildId = (id: string) => PREFIX + id

/** At the public API boundary, guild IDs must be explicit so a group can never become a guild request. */
export function rawGuildId(id: string): string {
  if (id.startsWith(DIRECT_PREFIX)) return id.slice(DIRECT_PREFIX.length)
  if (id.startsWith(PREFIX)) return id.slice(PREFIX.length)
  throw new Error(`需要 QQ 频道 ID（qqguild: 前缀）: ${id}`)
}

/** Native payloads and opaque pagination tokens keep Tencent's IDs. */
export const rawGuildValue = (id: string) => isGuildId(id) ? rawGuildId(id) : id

/** Only standardized identity attributes change; button IDs/data and native payloads are untouched. */
export function guildElements(elements: h[], outward: boolean, selfId: string): h[] {
  const change = (id: string) => outward ? guildId(id) : rawGuildValue(id)
  return elements.map(element => {
    const attrs = { ...element.attrs }
    if ((element.type === 'at' || element.type === 'sharp' || element.type === 'quote') && typeof attrs.id === 'string') {
      if (element.type !== 'at' || attrs.id !== selfId) attrs.id = change(attrs.id)
    }
    if (element.type === 'passive') {
      for (const key of ['messageId', 'eventId']) if (typeof attrs[key] === 'string') attrs[key] = change(attrs[key])
    }
    return h(element.type, attrs, guildElements(element.children, outward, selfId))
  })
}

type ResourceKind = 'event' | 'message' | 'user' | 'channel' | 'guild' | 'member'

/** Turns a native guild resource/event into the unified QQ namespace without changing the bot's own identity. */
export function guildResource<T extends NeutralResource>(value: T, kind: ResourceKind, selfId: string, guildSelfId?: string): T {
  const out: NeutralResource = { ...value }
  if (typeof value.id === 'string' && !['event', 'member'].includes(kind)) {
    out.id = kind === 'user' && value.id === guildSelfId ? selfId
      : kind === 'channel' && value.type === Channel.Type.DIRECT ? DIRECT_PREFIX + value.id : guildId(value.id)
  }
  if (kind === 'channel' && typeof value.parent_id === 'string' && value.parent_id !== '0') out.parent_id = guildId(value.parent_id)
  if (kind === 'message' && typeof value.content === 'string') out.content = guildElements(h.parse(value.content), true, selfId).join('')
  for (const key of ['message', 'user', 'channel', 'guild', 'member', 'operator', 'quote'] as const) {
    if (!value[key] || typeof value[key] !== 'object') continue
    const childKind = key === 'operator' ? 'user' : key === 'quote' ? 'message' : key
    out[key] = guildResource(value[key], childKind, selfId, guildSelfId)
  }
  if (value.referrer && typeof value.referrer === 'object') {
    out.referrer = { ...value.referrer }
    for (const key of ['msg_id', 'event_id']) {
      if (typeof out.referrer[key] === 'string') out.referrer[key] = guildId(out.referrer[key])
    }
  }
  return out as T
}
