import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from 'cordis'

const mocks = vi.hoisted(() => ({
  probe: vi.fn(), thumbnail: vi.fn(), writeFile: vi.fn(),
}))

vi.mock('@/common/utils/ffmpeg', () => ({ getFFmpegAddon: () => mocks }))
vi.mock('node:fs/promises', async original => ({
  ...await original<typeof import('node:fs/promises')>(),
  writeFile: mocks.writeFile,
}))

import { createThumb, defaultVideoThumb, getVideoInfo } from '@/common/utils/video'

const ctx = { logger: { info: vi.fn(), warn: vi.fn() } } as unknown as Context

beforeEach(() => {
  vi.useFakeTimers()
  mocks.writeFile.mockResolvedValue(undefined)
})
afterEach(() => { vi.useRealTimers() })

describe('native video helpers', () => {
  it('uses the native duration when the video stream has no duration tag', async () => {
    mocks.probe.mockResolvedValue({ width: 640, height: 360, duration: 1.25, format: 'matroska,webm', size: 123 })
    expect(await getVideoInfo('视频.webm')).toEqual({
      width: 640, height: 360, time: 1.25, format: 'matroska,webm', size: 123, filePath: '视频.webm',
    })
  })

  it('writes the returned PNG and releases the timeout', async () => {
    const png = Buffer.from('native thumbnail')
    mocks.thumbnail.mockResolvedValue(png)
    const result = await createThumb(ctx, '视频.mp4')
    expect(result).toMatch(/\.png$/)
    expect(mocks.writeFile).toHaveBeenCalledExactlyOnceWith(result, png)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the fallback when a timed-out native job finishes later', async () => {
    let finish!: (bytes: Buffer) => void
    mocks.thumbnail.mockReturnValue(new Promise<Buffer>(resolve => { finish = resolve }))
    const pending = createThumb(ctx, 'slow.mp4')
    await vi.advanceTimersByTimeAsync(5000)
    const result = await pending
    expect(result).toMatch(/\.jpg$/)
    expect(mocks.writeFile).toHaveBeenCalledExactlyOnceWith(result, defaultVideoThumb)
    finish(Buffer.from('late thumbnail'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(mocks.writeFile).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('handles an unavailable addon and corrupt video with the same fallback', async () => {
    mocks.thumbnail.mockImplementationOnce(() => { throw new Error('addon missing') })
    const first = await createThumb(ctx, 'first.mp4')
    mocks.thumbnail.mockRejectedValueOnce(new Error('invalid media'))
    const second = await createThumb(ctx, 'second.mp4')
    expect(first).not.toBe(second)
    expect(mocks.writeFile.mock.calls.map(call => call[1])).toEqual([defaultVideoThumb, defaultVideoThumb])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports a filesystem write failure instead of returning a nonexistent thumbnail', async () => {
    mocks.thumbnail.mockRejectedValueOnce(new Error('no video stream'))
    mocks.writeFile.mockRejectedValueOnce(new Error('disk full'))
    await expect(createThumb(ctx, 'audio.ogg')).rejects.toThrow('disk full')
    expect(vi.getTimerCount()).toBe(0)
  })
})
