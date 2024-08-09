import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import fsPromise from 'node:fs/promises'
import { decode, encode, getDuration, getWavFileInfo, isWav, isSilk, EncodeResult } from 'silk-wasm'
import { log } from './log'
import { TEMP_DIR } from './index'
import { getConfigUtil } from '../config'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'

interface FFmpegOptions {
  input?: string[]
  output?: string[]
}

type Input = string | Readable

function convert(input: Input, options: FFmpegOptions): Promise<Buffer>
function convert(input: Input, options: FFmpegOptions, outputPath: string): Promise<string>
function convert(input: Input, options: FFmpegOptions, outputPath?: string): Promise<Buffer> | Promise<string> {
  return new Promise<any>((resolve, reject) => {
    const chunks: Buffer[] = []
    let command = ffmpeg(input)
      .on('error', err => {
        log(`FFmpeg处理转换出错: `, err.message)
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
    const ffmpegPath = getConfigUtil().getConfig().ffmpeg
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

export async function encodeSilk(filePath: string) {
  try {
    const file = await fsPromise.readFile(filePath)
    if (!isSilk(file)) {
      log(`语音文件${filePath}需要转换成silk`)
      let result: EncodeResult
      const allowSampleRate = [8000, 12000, 16000, 24000, 32000, 44100, 48000]
      if (isWav(file) && allowSampleRate.includes(getWavFileInfo(file).fmt.sampleRate)) {
        result = await encode(file, 0)
      } else {
        const input = await convert(filePath, {
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
      log(`语音文件${filePath}转换成功!`, pttPath, `时长:`, result.duration)
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
      } catch (e: any) {
        log('获取语音文件时长失败, 默认为1秒', filePath, e.stack)
      }
      return {
        converted: false,
        path: filePath,
        duration,
      }
    }
  } catch (error: any) {
    log('convert silk failed', error.stack)
    return {}
  }
}

type OutFormat = 'mp3' | 'amr' | 'wma' | 'm4a' | 'spx' | 'ogg' | 'wav' | 'flac'

export async function decodeSilk(inputFilePath: string, outFormat: OutFormat = 'mp3') {
  const silk = await fsPromise.readFile(inputFilePath)
  const { data } = await decode(silk, 24000)
  const tmpPath = path.join(TEMP_DIR, path.basename(inputFilePath))
  const outFilePath = tmpPath + `.${outFormat}`
  const pcmFilePath = tmpPath + '.pcm'
  await fsPromise.writeFile(pcmFilePath, data)
  return convert(pcmFilePath, {
    input: [
      '-f s16le',
      '-ar 24000',
      '-ac 1'
    ]
  }, outFilePath)
}