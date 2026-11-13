import { describe, expect, it } from 'vitest'
import { formatOwner, parseOwner } from '@/plugin/internal/service/commands/client/owners'

describe('command owner rows', () => {
  it('keeps a bare user id applicable to all platforms', () => {
    expect(parseOwner('12345')).toEqual({ platform: '', userId: '12345' })
    expect(formatOwner({ platform: '', userId: '12345' })).toBe('12345')
  })

  it('preserves platform-specific ids, including colons in a resource id', () => {
    expect(parseOwner('ntqq:12345')).toEqual({ platform: 'ntqq', userId: '12345' })
    const channelOwner = { platform: 'qq', userId: 'qqguild:12345' }
    expect(parseOwner(formatOwner(channelOwner))).toEqual(channelOwner)
    expect(parseOwner(formatOwner({ platform: 'other', userId: 'abc:def' })))
      .toEqual({ platform: 'other', userId: 'abc:def' })
  })

  it('keeps a selected platform while a new or cleared row awaits its user id', () => {
    expect(parseOwner('')).toEqual({ platform: '', userId: '' })
    expect(parseOwner(formatOwner({ platform: 'ntqq', userId: '' })))
      .toEqual({ platform: 'ntqq', userId: '' })
  })
})
