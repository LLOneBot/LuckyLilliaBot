import { describe, expect, it } from 'vitest'
import { messageSummary } from '@/plugin/internal/protocol/qq-official/log'

describe('QQ official message summaries', () => {
  it('keeps readable text and media labels without attachment URLs or platform payload attributes', () => {
    expect(messageSummary('hello<img src="data:image/png;base64,PRIVATE"/><audio src="https://example.test/?token=PRIVATE"/><qq:ark templateId="23" payload="PRIVATE"/>'))
      .toBe('hello[图片][语音][平台消息]')
    expect(messageSummary('<markdown>hello![picture](data:image/png;base64,PRIVATE)</markdown>')).toBe('[Markdown]hello[图片]')
  })

  it('keeps a message on one bounded log line', () => {
    expect(messageSummary('<p>first\nline</p><p>second\tline</p>')).toBe('first line second line')
    expect(messageSummary('a'.repeat(400))).toBe('a'.repeat(300) + '…')
    expect(messageSummary('')).toBe('[消息]')
  })
})
