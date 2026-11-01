import { describe, expect, it } from 'vitest'
import { acceptsScope, normalizeScope } from '@/plugin/host/scope'

const group = (guildId: string, userId = 'U1') => ({ platform: 'luckylillia', selfId: '10000', guildId, channelId: guildId, userId, isDirect: false })
const direct = (userId = 'U1') => ({ platform: 'luckylillia', selfId: '10000', channelId: `private:${userId}`, userId, isDirect: true })

describe('plugin scopes', () => {
  it('keeps only what lets something through', () => {
    expect(normalizeScope(undefined)).toBeUndefined()
    expect(normalizeScope({ platforms: [], guilds: { mode: 'deny', ids: [] }, direct: true })).toBeUndefined()
    expect(normalizeScope({ guilds: { mode: 'allow', ids: [] } })).toEqual({ guilds: { mode: 'allow', ids: [] } })
    expect(normalizeScope({ platforms: ['qq', ' qq ', 3], users: { mode: 'odd', ids: ['x'] }, direct: false })).toEqual({ platforms: ['qq'], direct: false })
  })

  it('judges groups by their filter, private chats by `direct`, and both by platform, bot and user', () => {
    const scope = { guilds: { mode: 'allow' as const, ids: ['123', 'qq:G9'] } }
    expect(acceptsScope(scope, group('123'))).toBe(true)
    expect(acceptsScope(scope, group('456'))).toBe(false)
    expect(acceptsScope(scope, { ...group('G9'), platform: 'qq' })).toBe(true)
    expect(acceptsScope(scope, group('G9'))).toBe(false)
    expect(acceptsScope(scope, direct())).toBe(true)
    expect(acceptsScope({ ...scope, direct: false }, direct())).toBe(false)

    const users = { users: { mode: 'deny' as const, ids: ['U2'] } }
    expect(acceptsScope(users, group('123', 'U2'))).toBe(false)
    expect(acceptsScope(users, direct('U2'))).toBe(false)
    expect(acceptsScope(users, { ...group('123'), userId: undefined })).toBe(true)

    expect(acceptsScope({ platforms: ['qq'] }, group('123'))).toBe(false)
    expect(acceptsScope({ bots: ['luckylillia:10000'] }, group('123'))).toBe(true)
    expect(acceptsScope({ bots: ['luckylillia:20000'] }, group('123'))).toBe(false)
  })
})
