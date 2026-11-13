import path from 'node:path'
import { FFMPEG_PLUGIN, FFmpegUnavailableError, getFFmpegAddon, tryGetFFmpegAddon, type AudioFormat } from './ffmpeg'
import { isSilk } from './audioFormat'
import fsPromise from 'node:fs/promises'
import { TEMP_DIR } from '../globalVars'
import { randomUUID } from 'node:crypto'
import { Context } from 'cordis'

function getSilkAddon() {
  const native = getFFmpegAddon()
  if (typeof native.silkVersion !== 'function') {
    throw new FFmpegUnavailableError(`当前 FFmpeg 插件不支持 SILK，请更新并启用 ${FFMPEG_PLUGIN}（1.1.0 或更新版本）后重试`)
  }
  return native
}

export async function encodeSilk(ctx: Context, filePath: string) {
  const file = await fsPromise.readFile(filePath)
  if (isSilk(file)) {
    let duration = 1
    const native = tryGetFFmpegAddon()
    if (typeof native?.silkVersion === 'function') {
      try {
        duration = (await native.probe(filePath)).duration
      } catch (error) {
        ctx.logger.warn('获取语音文件时长失败，默认为 1 秒', filePath, error)
      }
    } else {
      ctx.logger.warn(`SILK 文件直接发送，时长默认为 1 秒；安装或更新并启用 ${FFMPEG_PLUGIN} 可读取准确时长`)
    }
    return { converted: false, path: filePath, duration }
  }

  const native = getSilkAddon()
  const output = path.join(TEMP_DIR, randomUUID() + '.silk')
  ctx.logger.info(`语音文件 ${filePath} 需要转换成 SILK`)
  try {
    await native.transcodeAudio(filePath, output, { format: 'silk' })
    const { duration } = await native.probe(output)
    return { converted: true, path: output, duration }
  } catch (error) {
    await fsPromise.unlink(output).catch(() => {})
    throw error
  }
}

export async function decodeSilk(ctx: Context, inputFilePath: string, outFormat: AudioFormat) {
  const native = getSilkAddon()
  const output = path.join(TEMP_DIR, randomUUID() + '.' + outFormat)
  try {
    await native.transcodeAudio(inputFilePath, output, { format: outFormat })
    return output
  } catch (error) {
    await fsPromise.unlink(output).catch(() => {})
    ctx.logger.error('SILK 原生转换失败：', error)
    throw error
  }
}
