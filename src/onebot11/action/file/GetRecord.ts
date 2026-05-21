import path from 'node:path'
import { ActionName } from '../types'
import { decodeSilk } from '@/common/utils/audio'
import { BaseAction, Schema } from '../BaseAction'
import { stat, readFile, writeFile } from 'node:fs/promises'
import { TEMP_DIR } from '@/common/globalVars'
import { randomUUID } from 'node:crypto'
import { ChatType } from '@/ntqqapi/types'
import { isSilk } from 'silk-wasm'
import ffmpeg from 'fluent-ffmpeg'

interface Payload {
  file: string
  out_format: 'mp3' | 'amr' | 'wma' | 'm4a' | 'spx' | 'ogg' | 'wav' | 'flac'
}

interface Response {
  file: string
  file_size: string
  file_name: string
  base64?: string
}

function ffmpegConvert(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', err => reject(err))
      .run()
  })
}

export default class GetRecord extends BaseAction<Payload, Response> {
  actionName = ActionName.GetRecord
  payloadSchema = Schema.object({
    file: Schema.string().required(),
    out_format: Schema.union(['mp3', 'amr', 'wma', 'm4a', 'spx', 'ogg', 'wav', 'flac']).default('mp3')
  })

  protected async _handle(payload: Payload): Promise<Response> {
    const fileCache = await this.ctx.store.getFileCacheByName(payload.file)
    if (!fileCache?.length) {
      throw new Error('file not found')
    }
    const cached = fileCache[0]
    const isGroup = cached.chatType === ChatType.Group
    // ptt 走专用接口拿 url（带每次刷新的 rkey），fileUuid 不直接是 URL
    const url = await this.ctx.ntFileApi.getPttUrl(cached.fileUuid, isGroup)
    const resp = await fetch(url)
    if (!resp.ok) {
      throw new Error(`下载语音失败: ${resp.status}`)
    }
    const audioBytes = Buffer.from(await resp.arrayBuffer())
    const tmpBase = path.join(TEMP_DIR, randomUUID())
    const outPath = `${tmpBase}.${payload.out_format}`

    if (isSilk(audioBytes)) {
      const silkPath = `${tmpBase}.silk`
      await writeFile(silkPath, audioBytes)
      const decoded = await decodeSilk(this.ctx, silkPath, payload.out_format)
      const res: Response = {
        file: decoded,
        file_name: path.basename(decoded),
        file_size: (await stat(decoded)).size.toString()
      }
      if (this.adapter.config.enableLocalFile2Url) {
        res.base64 = await readFile(decoded, 'base64')
      }
      return res
    }
    // 非 silk（QQ 群语音常见是 amr），直接走 ffmpeg 转码
    const head = audioBytes.subarray(0, 4).toString('ascii')
    const ext = head.startsWith('#!AM') ? 'amr' : 'audio'
    const inPath = `${tmpBase}.${ext}`
    await writeFile(inPath, audioBytes)
    await ffmpegConvert(inPath, outPath)
    const res: Response = {
      file: outPath,
      file_name: path.basename(outPath),
      file_size: (await stat(outPath)).size.toString()
    }
    if (this.adapter.config.enableLocalFile2Url) {
      res.base64 = await readFile(outPath, 'base64')
    }
    return res
  }
}


