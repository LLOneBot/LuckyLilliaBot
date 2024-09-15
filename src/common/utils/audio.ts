import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import fsPromise from 'node:fs/promises'
import { decode, encode, getDuration, getWavFileInfo, isWav, isSilk, EncodeResult } from 'silk-wasm'
import { TEMP_DIR } from '../globalVars'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { Context } from 'cordis'

interface FFmpegOptions {
  input?: string[]
  output?: string[]
}

type Input = string | Readable

function convert(ctx: Context, input: Input, options: FFmpegOptions): Promise<Buffer>
function convert(ctx: Context, input: Input, options: FFmpegOptions, outputPath: string): Promise<string>
function convert(ctx: Context, input: Input, options: FFmpegOptions, outputPath?: string): Promise<Buffer | string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let command = ffmpeg(input)
      .on('error', err => {
        ctx.logger.error(`FFmpeg处理转换出错: `, err.message)
        reject(err)
      })
      .on('end', () => {
        if (!outputPath) {
          resolve(Buffer.concat(chunks))
        } else {
          resolve(outputPath)
        }
      })
    if (options.input) {
      command = command.inputOptions(options.input)
    }
    if (options.output) {
      command = command.outputOptions(options.output)
    }
    const ffmpegPath: string | undefined = ctx.config.ffmpeg
    if (ffmpegPath) {
      command = command.setFfmpegPath(ffmpegPath)
    }
    if (!outputPath) {
      const stream = command.pipe()
      stream.on('data', chunk => {
        chunks.push(chunk)
      })
    } else {
      command.save(outputPath)
    }
  })
}

export async function encodeSilk(ctx: Context, filePath: string) {
  try {
    const file = await fsPromise.readFile(filePath)
    if (!isSilk(file)) {
      ctx.logger.info(`语音文件${filePath}需要转换成silk`)
      let result: EncodeResult
      const allowSampleRate = [8000, 12000, 16000, 24000, 32000, 44100, 48000]
      if (isWav(file) && allowSampleRate.includes(getWavFileInfo(file).fmt.sampleRate)) {
        result = await encode(file, 0)
      } else {
        const input = await convert(ctx, filePath, {
          output: [
            '-ar 24000',
            '-ac 1',
            '-f s16le'
          ]
        })
        result = await encode(input, 24000)
      }
      const pttPath = path.join(TEMP_DIR, randomUUID())
      await fsPromise.writeFile(pttPath, result.data)
      ctx.logger.info(`语音文件${filePath}转换成功!`, pttPath, `时长:`, result.duration)
      return {
        converted: true,
        path: pttPath,
        duration: result.duration / 1000,
      }
    } else {
      const silk = file
      let duration = 1
      try {
        duration = getDuration(silk) / 1000
      } catch (e) {
        ctx.logger.warn('获取语音文件时长失败, 默认为1秒', filePath, (e as Error).stack)
      }
      return {
        converted: false,
        path: filePath,
        duration,
      }
    }
  } catch (err) {
    ctx.logger.error('convert silk failed', (err as Error).stack)
    return {}
  }
}

type OutFormat = 'mp3' | 'amr' | 'wma' | 'm4a' | 'spx' | 'ogg' | 'wav' | 'flac'

export async function decodeSilk(ctx: Context, inputFilePath: string, outFormat: OutFormat) {
  const silk = await fsPromise.readFile(inputFilePath)
  const { data } = await decode(silk, 24000)
  const tmpPath = path.join(TEMP_DIR, path.basename(inputFilePath))
  const outFilePath = tmpPath + `.${outFormat}`
  const pcmFilePath = tmpPath + '.pcm'
  await fsPromise.writeFile(pcmFilePath, data)
  return convert(ctx, pcmFilePath, {
    input: [
      '-f s16le',
      '-ar 24000',
      '-ac 1'
    ]
  }, outFilePath)
}
