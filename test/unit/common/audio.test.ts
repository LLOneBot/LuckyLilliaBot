import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from 'cordis'
import type { FFmpegAPI } from '@luckylillia/plugin-sdk'
import * as ffmpeg from '@/common/utils/ffmpeg'
import { isSilk, isWav } from '@/common/utils/audioFormat'

const mocks = vi.hoisted(() => ({ readFile: vi.fn(), unlink: vi.fn() }))
vi.mock('node:fs/promises', () => ({ default: mocks, ...mocks }))
import { decodeSilk, encodeSilk } from '@/common/utils/audio'

const ctx = { logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } } as unknown as Context
const native = {
  silkVersion: vi.fn(() => '1.0.9.6'),
  probe: vi.fn(), transcodeAudio: vi.fn(),
} as unknown as FFmpegAPI

beforeEach(() => {
  vi.spyOn(ffmpeg, 'tryGetFFmpegAddon').mockReturnValue(native)
  vi.spyOn(ffmpeg, 'getFFmpegAddon').mockReturnValue(native)
  mocks.readFile.mockResolvedValue(Buffer.from('input'))
  mocks.unlink.mockResolvedValue(undefined)
  vi.mocked(native.probe).mockResolvedValue({ width: 0, height: 0, duration: 1.2, size: 100, format: 'silk' })
  vi.mocked(native.transcodeAudio).mockResolvedValue(undefined)
})

describe('native SILK and optional-plugin fallback', () => {
  it('uses one native pipeline for audio to SILK and reads actual duration', async () => {
    const result = await encodeSilk(ctx, 'voice.mp3')
    expect(result).toMatchObject({ converted: true, duration: 1.2 })
    expect(native.transcodeAudio).toHaveBeenCalledWith('voice.mp3', result.path, { format: 'silk' })
    expect(native.probe).toHaveBeenCalledWith(result.path)
  })

  it.each(['wav', 'mp3'] as const)('uses native SILK decoding for %s', async format => {
    const output = await decodeSilk(ctx, 'voice.silk', format)
    expect(native.transcodeAudio).toHaveBeenCalledWith('voice.silk', output, { format })
    expect(mocks.readFile).not.toHaveBeenCalled()
  })

  it('keeps SILK unchanged and reads its actual native duration', async () => {
    mocks.readFile.mockResolvedValue(Buffer.from('\x02#!SILK_V3\npacket'))
    expect(await encodeSilk(ctx, 'original.silk')).toEqual({ converted: false, path: 'original.silk', duration: 1.2 })
    expect(native.transcodeAudio).not.toHaveBeenCalled()
  })

  it('passes existing SILK through without a plugin and explains the default duration', async () => {
    vi.mocked(ffmpeg.tryGetFFmpegAddon).mockReturnValue(undefined)
    mocks.readFile.mockResolvedValue(Buffer.from('#!SILK_V3\npacket'))
    expect(await encodeSilk(ctx, 'original.silk')).toEqual({ converted: false, path: 'original.silk', duration: 1 })
    expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining(ffmpeg.FFMPEG_PLUGIN))
    expect(ffmpeg.getFFmpegAddon).not.toHaveBeenCalled()
  })

  it('requires the plugin for WAV encoding and SILK playback', async () => {
    vi.mocked(ffmpeg.getFFmpegAddon).mockImplementation(() => { throw new ffmpeg.FFmpegUnavailableError() })
    mocks.readFile.mockResolvedValue(Buffer.from('RIFF0000WAVE'))
    await expect(encodeSilk(ctx, 'voice.wav')).rejects.toThrow('安装并启用')
    await expect(decodeSilk(ctx, 'voice.silk', 'wav')).rejects.toThrow(ffmpeg.FFMPEG_PLUGIN)
    expect(native.transcodeAudio).not.toHaveBeenCalled()
    expect(mocks.unlink).not.toHaveBeenCalled()
  })

  it('asks for an update if an older plugin lacks SILK support', async () => {
    vi.mocked(ffmpeg.getFFmpegAddon).mockReturnValue({ ...native, silkVersion: undefined })
    await expect(encodeSilk(ctx, 'voice.mp3')).rejects.toThrow('更新并启用')
    await expect(decodeSilk(ctx, 'voice.silk', 'wav')).rejects.toMatchObject({ code: 'FFMPEG_PLUGIN_MISSING' })
    expect(native.transcodeAudio).not.toHaveBeenCalled()
  })

  it('cleans partial output on conversion and metadata errors', async () => {
    vi.mocked(native.transcodeAudio).mockRejectedValueOnce(new Error('invalid SILK packet'))
    await expect(decodeSilk(ctx, 'bad.silk', 'wav')).rejects.toThrow('invalid SILK packet')
    vi.mocked(native.probe).mockRejectedValueOnce(new Error('invalid output'))
    await expect(encodeSilk(ctx, 'bad.mp3')).rejects.toThrow('invalid output')
    expect(mocks.unlink).toHaveBeenCalledTimes(2)
  })
})

describe('audio header detection without codecs', () => {
  it('recognizes standard and Tencent SILK while rejecting truncated headers', () => {
    expect(isSilk(Buffer.from('#!SILK_V3\n'))).toBe(true)
    expect(isSilk(Buffer.from('\x02#!SILK_V3\n'))).toBe(true)
    expect(isSilk(Buffer.from('\x02#!SILK_V'))).toBe(false)
    expect(isSilk(Buffer.alloc(0))).toBe(false)
  })

  it('recognizes WAV without mistaking other RIFF formats for audio', () => {
    expect(isWav(Buffer.from('RIFF0000WAVE'))).toBe(true)
    expect(isWav(Buffer.from('RIFF0000WEBP'))).toBe(false)
    expect(isWav(Buffer.from('RIFF'))).toBe(false)
  })
})
