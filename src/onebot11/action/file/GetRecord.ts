import path from 'node:path'
import { ActionName } from '../types'
import { decodeSilk } from '@/common/utils/audio'
import { BaseAction, Schema } from '../BaseAction'
import { stat, readFile } from 'node:fs/promises'

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

export default class GetRecord extends BaseAction<Payload, Response> {
  actionName = ActionName.GetRecord
  payloadSchema = Schema.object({
    file: Schema.string().required(),
    out_format: Schema.union(['mp3', 'amr', 'wma', 'm4a', 'spx', 'ogg', 'wav', 'flac']).default('mp3')
  })

  protected async _handle(payload: Payload): Promise<Response> {
    const fileCache = await this.ctx.store.getFileCacheByName(payload.file)
    if (fileCache?.length) {
      const downloadPath = await this.ctx.ntFileApi.downloadMedia(
        fileCache[0].msgId,
        fileCache[0].chatType,
        fileCache[0].peerUid,
        fileCache[0].elementId,
        '',
        ''
      )
      const file = await decodeSilk(this.ctx, downloadPath, payload.out_format)
      const res: Response = {
        file,
        file_name: path.basename(file),
        file_size: (await stat(file)).size.toString()
      }
      if (this.adapter.config.enableLocalFile2Url) {
        res.base64 = await readFile(file, 'base64')
      }
      return res
    }
    throw new Error('file not found')
  }
}
