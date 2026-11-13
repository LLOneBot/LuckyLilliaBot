import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Adapter from '@/plugin/internal/adapter/onebot11/adapter'
import GetRecord from '@/plugin/internal/adapter/onebot11/action/file/GetRecord'

const io = vi.hoisted(() => ({ writeFile: vi.fn(), unlink: vi.fn(), stat: vi.fn() }))
vi.mock('node:fs/promises', () => io)

const amr = Buffer.from('#!AMR\nvoice-data')
const adapter = { ctx: {
  logger: { error: vi.fn() },
  store: { getFileCacheByName: async () => [{ chatType: 2, fileUuid: 'voice' }] },
  ntFileApi: { getPttUrl: async () => 'https://example.invalid/voice' },
} } as unknown as Adapter

beforeEach(() => {
  io.unlink.mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(amr)))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('OneBot get_record without FFmpeg', () => {
  it('returns existing AMR unchanged without requiring a conversion provider', async () => {
    const response = await new GetRecord(adapter).handle({ file: 'cached', out_format: 'amr' }, {} as never)
    expect(response.status).toBe('ok')
    expect(response.data?.file).toMatch(/\.amr$/)
    expect(response.data?.file_size).toBe(String(amr.length))
    expect(io.writeFile).toHaveBeenCalledExactlyOnceWith(response.data?.file, amr)
  })

  it('returns install guidance for a required conversion without creating temporary files', async () => {
    const response = await new GetRecord(adapter).handle({ file: 'cached', out_format: 'mp3' }, {} as never)
    expect(response.status).toBe('failed')
    expect(response.message).toContain('lucky-lillia-plugin-ffmpeg')
    expect(response.message).toContain('安装并启用')
    expect(io.writeFile).not.toHaveBeenCalled()
  })

  it('requires the plugin for SILK to WAV and cleans the temporary input', async () => {
    const silk = Buffer.concat([Buffer.from([2]), Buffer.from('#!SILK_V3fixture')])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(silk)))
    const response = await new GetRecord(adapter).handle({ file: 'cached', out_format: 'wav' }, {} as never)
    expect(response.status).toBe('failed')
    expect(response.message).toContain('lucky-lillia-plugin-ffmpeg')
    expect(io.writeFile).toHaveBeenCalledOnce()
    expect(io.unlink).toHaveBeenCalledExactlyOnceWith(io.writeFile.mock.calls[0][0])
  })
})
