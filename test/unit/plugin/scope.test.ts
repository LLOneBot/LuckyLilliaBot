import { describe, expect, it } from 'vitest'
import { acceptsScope, normalizeScope } from '@/plugin/host/scope'

const group = (guildId: string, userId = 'U1') => ({ platform: 'ntqq', selfId: '10000', guildId, channelId: guildId, userId, isDirect: false })
const direct = (userId = 'U1') => ({ platform: 'ntqq', selfId: '10000', channelId: `private:${userId}`, userId, isDirect: true })

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
    expect(acceptsScope({ bots: ['ntqq:10000'] }, group('123'))).toBe(true)
    expect(acceptsScope({ bots: ['ntqq:20000'] }, group('123'))).toBe(false)
  })

  it('normalizes only legacy NTQQ platform keys and complete prefixes, without widening filters', () => {
    const normalized = normalizeScope({
      platforms: [' luckylillia ', 'ntqq', 'qq', 'luckylillia-extra'],
      bots: ['luckylillia:10000', 'ntqq:10000', 'qq:luckylillia:10000'],
      guilds: { mode: 'allow', ids: ['luckylillia:G1', 'ntqq:G1', 'G2', 'luckylillia'] },
      users: { mode: 'deny', ids: ['luckylillia:U1', 'ntqq:U1', 'qq:U2'] },
    })
    expect(normalized).toEqual({
      platforms: ['ntqq', 'qq', 'luckylillia-extra'],
      bots: ['ntqq:10000', 'qq:luckylillia:10000'],
      guilds: { mode: 'allow', ids: ['ntqq:G1', 'G2', 'luckylillia'] },
      users: { mode: 'deny', ids: ['ntqq:U1', 'qq:U2'] },
    })
    expect(normalizeScope(normalized)).toEqual(normalized)
  })

  it('matches both old and new NTQQ scope keys while keeping other platforms and ids separate', () => {
    const places = [group('G1'), { ...group('G1'), platform: 'luckylillia' }]
    for (const platform of ['ntqq', 'luckylillia']) {
      const scope = { platforms: [platform], bots: [`${platform}:10000`], guilds: { mode: 'allow' as const, ids: [`${platform}:G1`] } }
      for (const place of places) {
        expect(acceptsScope(scope, place)).toBe(true)
        expect(acceptsScope(scope, { ...place, selfId: '20000' })).toBe(false)
        expect(acceptsScope(scope, { ...place, guildId: 'G2', channelId: 'G2' })).toBe(false)
      }
      expect(acceptsScope(scope, { ...group('G1'), platform: 'qq' })).toBe(false)
      expect(acceptsScope(scope, { ...group('G1'), platform: 'luckylillia-extra' })).toBe(false)
      for (const mode of ['allow', 'deny'] as const) {
        const userScope = { users: { mode, ids: [`${platform}:U1`] } }
        expect(acceptsScope(userScope, direct())).toBe(mode === 'allow')
        expect(acceptsScope(userScope, { ...direct(), platform: 'qq' })).toBe(mode === 'deny')
        expect(acceptsScope(userScope, direct('U2'))).toBe(mode === 'deny')
        const guildScope = { guilds: { mode, ids: [`${platform}:G1`] } }
        expect(acceptsScope(guildScope, group('G1'))).toBe(mode === 'allow')
        expect(acceptsScope(guildScope, { ...group('G1'), platform: 'qq' })).toBe(mode === 'deny')
      }
    }
  })
})
