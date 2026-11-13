import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from 'cordis'
import { FFmpegUnavailableError, getFFmpegAddon, installFFmpegBridge, isFFmpegUnavailableError } from '@/common/utils/ffmpeg'

let ctx: Context | undefined
afterEach(async () => { await ctx?.fiber.dispose() })

describe('optional FFmpeg service', () => {
  it('keeps other plugins running without FFmpeg and follows install, disable and replacement', async () => {
    ctx = new Context()
    installFFmpegBridge(ctx)
    let restarts = 0
    await ctx.plugin(() => { restarts++ })
    expect(() => getFFmpegAddon()).toThrow(FFmpegUnavailableError)
    const provider = (version: string) => class extends Service {
      constructor(scope: Context) { super(scope, 'ffmpeg') }
      version() { return version }
      async probe() { return { width: 32, height: 24, duration: 1, format: version, size: 100 } }
    }
    const first = ctx.plugin(provider('first'))
    await first
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(getFFmpegAddon().version()).toBe('first')
    expect((await getFFmpegAddon().probe('x')).format).toBe('first')
    await first.dispose()
    expect(() => getFFmpegAddon()).toThrow(/lucky-lillia-plugin-ffmpeg/)
    await ctx.plugin(provider('updated'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(getFFmpegAddon().version()).toBe('updated')
    expect(restarts).toBe(1)
    await ctx.fiber.dispose()
    expect(() => getFFmpegAddon()).toThrow(FFmpegUnavailableError)
  })

  it('keeps failed providers unavailable and identifies install guidance across module reloads', async () => {
    ctx = new Context()
    installFFmpegBridge(ctx)
    const failed = ctx.plugin(class extends Service {
      constructor(scope: Context) {
        super(scope, 'ffmpeg')
        throw new Error('corrupt native module')
      }
    })
    await expect(failed).rejects.toThrow('corrupt native module')
    expect(() => getFFmpegAddon()).toThrow(FFmpegUnavailableError)
    expect(isFFmpegUnavailableError({ code: 'FFMPEG_PLUGIN_MISSING' })).toBe(true)
    expect(isFFmpegUnavailableError(new Error('native failure'))).toBe(false)
  })
})
