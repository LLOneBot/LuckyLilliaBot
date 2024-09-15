import path from 'node:path'
import { GetFileBase, GetFilePayload, GetFileResponse } from './GetFile'
import { ActionName } from '../types'
import { decodeSilk } from '@/common/utils/audio'
import { Schema } from '../BaseAction'
import { stat, readFile } from 'node:fs/promises'

interface Payload extends GetFilePayload {
  out_format: 'mp3' | 'amr' | 'wma' | 'm4a' | 'spx' | 'ogg' | 'wav' | 'flac'
}

export default class GetRecord extends GetFileBase {
  actionName = ActionName.GetRecord
  payloadSchema = Schema.object({
    file: Schema.string().required(),
    out_format: Schema.string().default('mp3')
  })

  protected async _handle(payload: Payload): Promise<GetFileResponse> {
    const res = await super._handle(payload)
    res.file = await decodeSilk(this.ctx, res.file!, payload.out_format)
    res.file_name = path.basename(res.file)
    res.file_size = (await stat(res.file)).size.toString()
    if (this.adapter.config.enableLocalFile2Url) {
      res.base64 = await readFile(res.file, 'base64')
    }
    return res
  }
}
