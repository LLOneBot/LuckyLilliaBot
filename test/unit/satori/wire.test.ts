import h from '@satorijs/element'
import { describe, expect, it } from 'vitest'
import { neutralContent, neutralPlatform, toWire, wireContent, wirePlatform } from '@/plugin/internal/adapter/satori/wire'

describe('NTQQ names at the Satori boundary', () => {
  it('keeps llonebot on the wire and resolves it to ntqq internally', () => {
    expect(wirePlatform('ntqq')).toBe('llonebot')
    expect(neutralPlatform('llonebot')).toBe('ntqq')
    expect(neutralPlatform('ntqq')).toBeUndefined()
    expect(wirePlatform('qq')).toBe('qq')
    expect(neutralPlatform('qq')).toBe('qq')
  })

  it('round-trips native elements inside a forwarded message and rewrites every event platform', () => {
    const content = h('message', {}, [
      h('ntqq:ark', { data: '{"app":"x"}' }, '[分享]'),
      h('ntqq:market-face', { emojiPackageId: '12', emojiId: 'ab1234', key: 'face-key' }, [h.image('https://example.com/face.gif')]),
      h('face', { id: '13' }),
    ]).toString()
    const event = { platform: 'ntqq', login: { platform: 'ntqq' }, message: { content } }
    const wire = toWire(event, 'ntqq')
    expect(wire.platform).toBe('llonebot')
    expect(wire.login.platform).toBe('llonebot')
    expect(wire.message.content).toContain('<llonebot:ark ')
    expect(wire.message.content).toContain('<llonebot:market-face ')
    expect(wire.message.content).toContain('<face id="13" platform="llonebot"/>')
    expect(neutralContent(wire.message.content, 'ntqq')).toBe(content)
    expect(event.platform).toBe('ntqq')
    expect(event.message.content).toBe(content)
  })

  it('leaves text and other platforms untouched', () => {
    const text = 'ntqq:123456 luckylillia https://www.luckylillia.com'
    expect(wireContent(text, 'ntqq')).toBe(text)
    const content = '<qq:custom/><face id="13"/>'
    expect(wireContent(content, 'qq')).toBe(content)
    expect(neutralContent(content, 'qq')).toBe(content)
  })
})
