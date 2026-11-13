import type { Context } from 'cordis'
import type { FFmpegAPI } from '@luckylillia/plugin-sdk'
import { getLogger } from '../logger'

export type { FFmpegAudioFormat as AudioFormat, FFmpegMediaInfo as MediaInfo } from '@luckylillia/plugin-sdk'

export const FFMPEG_PLUGIN = 'lucky-lillia-plugin-ffmpeg'

export class FFmpegUnavailableError extends Error {
  readonly code = 'FFMPEG_PLUGIN_MISSING'
  constructor(message = `未安装或未启用 FFmpeg 插件（${FFMPEG_PLUGIN}），请安装并启用后重试`) {
    super(message)
    this.name = 'FFmpegUnavailableError'
  }
}

export function isFFmpegUnavailableError(error: unknown): error is FFmpegUnavailableError {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'FFMPEG_PLUGIN_MISSING'
}

let active: { api: FFmpegAPI } | undefined

/** Bridges the optional service to existing media helpers used by separately updated builtin packages. */
export function installFFmpegBridge(ctx: Context): void {
  ctx.inject(['ffmpeg'], scope => {
    const binding = { api: scope.ffmpeg }
    scope.effect(() => {
      active = binding
      return () => {
        if (active === binding) active = undefined
      }
    })
  })
}

/** No native module is imported by the host. Availability follows the external plugin's lifecycle. */
export function tryGetFFmpegAddon(): FFmpegAPI | undefined {
  return active?.api
}

export function getFFmpegAddon(): FFmpegAPI {
  const api = tryGetFFmpegAddon()
  if (!api) throw new FFmpegUnavailableError()
  return api
}

let warned = false
/** Kept for existing builtin npm packages that still forward the old executable setting. */
export function setFFMpegPath(ffmpegPath: string) {
  if (ffmpegPath && !warned) {
    warned = true
    getLogger('ffmpeg').info(`旧版 FFmpeg 可执行文件路径不再使用，需要转码时请安装并启用 ${FFMPEG_PLUGIN} 插件`)
  }
}
