import path from 'node:path'
import { ActionName } from '../types'
import { decodeSilk } from '@/common/utils/audio'
import { BaseAction, Schema } from '../BaseAction'
import { stat, unlink, writeFile } from 'node:fs/promises'
import { TEMP_DIR } from '@/common/globalVars'
import { randomUUID } from 'node:crypto'
import { ChatType } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import { isSilk, isWav } from '@/common/utils/audioFormat'
import { getFFmpegAddon } from '@/common/utils/ffmpeg'

interface Payload {
  file: string
  out_format: 'mp3' | 'amr' | 'wma' | 'm4a' | 'spx' | 'ogg' | 'wav' | 'flac'
}

interface Response {
  /** The converted file, on the bot's machine */
  file: string
  file_size: string
  file_name: string
  /** The original voice (silk / amr), for a client that cannot read the bot's files */
  url: string
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
      let decoded: string
      try {
        decoded = await decodeSilk(this.ctx, silkPath, payload.out_format)
      } finally {
        await unlink(silkPath).catch(() => {})
      }
      return {
        file: decoded,
        file_name: path.basename(decoded),
        file_size: (await stat(decoded)).size.toString(),
        url,
      }
    }
    // An already matching format can be returned without the optional conversion plugin.
    if ((payload.out_format === 'amr' && audioBytes.subarray(0, 5).toString('ascii') === '#!AMR') ||
        (payload.out_format === 'wav' && isWav(audioBytes))) {
      await writeFile(outPath, audioBytes)
      return { file: outPath, file_name: path.basename(outPath), file_size: audioBytes.length.toString(), url }
    }
    const ffmpeg = getFFmpegAddon()
    // 非 silk（QQ 群语音常见是 amr），直接走 ffmpeg 转码
    const head = audioBytes.subarray(0, 4).toString('ascii')
    const ext = head.startsWith('#!AM') ? 'amr' : 'audio'
    const inPath = `${tmpBase}.input.${ext}`
    await writeFile(inPath, audioBytes)
    try {
      await ffmpeg.transcodeAudio(inPath, outPath, { format: payload.out_format })
    } catch (error) {
      await unlink(outPath).catch(() => {})
      throw error
    } finally {
      await unlink(inPath).catch(() => {})
    }
    return {
      file: outPath,
      file_name: path.basename(outPath),
      file_size: (await stat(outPath)).size.toString(),
      url,
    }
  }
}


