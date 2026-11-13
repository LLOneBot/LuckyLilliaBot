import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { QQOfficialApi } from '@/plugin/internal/protocol/qq-official/api'
import { officialInternal } from '@/plugin/internal/protocol/qq-official/internal'
import { renderInternal, SDK_INTERNAL } from '../../../scripts/gen-sdk-internal.mts'
import { internalOf } from '../../../packages/plugin-sdk/src/internal'
import type { Bot } from '../../../packages/plugin-sdk/src/universal'

describe('the SDK types of bot.internal', () => {
  it('name every method the code makes: run scripts/gen-sdk-internal.mts after adding or dropping one', () => {
    expect(readFileSync(SDK_INTERNAL, 'utf8').split('\r\n').join('\n')).toBe(renderInternal())
  })

  it('selects NTQQ actions using the ntqq platform identifier', () => {
    const internal = { setGroupCard: vi.fn() }
    const bot = { platform: 'ntqq', internal } as unknown as Bot
    expect(internalOf(bot, 'ntqq')).toBe(internal)
    expect(internalOf(bot, 'qq')).toBeUndefined()
    expect(internalOf({ platform: 'luckylillia', internal } as unknown as Bot, 'ntqq')).toBeUndefined()
  })

  it('exposes group and guild calls through the same qq bot without changing the group send/delete names', async () => {
    const request = vi.fn(async () => ({ ok: true }))
    const internal = officialInternal({ request } as unknown as QQOfficialApi)
    const bot = { platform: 'qq', internal } as unknown as Bot
    const qq = internalOf(bot, 'qq')!
    expect(qq).toBe(internal)
    expect(internalOf(bot, 'ntqq')).toBeUndefined()

    await qq.sendMessage('GROUP', { content: 'group' })
    await qq.sendGuildMessage('CHANNEL', { content: 'guild' })
    await qq.deleteMessage('GROUP', 'GROUP_MESSAGE')
    await qq.deleteGuildMessage('CHANNEL', 'GUILD_MESSAGE')
    expect(request.mock.calls).toEqual([
      ['POST', '/v2/groups/GROUP/messages', { content: 'group' }, { params: undefined }],
      ['POST', '/channels/CHANNEL/messages', { content: 'guild' }, { params: undefined }],
      ['DELETE', '/v2/groups/GROUP/messages/GROUP_MESSAGE', undefined, { params: undefined }],
      ['DELETE', '/channels/CHANNEL/messages/GUILD_MESSAGE', undefined, { params: undefined }],
    ])
  })
})
