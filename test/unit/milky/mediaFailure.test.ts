import { describe, expect, it, vi } from 'vitest'
import type { Context } from 'cordis'
import { FFmpegUnavailableError } from '@/common/utils/ffmpeg'
import { unlink } from 'node:fs/promises'

vi.mock('@/plugin/internal/adapter/milky/common/download', () => ({ resolveMilkyUri: async () => Buffer.from('mp3') }))
vi.mock('node:fs/promises', () => ({ writeFile: vi.fn(), unlink: vi.fn() }))
vi.mock('@/plugin/internal/protocol/nt-protocol/ntqqapi/entities', () => ({
  SendElement: {
    text: (text: string) => ({ text }),
    ptt: () => { throw new FFmpegUnavailableError() },
  },
}))
import { transformOutgoingMessage } from '@/plugin/internal/adapter/milky/transform/message/outgoing'

describe('Milky optional media service', () => {
  it('returns the installation instruction instead of silently losing the voice in a mixed message', async () => {
    const ctx = { logger: { error: vi.fn() } } as unknown as Context
    await expect(transformOutgoingMessage(ctx, [
      { type: 'text', data: { text: 'voice follows' } },
      { type: 'record', data: { uri: 'file:///voice.mp3' } },
    ], 'peer', false, false)).rejects.toThrow(/安装.*lucky-lillia-plugin-ffmpeg/)
    expect(ctx.logger.error).not.toHaveBeenCalled()
    expect(unlink).toHaveBeenCalledOnce()
  })
})
