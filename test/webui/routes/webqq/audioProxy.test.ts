import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProxyRoutes } from '@/plugin/internal/tool/webqq/proxy'
import { decodeSilk } from '@/common/utils/audio'
import * as ffmpeg from '@/common/utils/ffmpeg'
import { createMockContext } from '../../helpers/mockContext'

vi.mock('@/common/utils/audio', () => ({ decodeSilk: vi.fn() }))

const wav = Buffer.alloc(46)
wav.write('RIFF', 0)
wav.writeUInt32LE(38, 4)
wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20)
wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(24000, 24)
wav.writeUInt32LE(48000, 28)
wav.writeUInt16LE(2, 32)
wav.writeUInt16LE(16, 34)
wav.write('data', 36)
wav.writeUInt32LE(2, 40)

describe('WebQQ voice with an optional FFmpeg plugin', () => {
  let directory: string
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'llbot-webqq-audio-'))
    ctx = createMockContext()
    vi.spyOn(ffmpeg, 'getFFmpegAddon').mockImplementation(() => { throw new ffmpeg.FFmpegUnavailableError() })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    const resolved = path.resolve(directory)
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('llbot-webqq-audio-')) {
      throw new Error('Unexpected test directory')
    }
    await rm(resolved, { recursive: true, force: true })
  })

  function request(filePath: string) {
    return createProxyRoutes(ctx).request('/audio-proxy?filePath=' + encodeURIComponent(filePath))
  }

  it('uses the SILK helper to decode to WAV and preserves the input file', async () => {
    const input = path.join(directory, '原始语音.silk')
    const output = path.join(directory, 'decoded.wav')
    const silk = Buffer.from('#!SILK_V3\nfixture')
    await writeFile(input, silk)
    vi.mocked(decodeSilk).mockImplementation(async () => {
      await writeFile(output, wav)
      return output
    })

    const response = await request(input)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('audio/wav')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(wav)
    expect(decodeSilk).toHaveBeenCalledWith(ctx, input, 'wav')
    expect(ffmpeg.getFFmpegAddon).not.toHaveBeenCalled()
    expect(await readFile(input)).toEqual(silk)
    await expect(access(output)).rejects.toThrow()
  })

  it('passes existing WAV through without a plugin or deleting a user file under the temp directory', async () => {
    const input = path.join(directory, 'voice.wav')
    await writeFile(input, wav)
    const response = await request(input)
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer())).toEqual(wav)
    expect(decodeSilk).not.toHaveBeenCalled()
    expect(ffmpeg.getFFmpegAddon).not.toHaveBeenCalled()
    expect(await readFile(input)).toEqual(wav)
  })

  it.each(['amr', 'silk'])('returns actionable missing-plugin guidance for %s', async format => {
    const input = path.join(directory, 'voice.' + format)
    await writeFile(input, format === 'amr' ? '#!AMR\nfixture' : '#!SILK_V3\nfixture')
    vi.mocked(decodeSilk).mockRejectedValue(new ffmpeg.FFmpegUnavailableError())
    const response = await request(input)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      success: false, code: 'FFMPEG_PLUGIN_MISSING', message: new ffmpeg.FFmpegUnavailableError().message,
    })
    await expect(access(input)).resolves.toBeUndefined()
    expect(ctx.logger.error).not.toHaveBeenCalled()
  })

  it('uses the installed provider for non-Silk audio and cleans downloaded and converted files', async () => {
    ctx.ntFileApi.getPttUrl.mockResolvedValue('https://voice.example/voice')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('#!AMR\nfixture')))
    const transcodeAudio = vi.fn(async (_input: string, output: string) => { await writeFile(output, wav) })
    vi.mocked(ffmpeg.getFFmpegAddon).mockReturnValue({ transcodeAudio } as any)
    const response = await createProxyRoutes(ctx).request('/audio-proxy?fileUuid=voice-id&isGroup=true')
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer())).toEqual(wav)
    expect(transcodeAudio).toHaveBeenCalledOnce()
    const [input, output, options] = transcodeAudio.mock.calls[0] as unknown as [string, string, unknown]
    expect(options).toEqual({ format: 'wav' })
    await expect(access(input)).rejects.toThrow()
    await expect(access(output)).rejects.toThrow()
  })

  it('keeps native decoding errors distinct and cleans a partially written conversion', async () => {
    const input = path.join(directory, 'bad.amr')
    await writeFile(input, '#!AMR\ncorrupt')
    let partial = ''
    vi.mocked(ffmpeg.getFFmpegAddon).mockReturnValue({
      transcodeAudio: async (_input: string, output: string) => {
        partial = output
        await writeFile(output, 'partial')
        throw new Error('Invalid media')
      },
    } as any)
    const response = await request(input)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ success: false, message: '语音解码失败', error: 'Error: Invalid media' })
    await expect(access(input)).resolves.toBeUndefined()
    await expect(access(partial)).rejects.toThrow()
  })
})
