import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from 'cordis'
import type { FFmpegAPI } from '@luckylillia/plugin-sdk'
import type { QQOfficialApi } from '@/plugin/internal/protocol/qq-official/api'
import { uploadMedia } from '@/plugin/internal/protocol/qq-official/media'
import { FileType } from '@/plugin/internal/protocol/qq-official/types'
import * as ffmpeg from '@/common/utils/ffmpeg'

const io = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn(), rm: vi.fn(), unlink: vi.fn() }))
vi.mock('node:fs/promises', () => ({ ...io, default: io }))
const ctx = { logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } } as unknown as Context
const api = { request: vi.fn() } as unknown as QQOfficialApi
const silk = Buffer.concat([Buffer.from([2]), Buffer.from('#!SILK_V3\nvoice')])
const wav = Buffer.from('RIFF0000WAVE')
const source = (data: Buffer) => 'base64://' + data.toString('base64')

beforeEach(() => {
  io.readFile.mockResolvedValue(wav)
  io.writeFile.mockResolvedValue(undefined)
  io.rm.mockResolvedValue(undefined)
  vi.mocked(api.request).mockResolvedValue({ file_info: 'uploaded' })
  vi.spyOn(ffmpeg, 'getFFmpegAddon').mockImplementation(() => { throw new ffmpeg.FFmpegUnavailableError() })
})

describe('QQ official voice with the optional native plugin', () => {
  it('uploads existing SILK unchanged without a codec', async () => {
    await expect(uploadMedia(ctx, api, '/v2/groups/g', FileType.Audio, source(silk))).resolves.toBe('uploaded')
    expect(api.request).toHaveBeenCalledWith('POST', '/v2/groups/g/files', expect.objectContaining({ file_data: silk.toString('base64') }))
    expect(ffmpeg.getFFmpegAddon).not.toHaveBeenCalled()
    expect(io.writeFile).not.toHaveBeenCalled()
  })

  it('reports the missing plugin for WAV and cleans temporary input before uploading', async () => {
    await expect(uploadMedia(ctx, api, '/v2/groups/g', FileType.Audio, source(wav))).rejects.toThrow('lucky-lillia-plugin-ffmpeg')
    expect(api.request).not.toHaveBeenCalled()
    expect(io.rm).toHaveBeenCalledExactlyOnceWith(io.writeFile.mock.calls[0][0], { force: true })
  })

  it('uploads native SILK output and cleans both temporary files', async () => {
    const native = { silkVersion: () => '1.0.9.6', transcodeAudio: vi.fn(), probe: vi.fn(async () => ({ duration: 1 })) }
    vi.mocked(ffmpeg.getFFmpegAddon).mockReturnValue(native as unknown as FFmpegAPI)
    io.readFile.mockResolvedValueOnce(wav).mockResolvedValueOnce(silk)
    await uploadMedia(ctx, api, '/v2/groups/g', FileType.Audio, source(wav))
    expect(native.transcodeAudio).toHaveBeenCalledWith(io.writeFile.mock.calls[0][0], expect.stringMatching(/\.silk$/), { format: 'silk' })
    expect(api.request).toHaveBeenCalledWith('POST', '/v2/groups/g/files', expect.objectContaining({ file_data: silk.toString('base64') }))
    expect(io.rm).toHaveBeenCalledTimes(2)
  })
})
