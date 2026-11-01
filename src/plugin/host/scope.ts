import type { Place } from '../../universal/bots'

/** A list of ids that either lets through only its members or all but them. */
export interface IdFilter {
  mode: 'allow' | 'deny'
  /** An id as the platform has it, or `platform:id` for one platform only */
  ids: string[]
}

/**
 * Where a plugin entry takes events from. What it leaves out reaches none of its listeners or commands, and its
 * `bot/before-send` does not see messages to it. Fields left out let everything through.
 */
export interface EntryScope {
  /** Only these platforms: `luckylillia` (the QQ account), `qq`, `qqguild` */
  platforms?: string[]
  /** Only these bots, as `platform:selfId` */
  bots?: string[]
  /** Groups and guild channels */
  guilds?: IdFilter
  users?: IdFilter
  /** Private chats; off when false */
  direct?: boolean
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))] : []

function normalizeFilter(value: unknown): IdFilter | undefined {
  if (!value || typeof value !== 'object') return
  const { mode, ids } = value as Record<string, unknown>
  const list = strings(ids)
  if ((mode !== 'allow' && mode !== 'deny') || (mode === 'deny' && !list.length)) return
  return { mode, ids: list }
}

/** Drops what is malformed or lets everything through anyway; undefined when nothing is left. */
export function normalizeScope(value: unknown): EntryScope | undefined {
  if (!value || typeof value !== 'object') return
  const input = value as Record<string, unknown>
  const scope: EntryScope = {}
  const platforms = strings(input.platforms)
  if (platforms.length) scope.platforms = platforms
  const bots = strings(input.bots)
  if (bots.length) scope.bots = bots
  const guilds = normalizeFilter(input.guilds)
  if (guilds) scope.guilds = guilds
  const users = normalizeFilter(input.users)
  if (users) scope.users = users
  if (input.direct === false) scope.direct = false
  return Object.keys(scope).length ? scope : undefined
}

function listed(filter: IdFilter, platform: string, ...ids: (string | undefined)[]) {
  return ids.some(id => id !== undefined && (filter.ids.includes(id) || filter.ids.includes(`${platform}:${id}`)))
}

const passes = (filter: IdFilter, found: boolean) => filter.mode === 'allow' ? found : !found

/**
 * Whether an entry with this scope takes an event from `place`. The group filter only judges group events: private
 * chats answer to `direct`, events without a channel to neither. An event without a user passes the user filter.
 */
export function acceptsScope(scope: EntryScope | undefined, place: Place): boolean {
  if (!scope) return true
  if (scope.platforms && !scope.platforms.includes(place.platform)) return false
  if (scope.bots && !scope.bots.includes(`${place.platform}:${place.selfId}`)) return false
  if (place.isDirect) {
    if (scope.direct === false) return false
  } else if (scope.guilds && (place.guildId || place.channelId)) {
    if (!passes(scope.guilds, listed(scope.guilds, place.platform, place.guildId, place.channelId))) return false
  }
  if (scope.users && place.userId && !passes(scope.users, listed(scope.users, place.platform, place.userId))) return false
  return true
}
